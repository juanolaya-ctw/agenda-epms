-- EPMS — Fase 3: historial automático de cambios (timeline) por speaker
-- NO aplicar en producción sin leer este encabezado.
-- NO ejecutar contra la base desde el repo: el owner lo corre en el SQL Editor.
--
-- Qué agrega
--   Tabla epms.speaker_cambios (append-only; la escriben triggers, no el cliente).
--   Triggers AFTER INSERT/UPDATE/DELETE en epms.speakers y epms.evento_speakers.
--   RLS Agenda-only SELECT. Sin INSERT/UPDATE/DELETE para authenticated.
--   Nit Fase 2: registrar_gestion limpia proximo_seguimiento_nota si viene vacía
--   al setear una p_proxima_at nueva.
--
-- Sin BEGIN/COMMIT (statements sueltos). Idempotente donde aplica.
-- Rollback comentado al final.

-- ── 1) Tabla ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS epms.speaker_cambios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  speaker_id uuid NOT NULL REFERENCES epms.speakers(id) ON DELETE CASCADE,
  evento_id uuid REFERENCES epms.eventos(id) ON DELETE SET NULL,
  ambito text NOT NULL CHECK (ambito IN ('speaker', 'evento_speakers', 'merge')),
  campo text NOT NULL,
  valor_anterior jsonb,
  valor_nuevo jsonb,
  origen text NOT NULL CHECK (
    origen IN ('edicion_equipo', 'tally', 'merge', 'import_excel', 'sistema')
  ),
  actor_id uuid REFERENCES epms.usuarios(id) ON DELETE SET NULL,
  tally_envio_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE epms.speaker_cambios IS
  'Historial append-only de cambios de ficha/membresía. Escrito por triggers; sin FK a evento_speakers.';
COMMENT ON COLUMN epms.speaker_cambios.ambito IS
  'speaker | evento_speakers | merge.';
COMMENT ON COLUMN epms.speaker_cambios.origen IS
  'edicion_equipo | tally | merge | import_excel | sistema. Fase 5 puede forzar vía SET LOCAL epms.cambio_origen.';
COMMENT ON COLUMN epms.speaker_cambios.tally_envio_id IS
  'Sin FK todavía (tally_envios llega en Fase 5).';

CREATE INDEX IF NOT EXISTS idx_speaker_cambios_speaker_created
  ON epms.speaker_cambios (speaker_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_speaker_cambios_evento_created
  ON epms.speaker_cambios (evento_id, created_at DESC);

-- ── 2) RLS Agenda-only (solo SELECT) ─────────────────────────────────────
ALTER TABLE epms.speaker_cambios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agenda_select_speaker_cambios"
  ON epms.speaker_cambios;
CREATE POLICY "agenda_select_speaker_cambios"
  ON epms.speaker_cambios
  FOR SELECT TO authenticated
  USING (epms.mi_area() = 'Agenda');

GRANT SELECT ON epms.speaker_cambios TO authenticated;
-- Default privileges del schema epms dan arw a authenticated en tablas nuevas.
REVOKE ALL ON epms.speaker_cambios FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON epms.speaker_cambios FROM authenticated;
GRANT SELECT, INSERT ON epms.speaker_cambios TO service_role;

-- ── 3) Helpers de contexto (origen / tally_envio_id) ───────────────────────
CREATE OR REPLACE FUNCTION epms.cambio_origen_actual()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = epms, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  BEGIN
    v := nullif(btrim(current_setting('epms.cambio_origen', true)), '');
  EXCEPTION WHEN OTHERS THEN
    v := NULL;
  END;
  IF v IN ('edicion_equipo', 'tally', 'merge', 'import_excel', 'sistema') THEN
    RETURN v;
  END IF;
  IF auth.uid() IS NOT NULL THEN
    RETURN 'edicion_equipo';
  END IF;
  RETURN 'sistema';
END;
$$;

CREATE OR REPLACE FUNCTION epms.cambio_tally_envio_id_actual()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = epms, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  BEGIN
    v := nullif(btrim(current_setting('epms.tally_envio_id', true)), '');
  EXCEPTION WHEN OTHERS THEN
    v := NULL;
  END;
  IF v IS NULL THEN
    RETURN NULL;
  END IF;
  BEGIN
    RETURN v::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION epms.cambio_origen_actual() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION epms.cambio_tally_envio_id_actual() FROM PUBLIC, anon;

