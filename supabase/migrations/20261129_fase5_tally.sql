-- EPMS — Fase 5: Formularios Tally por evento (tally_envios + RPC)
-- NO aplicar en producción sin leer este encabezado.
-- NO ejecutar contra la base desde el repo: el owner lo corre en el SQL Editor.
--
-- Statements sueltos (sin BEGIN/COMMIT de transacción). Idempotente donde aplica.
-- Rollback comentado al final.
--
-- Orden de deploy: 1) esta migración 2) edge function 3) verificar.
-- Mientras no se aplique el bloque 1a, la función v17 (Fase 0) falla por grants.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1a) Grants de service_role que faltan
-- Independiente: puede aplicarse solo como hotfix (sin el resto de la Fase 5).
-- ═══════════════════════════════════════════════════════════════════════════
GRANT SELECT ON epms.tally_formularios TO service_role;
GRANT SELECT, INSERT ON epms.evento_speakers TO service_role;
GRANT SELECT, INSERT ON epms.evento_speaker_gestiones TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1b) mapeo_campos opcional por formulario
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE epms.tally_formularios
  ADD COLUMN IF NOT EXISTS mapeo_campos jsonb;

COMMENT ON COLUMN epms.tally_formularios.mapeo_campos IS
  'Overrides opcionales del FIELD_MAP por formulario: { "<label normalizado>": "<campo destino>" }. '
  'Destinos permitidos: pais, ciudad, linkedin_url, tipo_documento, numero_documento, empresa, cargo, '
  'email_secundario, foto_url, telefono. Nunca nombre, email, toolkit_slug ni link_pieza_*/estado_pieza. '
  'Se llena por SQL; sin UI en Fase 5.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1c) tally_envios — un envío por fila, contenido inmutable
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS epms.tally_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave text NOT NULL,
  tally_form_id text,
  tally_submission_id text,
  evento_id uuid REFERENCES epms.eventos(id) ON DELETE SET NULL,
  speaker_id uuid REFERENCES epms.speakers(id) ON DELETE SET NULL,
  estado text NOT NULL DEFAULT 'recibido'
    CHECK (estado IN (
      'recibido',
      'auto_vinculado',
      'creado',
      'pendiente_revision',
      'aceptado',
      'rechazado',
      'formulario_desconocido',
      'invalido'
    )),
  razon text,
  candidatos jsonb,
  conflictos jsonb,
  campos jsonb NOT NULL DEFAULT '{}'::jsonb,
  respuestas jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload_raw jsonb NOT NULL,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  procesado_at timestamptz,
  CONSTRAINT tally_envios_clave_unique UNIQUE (clave)
);

COMMENT ON TABLE epms.tally_envios IS
  'Envíos Tally inmutables en su contenido. Idempotencia por clave. PII: solo Agenda.';

CREATE INDEX IF NOT EXISTS idx_tally_envios_evento_created
  ON epms.tally_envios (evento_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tally_envios_speaker
  ON epms.tally_envios (speaker_id);

CREATE INDEX IF NOT EXISTS idx_tally_envios_pendiente_revision
  ON epms.tally_envios (evento_id)
  WHERE estado = 'pendiente_revision';

CREATE OR REPLACE FUNCTION epms.tally_envios_inmutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.clave IS DISTINCT FROM OLD.clave
    OR NEW.tally_form_id IS DISTINCT FROM OLD.tally_form_id
    OR NEW.tally_submission_id IS DISTINCT FROM OLD.tally_submission_id
    OR NEW.campos IS DISTINCT FROM OLD.campos
    OR NEW.respuestas IS DISTINCT FROM OLD.respuestas
    OR NEW.payload_raw IS DISTINCT FROM OLD.payload_raw
    OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'tally_envios: columnas de contenido son inmutables'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tally_envios_inmutable ON epms.tally_envios;
CREATE TRIGGER trg_tally_envios_inmutable
  BEFORE UPDATE ON epms.tally_envios
  FOR EACH ROW
  EXECUTE FUNCTION epms.tally_envios_inmutable();

REVOKE ALL ON FUNCTION epms.tally_envios_inmutable() FROM PUBLIC, anon, authenticated;

ALTER TABLE epms.tally_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agenda_select_tally_envios" ON epms.tally_envios;
CREATE POLICY "agenda_select_tally_envios"
  ON epms.tally_envios
  FOR SELECT TO authenticated
  USING (epms.mi_area() = 'Agenda');

GRANT SELECT ON epms.tally_envios TO authenticated;
REVOKE ALL ON epms.tally_envios FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON epms.tally_envios FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON epms.tally_envios TO service_role;

-- Default privileges del schema dan INSERT/SELECT/UPDATE a authenticated en tablas nuevas;
-- reafirmar el REVOKE tras CREATE.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON epms.tally_envios FROM authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1d) Columnas de enlace
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE epms.evento_speakers
  ADD COLUMN IF NOT EXISTS tally_envio_aceptado_id uuid
    REFERENCES epms.tally_envios(id) ON DELETE SET NULL;

