-- EPMS — Fase 4: importar Excel/CSV de speakers
-- NO aplicar en producción sin leer este encabezado.
-- NO ejecutar contra la base desde el repo: el owner lo corre en el SQL Editor.
--
-- Qué agrega
--   Tabla epms.import_lotes (metadatos de cada corrida).
--   Columna import_clave + unique parcial en evento_speaker_gestiones.
--   epms.normalizar_texto_match(text) IMMUTABLE (paridad con TS).
--   RPCs: crear_import_lote, cerrar_import_lote, importar_speakers_lote
--   (SECURITY DEFINER, Agenda-only; set_config cambio_origen = import_excel).
--
-- Sin BEGIN/COMMIT (statements sueltos). Idempotente donde aplica.
-- Rollback comentado al final.

-- ── 1) import_lotes ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS epms.import_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid REFERENCES epms.eventos(id) ON DELETE SET NULL,
  archivo_nombre text,
  archivo_sha256 text,
  hoja text,
  mapeo jsonb,
  resumen jsonb,
  estado text NOT NULL DEFAULT 'en_curso'
    CHECK (estado IN ('en_curso', 'completado', 'parcial')),
  creado_por uuid REFERENCES epms.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

COMMENT ON TABLE epms.import_lotes IS
  'Auditoría de corridas de import Excel/CSV. Sin contenido del archivo ni filas crudas.';

ALTER TABLE epms.import_lotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agenda_select_import_lotes" ON epms.import_lotes;
CREATE POLICY "agenda_select_import_lotes"
  ON epms.import_lotes
  FOR SELECT TO authenticated
  USING (epms.mi_area() = 'Agenda');

GRANT SELECT ON epms.import_lotes TO authenticated;
REVOKE ALL ON epms.import_lotes FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON epms.import_lotes FROM authenticated;

-- ── 2) Idempotencia gestiones ─────────────────────────────────────────────
ALTER TABLE epms.evento_speaker_gestiones
  ADD COLUMN IF NOT EXISTS import_clave text;

COMMENT ON COLUMN epms.evento_speaker_gestiones.import_clave IS
  'Clave de idempotencia del import: evento_id:speaker_id:tipo:YYYY-MM-DD.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_evento_speaker_gestiones_import_clave
  ON epms.evento_speaker_gestiones (import_clave)
  WHERE import_clave IS NOT NULL;