-- ── 4) Trigger: epms.speakers ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION epms.trg_speaker_cambios_speakers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = epms, pg_temp
AS $$
DECLARE
  v_origen text := epms.cambio_origen_actual();
  v_actor uuid := auth.uid();
  v_tally uuid := epms.cambio_tally_envio_id_actual();
  v_campos text[] := ARRAY[
    'nombre',
    'email',
    'email_secundario',
    'telefono',
    'linkedin_url',
    'foto_url',
    'tipo_documento',
    'numero_documento',
    'bio',
    'pais',
    'ciudad',
    'cargo',
    'empresa'
  ];
  v_campo text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO epms.speaker_cambios (
      speaker_id, evento_id, ambito, campo,
      valor_anterior, valor_nuevo, origen, actor_id, tally_envio_id
    ) VALUES (
      NEW.id, NULL, 'speaker', 'alta',
      NULL, jsonb_build_object('accion', 'alta'), v_origen, v_actor, v_tally
    );
    RETURN NEW;
  END IF;

  -- UPDATE: una fila por campo distinto
  FOREACH v_campo IN ARRAY v_campos LOOP
    EXECUTE format('SELECT to_jsonb(($1).%I)', v_campo) USING OLD INTO v_old;
    EXECUTE format('SELECT to_jsonb(($1).%I)', v_campo) USING NEW INTO v_new;
    IF v_old IS DISTINCT FROM v_new THEN
      INSERT INTO epms.speaker_cambios (
        speaker_id, evento_id, ambito, campo,
        valor_anterior, valor_nuevo, origen, actor_id, tally_envio_id
      ) VALUES (
        NEW.id, NULL, 'speaker', v_campo,
        v_old, v_new, v_origen, v_actor, v_tally
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_speaker_cambios_speakers ON epms.speakers;
CREATE TRIGGER trg_speaker_cambios_speakers
  AFTER INSERT OR UPDATE OR DELETE ON epms.speakers
  FOR EACH ROW
  EXECUTE FUNCTION epms.trg_speaker_cambios_speakers();

-- ── 5) Trigger: epms.evento_speakers ─────────────────────────────────────
CREATE OR REPLACE FUNCTION epms.trg_speaker_cambios_evento_speakers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = epms, pg_temp
AS $$
DECLARE
  v_origen text := epms.cambio_origen_actual();
  v_actor uuid := auth.uid();
  v_tally uuid := epms.cambio_tally_envio_id_actual();
  v_campos text[] := ARRAY[
    'estado',
    'estado_motivo',
    'responsable_id',
    'responsable_texto',
    'proximo_seguimiento_at',
    'proximo_seguimiento_nota',
    'requiere_viaticos',
    'viaticos_nota',
    'pista_espacio',
    'notas_internas',
    'datos_prospeccion'
  ];
  v_campo text;
  v_old jsonb;
  v_new jsonb;
  v_snap jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO epms.speaker_cambios (
      speaker_id, evento_id, ambito, campo,
      valor_anterior, valor_nuevo, origen, actor_id, tally_envio_id
    ) VALUES (
      NEW.speaker_id,
      NEW.evento_id,
      'evento_speakers',
      'membresia',
      NULL,
      jsonb_build_object('accion', 'asociado', 'estado', NEW.estado),
      v_origen,
      v_actor,
      v_tally
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Eliminar del CRM global: cascade borra membresías mientras el speaker
    -- ya no existe → no insertar (evitar FK / filas huérfanas).
    IF NOT EXISTS (
      SELECT 1 FROM epms.speakers s WHERE s.id = OLD.speaker_id
    ) THEN
      RETURN OLD;
    END IF;

    v_snap := jsonb_build_object('accion', 'desasociado');
    FOREACH v_campo IN ARRAY v_campos LOOP
      EXECUTE format('SELECT to_jsonb(($1).%I)', v_campo) USING OLD INTO v_old;
      v_snap := v_snap || jsonb_build_object(v_campo, v_old);
    END LOOP;

    INSERT INTO epms.speaker_cambios (
      speaker_id, evento_id, ambito, campo,
      valor_anterior, valor_nuevo, origen, actor_id, tally_envio_id
    ) VALUES (
      OLD.speaker_id,
      OLD.evento_id,
      'evento_speakers',
      'membresia',
      v_snap,
      NULL,
      v_origen,
      v_actor,
      v_tally
    );
    RETURN OLD;
  END IF;

  -- UPDATE
  FOREACH v_campo IN ARRAY v_campos LOOP
    EXECUTE format('SELECT to_jsonb(($1).%I)', v_campo) USING OLD INTO v_old;
    EXECUTE format('SELECT to_jsonb(($1).%I)', v_campo) USING NEW INTO v_new;
    IF v_old IS DISTINCT FROM v_new THEN
      INSERT INTO epms.speaker_cambios (
        speaker_id, evento_id, ambito, campo,
        valor_anterior, valor_nuevo, origen, actor_id, tally_envio_id
      ) VALUES (
        NEW.speaker_id,
        NEW.evento_id,
        'evento_speakers',
        v_campo,
        v_old,
        v_new,
        v_origen,
        v_actor,
        v_tally
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_speaker_cambios_evento_speakers ON epms.evento_speakers;
CREATE TRIGGER trg_speaker_cambios_evento_speakers
  AFTER INSERT OR UPDATE OR DELETE ON epms.evento_speakers
  FOR EACH ROW
  EXECUTE FUNCTION epms.trg_speaker_cambios_evento_speakers();

-- ── 6) Nit Fase 2: limpiar nota al setear próxima fecha ──────────────────
CREATE OR REPLACE FUNCTION epms.registrar_gestion(
  p_evento_id uuid,
  p_speaker_id uuid,
  p_tipo text,
  p_nota text,
  p_ocurrida_at timestamptz,
  p_proxima_at timestamptz,
  p_proxima_nota text,
  p_marcar_contactado boolean
)
RETURNS epms.evento_speaker_gestiones
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = epms, pg_temp
AS $$
DECLARE
  v_memb_estado text;
  v_row epms.evento_speaker_gestiones;
BEGIN
  IF p_evento_id IS NULL OR p_speaker_id IS NULL THEN
    RAISE EXCEPTION 'evento_id y speaker_id son obligatorios';
  END IF;
  IF p_tipo IS NULL OR btrim(p_tipo) = '' THEN
    RAISE EXCEPTION 'tipo es obligatorio';
  END IF;
  IF p_ocurrida_at IS NULL THEN
    RAISE EXCEPTION 'ocurrida_at es obligatorio';
  END IF;

  SELECT es.estado
  INTO v_memb_estado
  FROM epms.evento_speakers es
  WHERE es.evento_id = p_evento_id
    AND es.speaker_id = p_speaker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sin membresía en este evento';
  END IF;

  INSERT INTO epms.evento_speaker_gestiones (
    evento_id,
    speaker_id,
    tipo,
    nota,
    ocurrida_at,
    proxima_at,
    creado_por
  )
  VALUES (
    p_evento_id,
    p_speaker_id,
    p_tipo,
    NULLIF(btrim(COALESCE(p_nota, '')), ''),
    p_ocurrida_at,
    p_proxima_at,
    auth.uid()
  )
  RETURNING * INTO v_row;

  IF p_proxima_at IS NOT NULL THEN
    UPDATE epms.evento_speakers
    SET
      proximo_seguimiento_at = p_proxima_at,
      proximo_seguimiento_nota = NULLIF(btrim(COALESCE(p_proxima_nota, '')), ''),
      updated_at = now()
    WHERE evento_id = p_evento_id
      AND speaker_id = p_speaker_id;
  END IF;

  IF COALESCE(p_marcar_contactado, false)
     AND v_memb_estado IN ('PENDIENTE_CONTACTAR', 'SIN_CLASIFICAR') THEN
    UPDATE epms.evento_speakers
    SET
      estado = 'CONTACTADO',
      updated_at = now()
    WHERE evento_id = p_evento_id
      AND speaker_id = p_speaker_id
      AND estado IN ('PENDIENTE_CONTACTAR', 'SIN_CLASIFICAR');
  END IF;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION epms.registrar_gestion(
  uuid, uuid, text, text, timestamptz, timestamptz, text, boolean
) IS
  'Inserta una gestión y opcionalmente actualiza próximo follow-up / CONTACTADO en la membresía.';

REVOKE ALL ON FUNCTION epms.registrar_gestion(
  uuid, uuid, text, text, timestamptz, timestamptz, text, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION epms.registrar_gestion(
  uuid, uuid, text, text, timestamptz, timestamptz, text, boolean
) FROM anon;
GRANT EXECUTE ON FUNCTION epms.registrar_gestion(
  uuid, uuid, text, text, timestamptz, timestamptz, text, boolean
) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (ejecutar a mano solo si hay que deshacer).
--
-- DROP TRIGGER IF EXISTS trg_speaker_cambios_evento_speakers ON epms.evento_speakers;
-- DROP TRIGGER IF EXISTS trg_speaker_cambios_speakers ON epms.speakers;
-- DROP FUNCTION IF EXISTS epms.trg_speaker_cambios_evento_speakers();
-- DROP FUNCTION IF EXISTS epms.trg_speaker_cambios_speakers();
-- DROP FUNCTION IF EXISTS epms.cambio_tally_envio_id_actual();
-- DROP FUNCTION IF EXISTS epms.cambio_origen_actual();
-- DROP POLICY IF EXISTS "agenda_select_speaker_cambios" ON epms.speaker_cambios;
-- DROP TABLE IF EXISTS epms.speaker_cambios;
-- -- Reaplicar registrar_gestion de Fase 2 si hace falta restaurar el CASE de nota.
-- ─────────────────────────────────────────────────────────────────────────────