COMMENT ON COLUMN epms.evento_speakers.tally_envio_aceptado_id IS
  'Último envío Tally vinculado sin dudas (auto_vinculado o creado). No se llena en pendiente_revision.';

ALTER TABLE epms.evento_speaker_gestiones
  ADD COLUMN IF NOT EXISTS tally_envio_id uuid
    REFERENCES epms.tally_envios(id) ON DELETE SET NULL;

COMMENT ON COLUMN epms.evento_speaker_gestiones.tally_envio_id IS
  'Envío Tally que originó esta gestión (a lo sumo una por envío).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_evento_speaker_gestiones_tally_envio
  ON epms.evento_speaker_gestiones (tally_envio_id)
  WHERE tally_envio_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'speaker_cambios_tally_envio_fk'
      AND conrelid = 'epms.speaker_cambios'::regclass
  ) THEN
    ALTER TABLE epms.speaker_cambios
      ADD CONSTRAINT speaker_cambios_tally_envio_fk
      FOREIGN KEY (tally_envio_id) REFERENCES epms.tally_envios(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1e) tally_duplicados_pendientes — obsoleta (no migrar filas)
-- ═══════════════════════════════════════════════════════════════════════════
COMMENT ON TABLE epms.tally_duplicados_pendientes IS
  'Obsoleta desde la Fase 5; los envíos nuevos viven en tally_envios. Migración de filas pendientes: Fase 6.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1f) RPC registrar_tally_envio (solo service_role)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION epms.registrar_tally_envio(
  p_clave text,
  p_form_id text,
  p_evento_id uuid,
  p_submission_id text,
  p_submitted_at timestamptz,
  p_payload jsonb,
  p_campos jsonb,
  p_respuestas jsonb,
  p_toolkit_slug text,
  p_modo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = epms, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_exist epms.tally_envios%ROWTYPE;
  v_campos jsonb := coalesce(p_campos, '{}'::jsonb);
  v_respuestas jsonb := coalesce(p_respuestas, '[]'::jsonb);
  v_nombre text;
  v_email text;
  v_empresa text;
  v_speaker_id uuid;
  v_email_match uuid;
  v_estado text;
  v_razon text;
  v_candidatos jsonb := '[]'::jsonb;
  v_conflictos jsonb := '[]'::jsonb;
  v_speaker_creado boolean := false;
  v_cand_count int := 0;
  v_cand_razon text;
  v_nombre_norm text;
  v_empresa_norm text;
  v_sp epms.speakers%ROWTYPE;
  v_sp_nombre_norm text;
  v_campo text;
  v_val_tally text;
  v_val_hub text;
  v_hub_cmp text;
  v_tal_cmp text;
  v_fill jsonb := '{}'::jsonb;