-- ── 3) normalizar_texto_match (paridad con TS) ────────────────────────────
CREATE OR REPLACE FUNCTION epms.normalizar_texto_match(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(
    trim(
      regexp_replace(
        regexp_replace(
          lower(
            translate(
              coalesce(p, ''),
              'ÁÀÄÂÃáàäâãÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔÕóòöôõÚÙÜÛúùüûÑñÇç',
              'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc'
            )
          ),
          '[^a-z0-9[:space:]]',
          ' ',
          'g'
        ),
        '[[:space:]]+',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

REVOKE ALL ON FUNCTION epms.normalizar_texto_match(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION epms.normalizar_texto_match(text) TO authenticated;

-- ── 4) crear_import_lote ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION epms.crear_import_lote(
  p_evento_id uuid,
  p_archivo_nombre text,
  p_archivo_sha256 text,
  p_hoja text,
  p_mapeo jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = epms, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF epms.mi_area() IS DISTINCT FROM 'Agenda' THEN
    RAISE EXCEPTION 'Solo Agenda puede importar'
      USING ERRCODE = '42501';
  END IF;

  IF p_evento_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM epms.eventos e WHERE e.id = p_evento_id
  ) THEN
    RAISE EXCEPTION 'Evento no encontrado';
  END IF;

  INSERT INTO epms.import_lotes (
    evento_id, archivo_nombre, archivo_sha256, hoja, mapeo,
    resumen, estado, creado_por, updated_at
  ) VALUES (
    p_evento_id,
    nullif(btrim(coalesce(p_archivo_nombre, '')), ''),
    nullif(btrim(coalesce(p_archivo_sha256, '')), ''),
    nullif(btrim(coalesce(p_hoja, '')), ''),
    coalesce(p_mapeo, '{}'::jsonb),
    '{}'::jsonb,
    'en_curso',
    auth.uid(),
    now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION epms.crear_import_lote(uuid, text, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION epms.crear_import_lote(uuid, text, text, text, jsonb)
  TO authenticated;

-- ── 5) cerrar_import_lote ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION epms.cerrar_import_lote(
  p_lote_id uuid,
  p_estado text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = epms, pg_temp
AS $$
BEGIN
  IF epms.mi_area() IS DISTINCT FROM 'Agenda' THEN
    RAISE EXCEPTION 'Solo Agenda puede importar'
      USING ERRCODE = '42501';
  END IF;

  IF p_estado IS NULL OR p_estado NOT IN ('completado', 'parcial') THEN
    RAISE EXCEPTION 'estado inválido (completado|parcial)';
  END IF;

  UPDATE epms.import_lotes
  SET
    estado = p_estado,
    updated_at = now()
  WHERE id = p_lote_id
    AND creado_por = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote no encontrado o no pertenece al usuario';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION epms.cerrar_import_lote(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION epms.cerrar_import_lote(uuid, text)
  TO authenticated;

-- ── 6) importar_speakers_lote ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION epms.importar_speakers_lote(
  p_lote_id uuid,
  p_evento_id uuid,
  p_filas jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = epms, pg_temp
AS $$
DECLARE
  v_fila jsonb;
  v_idx int;
  v_accion text;
  v_speaker_id uuid;
  v_nombre text;
  v_email text;
  v_empresa text;
  v_cargo text;
  v_pais text;
  v_nombre_norm text;
  v_empresa_norm text;
  v_found_id uuid;
  v_sp epms.speakers%ROWTYPE;
  v_memb epms.evento_speakers%ROWTYPE;
  v_tiene_memb boolean;
  v_estado text;
  v_estado_motivo text;
  v_sobrescribir_estado boolean;
  v_requiere_viaticos boolean;
  v_responsable_texto text;
  v_proximo_nota text;
  v_notas_internas text;
  v_pista text;
  v_datos jsonb;
  v_gestiones jsonb;
  v_g jsonb;
  v_tipo text;
  v_fecha text;
  v_clave text;
  v_inserted boolean;
  v_reasignada boolean;
  v_resultados jsonb := '[]'::jsonb;
  v_creados int := 0;
  v_actualizados int := 0;
  v_omitidos int := 0;
  v_errores int := 0;
  v_gest_ins int := 0;
  v_gest_exist int := 0;
  v_resumen jsonb;
  v_prev_resumen jsonb;
  v_campos_upd text[];
  v_nuevo_cargo text;
  v_nuevo_empresa text;
  v_nuevo_pais text;
  v_nuevo_email text;
  v_memb_changed boolean;
  v_new_datos jsonb;
  v_occurs_at timestamptz;
BEGIN
  IF epms.mi_area() IS DISTINCT FROM 'Agenda' THEN
    RAISE EXCEPTION 'Solo Agenda puede importar'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM epms.import_lotes l
    WHERE l.id = p_lote_id AND l.creado_por = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Lote no encontrado o no pertenece al usuario';
  END IF;

  IF p_evento_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM epms.eventos e WHERE e.id = p_evento_id
  ) THEN
    RAISE EXCEPTION 'Evento no encontrado';
  END IF;

  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'p_filas debe ser un arreglo JSON';
  END IF;

  PERFORM set_config('epms.cambio_origen', 'import_excel', true);

  FOR v_fila IN SELECT * FROM jsonb_array_elements(p_filas)
  LOOP
    BEGIN
      v_idx := coalesce((v_fila->>'fila_idx')::int, -1);
      v_accion := lower(btrim(coalesce(v_fila->>'accion', '')));
      v_reasignada := false;
      v_speaker_id := NULL;

      IF v_accion = 'omitir' THEN
        v_omitidos := v_omitidos + 1;
        v_resultados := v_resultados || jsonb_build_array(jsonb_build_object(
          'fila_idx', v_idx,
          'ok', true,
          'accion', 'omitir'
        ));
        CONTINUE;
      END IF;

      IF v_accion NOT IN ('crear', 'actualizar') THEN
        v_errores := v_errores + 1;
        v_resultados := v_resultados || jsonb_build_array(jsonb_build_object(
          'fila_idx', v_idx,
          'ok', false,
          'error', 'Acción inválida'
        ));
        CONTINUE;
      END IF;

      v_nombre := nullif(btrim(coalesce(v_fila->>'nombre', '')), '');
      IF v_nombre IS NULL THEN
        v_errores := v_errores + 1;
        v_resultados := v_resultados || jsonb_build_array(jsonb_build_object(
          'fila_idx', v_idx,
          'ok', false,
          'error', 'Fila sin nombre'
        ));
        CONTINUE;
      END IF;

      v_email := nullif(lower(btrim(coalesce(v_fila->>'email', ''))), '');
      v_empresa := nullif(btrim(coalesce(v_fila->>'empresa', '')), '');
      v_cargo := nullif(btrim(coalesce(v_fila->>'cargo', '')), '');
      v_pais := nullif(btrim(coalesce(v_fila->>'pais', '')), '');
      v_nombre_norm := epms.normalizar_texto_match(v_nombre);
      v_empresa_norm := epms.normalizar_texto_match(v_empresa);

      IF v_accion = 'actualizar' THEN
        BEGIN
          v_speaker_id := (v_fila->>'speaker_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
          v_speaker_id := NULL;
        END;
        IF v_speaker_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM epms.speakers s WHERE s.id = v_speaker_id
        ) THEN
          v_errores := v_errores + 1;
          v_resultados := v_resultados || jsonb_build_array(jsonb_build_object(
            'fila_idx', v_idx,
            'ok', false,
            'error', 'speaker_id inexistente'
          ));
          CONTINUE;
        END IF;
      END IF;

      -- crear: re-check existencia
      IF v_accion = 'crear' THEN
        v_found_id := NULL;
        IF v_email IS NOT NULL THEN
          SELECT s.id INTO v_found_id
          FROM epms.speakers s
          WHERE s.email IS NOT NULL
            AND lower(btrim(s.email)) = v_email
          LIMIT 1;
        END IF;
        IF v_found_id IS NULL AND v_nombre_norm IS NOT NULL THEN
          SELECT s.id INTO v_found_id
          FROM epms.speakers s
          WHERE epms.normalizar_texto_match(s.nombre) = v_nombre_norm
            AND (
              (v_empresa_norm IS NULL AND epms.normalizar_texto_match(s.empresa) IS NULL)
              OR epms.normalizar_texto_match(s.empresa) = v_empresa_norm
            )
          LIMIT 1;
        END IF;
        IF v_found_id IS NOT NULL THEN
          v_accion := 'actualizar';
          v_speaker_id := v_found_id;
          v_reasignada := true;
        ELSE
          INSERT INTO epms.speakers (
            nombre, cargo, empresa, pais, email, fuente
          ) VALUES (
            v_nombre, v_cargo, v_empresa, v_pais, v_email, 'import_sheet'
          )
          RETURNING id INTO v_speaker_id;
          v_creados := v_creados + 1;
        END IF;
      END IF;

      IF v_accion = 'actualizar' THEN
        SELECT * INTO v_sp FROM epms.speakers WHERE id = v_speaker_id;
        v_nuevo_cargo := CASE
          WHEN nullif(btrim(coalesce(v_sp.cargo, '')), '') IS NULL THEN v_cargo
          ELSE v_sp.cargo
        END;
        v_nuevo_empresa := CASE
          WHEN nullif(btrim(coalesce(v_sp.empresa, '')), '') IS NULL THEN v_empresa
          ELSE v_sp.empresa
        END;
        v_nuevo_pais := CASE
          WHEN nullif(btrim(coalesce(v_sp.pais, '')), '') IS NULL THEN v_pais
          ELSE v_sp.pais
        END;
        v_nuevo_email := CASE
          WHEN v_sp.email IS NULL AND v_email IS NOT NULL
            AND coalesce((v_fila->>'email_aprobado')::boolean, false)
          THEN v_email
          ELSE v_sp.email
        END;

        IF v_nuevo_cargo IS DISTINCT FROM v_sp.cargo
           OR v_nuevo_empresa IS DISTINCT FROM v_sp.empresa
           OR v_nuevo_pais IS DISTINCT FROM v_sp.pais
           OR v_nuevo_email IS DISTINCT FROM v_sp.email THEN
          UPDATE epms.speakers
          SET
            cargo = v_nuevo_cargo,
            empresa = v_nuevo_empresa,
            pais = v_nuevo_pais,
            email = v_nuevo_email,
            updated_at = now()
          WHERE id = v_speaker_id;
        END IF;

        IF NOT v_reasignada THEN
          v_actualizados := v_actualizados + 1;
        ELSE
          -- reasignada desde crear: cuenta como actualizado
          v_actualizados := v_actualizados + 1;
          v_creados := v_creados; -- no-op clarity
        END IF;
      END IF;

      -- Membresía
      IF p_evento_id IS NOT NULL THEN
        v_estado := nullif(btrim(coalesce(v_fila->>'estado', '')), '');
        IF v_estado IS NULL OR v_estado NOT IN (
          'SIN_CLASIFICAR', 'PENDIENTE_CONTACTAR', 'CONTACTADO',
          'EN_CONVERSACION', 'CONFIRMADO', 'NO_DISPONIBLE', 'DESCARTADO'
        ) THEN
          v_estado := 'PENDIENTE_CONTACTAR';
        END IF;
        v_estado_motivo := nullif(btrim(coalesce(v_fila->>'estado_motivo', '')), '');
        v_sobrescribir_estado := coalesce((v_fila->>'sobrescribir_estado')::boolean, false);
        v_requiere_viaticos := CASE
          WHEN v_fila ? 'requiere_viaticos' AND jsonb_typeof(v_fila->'requiere_viaticos') = 'boolean'
          THEN (v_fila->>'requiere_viaticos')::boolean
          ELSE NULL
        END;
        v_responsable_texto := nullif(btrim(coalesce(v_fila->>'responsable_texto', '')), '');
        v_proximo_nota := nullif(btrim(coalesce(v_fila->>'proximo_seguimiento_nota', '')), '');
        v_notas_internas := nullif(btrim(coalesce(v_fila->>'notas_internas', '')), '');
        v_pista := nullif(btrim(coalesce(v_fila->>'pista_espacio', '')), '');
        v_datos := coalesce(v_fila->'datos_prospeccion', '{}'::jsonb);

        SELECT * INTO v_memb
        FROM epms.evento_speakers es
        WHERE es.evento_id = p_evento_id AND es.speaker_id = v_speaker_id;
        v_tiene_memb := FOUND;

        IF NOT v_tiene_memb THEN
          INSERT INTO epms.evento_speakers (
            evento_id, speaker_id, estado, estado_motivo,
            requiere_viaticos, responsable_texto, proximo_seguimiento_nota,
            notas_internas, pista_espacio, datos_prospeccion
          ) VALUES (
            p_evento_id, v_speaker_id, v_estado, v_estado_motivo,
            coalesce(v_requiere_viaticos, false),
            v_responsable_texto, v_proximo_nota,
            v_notas_internas, v_pista,
            CASE
              WHEN v_datos = '{}'::jsonb THEN NULL
              ELSE jsonb_build_object('import_excel', v_datos)
            END
          );
        ELSE
          v_memb_changed := false;
          -- estado
          IF v_sobrescribir_estado
             OR v_memb.estado IN ('SIN_CLASIFICAR', 'PENDIENTE_CONTACTAR') THEN
            IF v_memb.estado IS DISTINCT FROM v_estado THEN
              v_memb.estado := v_estado;
              v_memb_changed := true;
            END IF;
            IF v_estado_motivo IS NOT NULL
               AND nullif(btrim(coalesce(v_memb.estado_motivo, '')), '') IS NULL THEN
              v_memb.estado_motivo := v_estado_motivo;
              v_memb_changed := true;
            ELSIF v_sobrescribir_estado AND v_estado_motivo IS DISTINCT FROM v_memb.estado_motivo THEN
              v_memb.estado_motivo := v_estado_motivo;
              v_memb_changed := true;
            END IF;
          END IF;

          IF v_responsable_texto IS NOT NULL
             AND nullif(btrim(coalesce(v_memb.responsable_texto, '')), '') IS NULL THEN
            v_memb.responsable_texto := v_responsable_texto;
            v_memb_changed := true;
          END IF;
          IF v_proximo_nota IS NOT NULL
             AND nullif(btrim(coalesce(v_memb.proximo_seguimiento_nota, '')), '') IS NULL THEN
            v_memb.proximo_seguimiento_nota := v_proximo_nota;
            v_memb_changed := true;
          END IF;
          IF v_notas_internas IS NOT NULL
             AND nullif(btrim(coalesce(v_memb.notas_internas, '')), '') IS NULL THEN
            v_memb.notas_internas := v_notas_internas;
            v_memb_changed := true;
          END IF;
          IF v_pista IS NOT NULL
             AND nullif(btrim(coalesce(v_memb.pista_espacio, '')), '') IS NULL THEN
            v_memb.pista_espacio := v_pista;
            v_memb_changed := true;
          END IF;
          IF v_requiere_viaticos IS NOT NULL
             AND (v_memb.requiere_viaticos IS NULL OR v_memb.requiere_viaticos IS NOT TRUE) THEN
            IF v_memb.requiere_viaticos IS DISTINCT FROM v_requiere_viaticos THEN
              v_memb.requiere_viaticos := v_requiere_viaticos;
              v_memb_changed := true;
            END IF;
          END IF;

          v_new_datos := coalesce(v_memb.datos_prospeccion, '{}'::jsonb)
            || jsonb_build_object('import_excel', v_datos);
          IF v_new_datos IS DISTINCT FROM v_memb.datos_prospeccion THEN
            v_memb.datos_prospeccion := v_new_datos;
            v_memb_changed := true;
          END IF;

          IF v_memb_changed THEN
            UPDATE epms.evento_speakers
            SET
              estado = v_memb.estado,
              estado_motivo = v_memb.estado_motivo,
              responsable_texto = v_memb.responsable_texto,
              proximo_seguimiento_nota = v_memb.proximo_seguimiento_nota,
              notas_internas = v_memb.notas_internas,
              pista_espacio = v_memb.pista_espacio,
              requiere_viaticos = v_memb.requiere_viaticos,
              datos_prospeccion = v_memb.datos_prospeccion,
              updated_at = now()
            WHERE evento_id = p_evento_id AND speaker_id = v_speaker_id;
          END IF;
        END IF;

        -- Gestiones
        v_gestiones := coalesce(v_fila->'gestiones', '[]'::jsonb);
        IF jsonb_typeof(v_gestiones) = 'array' THEN
          FOR v_g IN SELECT * FROM jsonb_array_elements(v_gestiones)
          LOOP
            v_tipo := lower(btrim(coalesce(v_g->>'tipo', '')));
            v_fecha := btrim(coalesce(v_g->>'fecha', ''));
            IF v_tipo NOT IN (
              'correo', 'linkedin', 'referencia', 'institucion',
              'whatsapp', 'llamada', 'otro'
            ) OR v_fecha !~ '^\d{4}-\d{2}-\d{2}$' THEN
              CONTINUE;
            END IF;
            v_clave := p_evento_id::text || ':' || v_speaker_id::text
              || ':' || v_tipo || ':' || v_fecha;
            v_occurs_at := (
              (v_fecha || ' 12:00:00')::timestamp
              AT TIME ZONE 'America/Bogota'
            );
            WITH ins AS (
              INSERT INTO epms.evento_speaker_gestiones (
                evento_id, speaker_id, tipo, nota, ocurrida_at,
                creado_por, import_clave
              ) VALUES (
                p_evento_id,
                v_speaker_id,
                v_tipo,
                'Importado del Excel (último envío por ' || v_tipo || ')',
                v_occurs_at,
                auth.uid(),
                v_clave
              )
              ON CONFLICT (import_clave) WHERE (import_clave IS NOT NULL)
              DO NOTHING
              RETURNING id
            )
            SELECT EXISTS (SELECT 1 FROM ins) INTO v_inserted;
            IF v_inserted THEN
              v_gest_ins := v_gest_ins + 1;
            ELSE
              v_gest_exist := v_gest_exist + 1;
            END IF;
          END LOOP;
        END IF;
      END IF;

      v_resultados := v_resultados || jsonb_build_array(jsonb_build_object(
        'fila_idx', v_idx,
        'ok', true,
        'accion', v_accion,
        'speaker_id', v_speaker_id,
        'reasignada_a_existente', v_reasignada
      ));
    EXCEPTION WHEN OTHERS THEN
      -- Errores esperables de validación ya se manejaron; otros por fila
      -- que sean constraint conocidas (email unique) → error de fila.
      IF SQLSTATE IN ('23505') THEN
        v_errores := v_errores + 1;
        v_resultados := v_resultados || jsonb_build_array(jsonb_build_object(
          'fila_idx', v_idx,
          'ok', false,
          'error', 'Conflicto de unicidad (email u otro índice)'
        ));
      ELSE
        RAISE;
      END IF;
    END;
  END LOOP;

  SELECT coalesce(resumen, '{}'::jsonb) INTO v_prev_resumen
  FROM epms.import_lotes WHERE id = p_lote_id;

  v_resumen := jsonb_build_object(
    'creados', coalesce((v_prev_resumen->>'creados')::int, 0) + v_creados,
    'actualizados', coalesce((v_prev_resumen->>'actualizados')::int, 0) + v_actualizados,
    'omitidos', coalesce((v_prev_resumen->>'omitidos')::int, 0) + v_omitidos,
    'errores', coalesce((v_prev_resumen->>'errores')::int, 0) + v_errores,
    'gestiones_insertadas', coalesce((v_prev_resumen->>'gestiones_insertadas')::int, 0) + v_gest_ins,
    'gestiones_existentes', coalesce((v_prev_resumen->>'gestiones_existentes')::int, 0) + v_gest_exist
  );

  UPDATE epms.import_lotes
  SET resumen = v_resumen, updated_at = now()
  WHERE id = p_lote_id;

  RETURN jsonb_build_object(
    'resultados', v_resultados,
    'resumen_lote', v_resumen,
    'resumen_chunk', jsonb_build_object(
      'creados', v_creados,
      'actualizados', v_actualizados,
      'omitidos', v_omitidos,
      'errores', v_errores,
      'gestiones_insertadas', v_gest_ins,
      'gestiones_existentes', v_gest_exist
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION epms.importar_speakers_lote(uuid, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION epms.importar_speakers_lote(uuid, uuid, jsonb)
  TO authenticated;

COMMENT ON FUNCTION epms.importar_speakers_lote(uuid, uuid, jsonb) IS
  'Importa un chunk de filas normalizadas. set_config import_excel; Agenda-only.';

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (ejecutar a mano solo si hay que deshacer).
--
-- DROP FUNCTION IF EXISTS epms.importar_speakers_lote(uuid, uuid, jsonb);
-- DROP FUNCTION IF EXISTS epms.cerrar_import_lote(uuid, text);
-- DROP FUNCTION IF EXISTS epms.crear_import_lote(uuid, text, text, text, jsonb);
-- DROP FUNCTION IF EXISTS epms.normalizar_texto_match(text);
-- DROP INDEX IF EXISTS epms.idx_evento_speaker_gestiones_import_clave;
-- ALTER TABLE epms.evento_speaker_gestiones DROP COLUMN IF EXISTS import_clave;
-- DROP POLICY IF EXISTS "agenda_select_import_lotes" ON epms.import_lotes;
-- DROP TABLE IF EXISTS epms.import_lotes;
-- ─────────────────────────────────────────────────────────────────────────────