BEGIN
  IF p_modo IS NULL OR p_modo NOT IN ('procesar', 'invalido', 'desconocido') THEN
    RAISE EXCEPTION 'p_modo inválido';
  END IF;

  IF p_clave IS NULL OR btrim(p_clave) = '' THEN
    RAISE EXCEPTION 'p_clave obligatorio';
  END IF;

  IF p_payload IS NULL THEN
    RAISE EXCEPTION 'p_payload obligatorio';
  END IF;

  INSERT INTO epms.tally_envios (
    clave,
    tally_form_id,
    tally_submission_id,
    evento_id,
    estado,
    campos,
    respuestas,
    payload_raw,
    submitted_at
  ) VALUES (
    btrim(p_clave),
    nullif(btrim(coalesce(p_form_id, '')), ''),
    nullif(btrim(coalesce(p_submission_id, '')), ''),
    CASE WHEN p_modo = 'desconocido' THEN NULL ELSE p_evento_id END,
    'recibido',
    v_campos,
    v_respuestas,
    p_payload,
    p_submitted_at
  )
  ON CONFLICT (clave) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT * INTO v_exist
    FROM epms.tally_envios
    WHERE clave = btrim(p_clave);

    RETURN jsonb_build_object(
      'envio_id', v_exist.id,
      'estado', v_exist.estado,
      'razon', v_exist.razon,
      'speaker_id', v_exist.speaker_id,
      'evento_id', v_exist.evento_id,
      'replay', true
    );
  END IF;

  -- ── modos terminales sin speakers ──────────────────────────────────────
  IF p_modo = 'desconocido' THEN
    UPDATE epms.tally_envios
    SET
      estado = 'formulario_desconocido',
      razon = 'formulario_desconocido',
      evento_id = NULL,
      procesado_at = now()
    WHERE id = v_id;

    RETURN jsonb_build_object(
      'envio_id', v_id,
      'estado', 'formulario_desconocido',
      'razon', 'formulario_desconocido',
      'speaker_id', NULL,
      'evento_id', NULL,
      'replay', false,
      'speaker_creado', false
    );
  END IF;

  IF p_modo = 'invalido' THEN
    UPDATE epms.tally_envios
    SET
      estado = 'invalido',
      razon = 'payload_invalido',
      evento_id = p_evento_id,
      procesado_at = now()
    WHERE id = v_id;

    RETURN jsonb_build_object(
      'envio_id', v_id,
      'estado', 'invalido',
      'razon', 'payload_invalido',
      'speaker_id', NULL,
      'evento_id', p_evento_id,
      'replay', false,
      'speaker_creado', false
    );
  END IF;

  -- ── procesar ───────────────────────────────────────────────────────────
  v_nombre := nullif(btrim(coalesce(v_campos->>'nombre', '')), '');
  v_email := nullif(lower(btrim(coalesce(v_campos->>'email', ''))), '');
  v_empresa := nullif(btrim(coalesce(v_campos->>'empresa', '')), '');

  IF p_evento_id IS NULL OR v_nombre IS NULL OR v_email IS NULL THEN
    UPDATE epms.tally_envios
    SET
      estado = 'invalido',
      razon = 'payload_invalido',
      evento_id = p_evento_id,
      procesado_at = now()
    WHERE id = v_id;

    RETURN jsonb_build_object(
      'envio_id', v_id,
      'estado', 'invalido',
      'razon', 'payload_invalido',
      'speaker_id', NULL,
      'evento_id', p_evento_id,
      'replay', false,
      'speaker_creado', false
    );
  END IF;

  PERFORM set_config('epms.cambio_origen', 'tally', true);
  PERFORM set_config('epms.tally_envio_id', v_id::text, true);

  v_nombre_norm := epms.normalizar_texto_match(v_nombre);
  v_empresa_norm := epms.normalizar_texto_match(v_empresa);

  -- Match email (0 o 1 por índice único)
  SELECT s.id INTO v_email_match
  FROM epms.speakers s
  WHERE s.email IS NOT NULL
    AND lower(btrim(s.email)) = v_email
  LIMIT 1;

  -- Candidatos por nombre (excluye el match de email)
  SELECT
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'speaker_id', x.id,
          'razon', x.razon_match
        )
        ORDER BY x.razon_match, x.id
      ) FILTER (WHERE x.rn <= 5),
      '[]'::jsonb
    ),
    count(*)::int,
    CASE
      WHEN count(*) >= 2 THEN 'multiples_candidatos'
      WHEN count(*) = 1 AND bool_or(x.razon_match = 'nombre+empresa') THEN 'nombre+empresa'
      WHEN count(*) = 1 THEN 'nombre_solo'
      ELSE NULL
    END
  INTO v_candidatos, v_cand_count, v_cand_razon
  FROM (
    SELECT
      s.id,
      CASE
        WHEN v_empresa_norm IS NOT NULL
          AND epms.normalizar_texto_match(s.empresa) IS NOT DISTINCT FROM v_empresa_norm
        THEN 'nombre+empresa'
        ELSE 'nombre_solo'
      END AS razon_match,
      row_number() OVER (
        ORDER BY
          CASE
            WHEN v_empresa_norm IS NOT NULL
              AND epms.normalizar_texto_match(s.empresa) IS NOT DISTINCT FROM v_empresa_norm
            THEN 0 ELSE 1
          END,
          s.id
      ) AS rn
    FROM epms.speakers s
    WHERE epms.normalizar_texto_match(s.nombre) IS NOT DISTINCT FROM v_nombre_norm
      AND (v_email_match IS NULL OR s.id IS DISTINCT FROM v_email_match)
  ) x;

  IF v_email_match IS NOT NULL THEN
    -- ── Vinculación por email exacto ─────────────────────────────────────
    v_speaker_id := v_email_match;
    SELECT * INTO v_sp FROM epms.speakers WHERE id = v_speaker_id;

    FOREACH v_campo IN ARRAY ARRAY[
      'telefono',
      'linkedin_url',
      'tipo_documento',
      'numero_documento',
      'pais',
      'ciudad',
      'cargo',
      'empresa',
      'email_secundario',
      'foto_url'
    ]
    LOOP
      v_val_tally := nullif(btrim(coalesce(v_campos->>v_campo, '')), '');
      IF v_val_tally IS NULL THEN
        CONTINUE;
      END IF;

      EXECUTE format('SELECT ($1).%I', v_campo)
        INTO v_val_hub
        USING v_sp;

      IF v_val_hub IS NULL OR btrim(v_val_hub) = '' THEN
        v_fill := v_fill || jsonb_build_object(v_campo, v_val_tally);
        CONTINUE;
      END IF;

      -- foto_url: nunca conflicto ni overwrite
      IF v_campo = 'foto_url' THEN
        CONTINUE;
      END IF;

      IF v_campo = 'telefono' THEN
        v_hub_cmp := regexp_replace(v_val_hub, '[^0-9]', '', 'g');
        v_tal_cmp := regexp_replace(v_val_tally, '[^0-9]', '', 'g');
      ELSIF v_campo IN ('linkedin_url', 'email_secundario') THEN
        v_hub_cmp := lower(btrim(v_val_hub));
        v_hub_cmp := regexp_replace(v_hub_cmp, '/+$', '');
        v_tal_cmp := lower(btrim(v_val_tally));
        v_tal_cmp := regexp_replace(v_tal_cmp, '/+$', '');
      ELSE
        v_hub_cmp := epms.normalizar_texto_match(v_val_hub);
        v_tal_cmp := epms.normalizar_texto_match(v_val_tally);
      END IF;

      IF v_hub_cmp IS DISTINCT FROM v_tal_cmp THEN
        v_conflictos := v_conflictos || jsonb_build_array(
          jsonb_build_object(
            'campo', v_campo,
            'valor_actual', v_val_hub,
            'valor_tally', v_val_tally
          )
        );
      END IF;
    END LOOP;

    IF v_fill <> '{}'::jsonb THEN
      UPDATE epms.speakers s SET
        telefono = CASE
          WHEN v_fill ? 'telefono' AND (s.telefono IS NULL OR btrim(s.telefono) = '')
          THEN v_fill->>'telefono' ELSE s.telefono END,
        linkedin_url = CASE
          WHEN v_fill ? 'linkedin_url' AND (s.linkedin_url IS NULL OR btrim(s.linkedin_url) = '')
          THEN v_fill->>'linkedin_url' ELSE s.linkedin_url END,
        tipo_documento = CASE
          WHEN v_fill ? 'tipo_documento' AND (s.tipo_documento IS NULL OR btrim(s.tipo_documento) = '')
          THEN v_fill->>'tipo_documento' ELSE s.tipo_documento END,
        numero_documento = CASE
          WHEN v_fill ? 'numero_documento' AND (s.numero_documento IS NULL OR btrim(s.numero_documento) = '')
          THEN v_fill->>'numero_documento' ELSE s.numero_documento END,
        pais = CASE
          WHEN v_fill ? 'pais' AND (s.pais IS NULL OR btrim(s.pais) = '')
          THEN v_fill->>'pais' ELSE s.pais END,
        ciudad = CASE
          WHEN v_fill ? 'ciudad' AND (s.ciudad IS NULL OR btrim(s.ciudad) = '')
          THEN v_fill->>'ciudad' ELSE s.ciudad END,
        cargo = CASE
          WHEN v_fill ? 'cargo' AND (s.cargo IS NULL OR btrim(s.cargo) = '')
          THEN v_fill->>'cargo' ELSE s.cargo END,
        empresa = CASE
          WHEN v_fill ? 'empresa' AND (s.empresa IS NULL OR btrim(s.empresa) = '')
          THEN v_fill->>'empresa' ELSE s.empresa END,
        email_secundario = CASE
          WHEN v_fill ? 'email_secundario' AND (s.email_secundario IS NULL OR btrim(s.email_secundario) = '')
          THEN v_fill->>'email_secundario' ELSE s.email_secundario END,
        foto_url = CASE
          WHEN v_fill ? 'foto_url' AND (s.foto_url IS NULL OR btrim(s.foto_url) = '')
          THEN v_fill->>'foto_url' ELSE s.foto_url END
      WHERE s.id = v_speaker_id;
    END IF;

    v_sp_nombre_norm := epms.normalizar_texto_match(v_sp.nombre);

    IF v_cand_count > 0 AND v_sp_nombre_norm IS DISTINCT FROM v_nombre_norm THEN
      v_estado := 'pendiente_revision';
      v_razon := 'email_otra_persona';
    ELSIF jsonb_array_length(v_conflictos) > 0 THEN
      v_estado := 'pendiente_revision';
      v_razon := 'email_exacto_con_conflictos';
    ELSE
      v_estado := 'auto_vinculado';
      v_razon := 'email_exacto';
    END IF;

  ELSE
    -- ── Sin match de email: crear speaker ────────────────────────────────
    BEGIN
      INSERT INTO epms.speakers (
        nombre,
        email,
        telefono,
        linkedin_url,
        tipo_documento,
        numero_documento,
        pais,
        ciudad,
        cargo,
        empresa,
        email_secundario,
        foto_url,
        fuente
      ) VALUES (
        v_nombre,
        v_email,
        nullif(btrim(coalesce(v_campos->>'telefono', '')), ''),
        nullif(btrim(coalesce(v_campos->>'linkedin_url', '')), ''),
        nullif(btrim(coalesce(v_campos->>'tipo_documento', '')), ''),
        nullif(btrim(coalesce(v_campos->>'numero_documento', '')), ''),
        nullif(btrim(coalesce(v_campos->>'pais', '')), ''),
        nullif(btrim(coalesce(v_campos->>'ciudad', '')), ''),
        nullif(btrim(coalesce(v_campos->>'cargo', '')), ''),
        nullif(btrim(coalesce(v_campos->>'empresa', '')), ''),
        nullif(btrim(coalesce(v_campos->>'email_secundario', '')), ''),
        nullif(btrim(coalesce(v_campos->>'foto_url', '')), ''),
        'tally'
      )
      RETURNING id INTO v_speaker_id;
      v_speaker_creado := true;
    EXCEPTION
      WHEN unique_violation THEN
        -- Carrera: otro envío creó el mismo email → tratar como match email
        SELECT s.id INTO v_email_match
        FROM epms.speakers s
        WHERE s.email IS NOT NULL
          AND lower(btrim(s.email)) = v_email
        LIMIT 1;
        IF v_email_match IS NULL THEN
          RAISE;
        END IF;
        v_speaker_id := v_email_match;
        v_speaker_creado := false;
        v_estado := 'auto_vinculado';
        v_razon := 'email_exacto';
        -- Conserva candidatos por nombre para posible email_otra_persona
        SELECT * INTO v_sp FROM epms.speakers WHERE id = v_speaker_id;
        v_sp_nombre_norm := epms.normalizar_texto_match(v_sp.nombre);
        IF v_cand_count > 0 AND v_sp_nombre_norm IS DISTINCT FROM v_nombre_norm THEN
          v_estado := 'pendiente_revision';
          v_razon := 'email_otra_persona';
        END IF;
    END;

    IF v_speaker_creado THEN
      IF v_cand_count = 0 THEN
        v_estado := 'creado';
        v_razon := 'sin_coincidencia';
      ELSE
        v_estado := 'pendiente_revision';
        v_razon := coalesce(v_cand_razon, 'nombre_solo');
      END IF;
    END IF;
  END IF;

  -- Membresía del evento
  INSERT INTO epms.evento_speakers (evento_id, speaker_id, estado, toolkit_slug)
  VALUES (
    p_evento_id,
    v_speaker_id,
    'PENDIENTE_CONTACTAR',
    CASE
      WHEN v_speaker_creado THEN nullif(btrim(coalesce(p_toolkit_slug, '')), '')
      ELSE NULL
    END
  )
  ON CONFLICT (evento_id, speaker_id) DO NOTHING;

  IF v_estado IN ('auto_vinculado', 'creado') THEN
    UPDATE epms.evento_speakers
    SET tally_envio_aceptado_id = v_id
    WHERE evento_id = p_evento_id
      AND speaker_id = v_speaker_id;
  END IF;

  -- Gestión (también en pendiente_revision); a lo sumo una por envío
  BEGIN
    INSERT INTO epms.evento_speaker_gestiones (
      evento_id,
      speaker_id,
      tipo,
      nota,
      ocurrida_at,
      creado_por,
      tally_envio_id
    ) VALUES (
      p_evento_id,
      v_speaker_id,
      'otro',
      'Formulario Tally recibido',
      coalesce(p_submitted_at, now()),
      NULL,
      v_id
    );
  EXCEPTION
    WHEN unique_violation THEN
      NULL; -- ya existe gestión para este tally_envio_id
  END;

  UPDATE epms.tally_envios
  SET
    speaker_id = v_speaker_id,
    evento_id = p_evento_id,
    estado = v_estado,
    razon = v_razon,
    candidatos = CASE WHEN v_cand_count > 0 THEN v_candidatos ELSE NULL END,
    conflictos = CASE
      WHEN jsonb_array_length(v_conflictos) > 0 THEN v_conflictos
      ELSE NULL
    END,
    procesado_at = now()
  WHERE id = v_id;

  RETURN jsonb_build_object(
    'envio_id', v_id,
    'estado', v_estado,
    'razon', v_razon,
    'speaker_id', v_speaker_id,
    'evento_id', p_evento_id,
    'replay', false,
    'speaker_creado', v_speaker_creado
  );
END;
$$;

REVOKE ALL ON FUNCTION epms.registrar_tally_envio(
  text, text, uuid, text, timestamptz, jsonb, jsonb, jsonb, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION epms.registrar_tally_envio(
  text, text, uuid, text, timestamptz, jsonb, jsonb, jsonb, text, text
) TO service_role;

-- ROLLBACK (ejecutar a mano solo si hay que deshacer).
--
-- DROP FUNCTION IF EXISTS epms.registrar_tally_envio(text, text, uuid, text, timestamptz, jsonb, jsonb, jsonb, text, text);
-- ALTER TABLE epms.speaker_cambios DROP CONSTRAINT IF EXISTS speaker_cambios_tally_envio_fk;
-- DROP INDEX IF EXISTS epms.idx_evento_speaker_gestiones_tally_envio;
-- ALTER TABLE epms.evento_speaker_gestiones DROP COLUMN IF EXISTS tally_envio_id;
-- ALTER TABLE epms.evento_speakers DROP COLUMN IF EXISTS tally_envio_aceptado_id;
-- DROP TRIGGER IF EXISTS trg_tally_envios_inmutable ON epms.tally_envios;
-- DROP FUNCTION IF EXISTS epms.tally_envios_inmutable();
-- DROP POLICY IF EXISTS "agenda_select_tally_envios" ON epms.tally_envios;
-- DROP TABLE IF EXISTS epms.tally_envios;
-- ALTER TABLE epms.tally_formularios DROP COLUMN IF EXISTS mapeo_campos;
-- COMMENT ON TABLE epms.tally_duplicados_pendientes IS NULL;
-- -- No revocar los GRANT del hotfix 1a automáticamente (pueden seguir haciendo falta).
