-- Agenda pública del EPMS.
--
-- ORDEN (el endpoint no debe romperse y anon no debe seguir leyendo tablas):
--   1. Ejecutar ESTE archivo completo en el SQL Editor de Supabase, en el
--      proyecto del EPMS, ANTES de mergear el PR a main.
--   2. Recién después, mergear. Vercel publica GET /api/agenda.
--
-- Si se mergea antes, /api/agenda responde 500 hasta que este script exista.
-- No devuelve una agenda vacía y no lee epms.speakers / epms.sesiones con la
-- anon key.
--
-- La app interna sigue con el JWT de authenticated. Este script no les quita
-- permisos. Solo cierra el rol anon (y PUBLIC) sobre las tablas.

-- ------------------------------------------------------------
-- 1. Funciones SECURITY DEFINER (solo columnas públicas)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION epms.agenda_texto_publico(p_texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_temp
AS $$
  SELECT NULLIF(
    btrim(
      regexp_replace(
        COALESCE(p_texto, ''),
        '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',
        '',
        'gi'
      )
    ),
    ''
  );
$$;

REVOKE ALL ON FUNCTION epms.agenda_texto_publico(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION epms.agenda_texto_publico(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION epms.agenda_publica(
  p_evento_id uuid DEFAULT NULL,
  p_fecha date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = epms, pg_temp
AS $$
DECLARE
  v_evento jsonb;
  v_encontrado boolean;
BEGIN
  IF p_evento_id IS NULL THEN
    v_encontrado := true;
    v_evento := NULL;
  ELSE
    SELECT jsonb_build_object(
      'id', e.id,
      'nombre', epms.agenda_texto_publico(e.nombre),
      'fecha_inicio', e.fecha_inicio,
      'fecha_fin', e.fecha_fin
    )
    INTO v_evento
    FROM epms.eventos e
    WHERE e.id = p_evento_id
      AND e.activo IS TRUE;
    v_encontrado := v_evento IS NOT NULL;
  END IF;

  RETURN jsonb_build_object(
    'encontrado', v_encontrado,
    'evento', v_evento,
    'escenarios', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', esc.id,
          'nombre', esc.nombre,
          'evento_id', esc.evento_id,
          'color', NULL
        )
        ORDER BY esc.nombre, esc.id
      )
      FROM epms.escenarios esc
      JOIN epms.eventos e ON e.id = esc.evento_id
      WHERE e.activo IS TRUE
        AND (p_evento_id IS NULL OR e.id = p_evento_id)
        AND v_encontrado
    ), '[]'::jsonb),
    'sesiones', COALESCE((
      SELECT jsonb_agg(item)
      FROM (
        SELECT jsonb_build_object(
          'id', s.id,
          'titulo', epms.agenda_texto_publico(s.titulo),
          'descripcion', epms.agenda_texto_publico(s.descripcion),
          'formato', epms.agenda_texto_publico(s.formato),
          'track', epms.agenda_texto_publico(s.track),
          'idioma', epms.agenda_texto_publico(s.idioma),
          'fecha', sl.dia,
          'hora_inicio', sl.hora_inicio,
          'hora_fin', sl.hora_fin,
          'evento', jsonb_build_object(
            'id', e.id,
            'nombre', epms.agenda_texto_publico(e.nombre),
            'fecha_inicio', e.fecha_inicio,
            'fecha_fin', e.fecha_fin
          ),
          'escenario', jsonb_build_object(
            'id', esc.id,
            'nombre', esc.nombre,
            'color', NULL
          ),
          'speakers', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', sp.id,
              'nombre', epms.agenda_texto_publico(sp.nombre),
              'rol', ss.rol,
              'cargo', epms.agenda_texto_publico(sp.cargo),
              'empresa', epms.agenda_texto_publico(sp.empresa),
              'bio', epms.agenda_texto_publico(sp.bio),
              'tiene_foto', (
                sp.foto_url ~* '^https://[^/[:space:]]+/storage/v1/object/(public|sign)/'
              )
            ))
            FROM epms.sesion_speakers ss
            JOIN epms.speakers sp ON sp.id = ss.speaker_id
            WHERE ss.sesion_id = s.id
          ), '[]'::jsonb)
        ) AS item
        FROM epms.sesiones s
        JOIN epms.slots sl ON sl.id = s.slot_id
        JOIN epms.escenarios esc ON esc.id = sl.escenario_id
        JOIN epms.eventos e ON e.id = esc.evento_id
        WHERE v_encontrado
          AND e.activo IS TRUE
          AND upper(btrim(s.estado)) = 'CONFIRMADA'
          AND sl.hora_fin > sl.hora_inicio
          AND (p_evento_id IS NULL OR e.id = p_evento_id)
          AND (p_fecha IS NULL OR sl.dia = p_fecha)
      ) q
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION epms.agenda_publica(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION epms.agenda_publica(uuid, date) TO anon, authenticated;

COMMENT ON FUNCTION epms.agenda_publica(uuid, date) IS
  'Agenda pública. Solo sesiones CONFIRMADA con slot. No incluye email, teléfono, documento ni la URL de Storage.';

-- La URL de Storage puede traer un email en el nombre del archivo. Esta
-- función la devuelve solo para que /api/speaker-foto la descargue del lado
-- del servidor. El JSON de la agenda manda tiene_foto, no esta URL.
CREATE OR REPLACE FUNCTION epms.agenda_foto_publica(p_speaker_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = epms, pg_temp
AS $$
  SELECT sp.foto_url
  FROM epms.speakers sp
  WHERE sp.id = p_speaker_id
    AND sp.foto_url ~* '^https://[^/[:space:]]+/storage/v1/object/(public|sign)/'
    AND EXISTS (
      SELECT 1
      FROM epms.sesion_speakers ss
      JOIN epms.sesiones s ON s.id = ss.sesion_id
      JOIN epms.slots sl ON sl.id = s.slot_id
      JOIN epms.escenarios esc ON esc.id = sl.escenario_id
      JOIN epms.eventos e ON e.id = esc.evento_id
      WHERE ss.speaker_id = sp.id
        AND e.activo IS TRUE
        AND upper(btrim(s.estado)) = 'CONFIRMADA'
        AND sl.hora_fin > sl.hora_inicio
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION epms.agenda_foto_publica(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION epms.agenda_foto_publica(uuid) TO anon, authenticated;

COMMENT ON FUNCTION epms.agenda_foto_publica(uuid) IS
  'URL de Storage de un speaker en una sesión CONFIRMADA. Sin columnas de contacto.';

-- ------------------------------------------------------------
-- 2. BLOQUE OBLIGATORIO — revocar SELECT anónimo sobre las tablas
-- Ejecutar junto con las funciones (ya está en este archivo).
-- authenticated conserva sus grants. anon deja de poder hacer
-- GET /rest/v1/speakers (email, teléfono, documento) y el resto
-- de tablas del schema epms.
-- ------------------------------------------------------------

REVOKE ALL ON ALL TABLES IN SCHEMA epms FROM anon, PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA epms FROM anon, PUBLIC;

DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY[
    'speakers',
    'sesiones',
    'sesion_speakers',
    'requests',
    'usuarios',
    'tally_duplicados_pendientes',
    'valores_propiedades',
    'propiedades_custom',
    'eventos',
    'escenarios',
    'tracks',
    'formatos',
    'slots',
    'estados_sesion',
    'toolkit_speakers'
  ]
  LOOP
    IF to_regclass('epms.' || rel) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE epms.%I FROM anon, PUBLIC', rel);
    END IF;
  END LOOP;
END $$;

-- Las funciones de arriba siguen siendo ejecutables por anon.
GRANT EXECUTE ON FUNCTION epms.agenda_publica(uuid, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION epms.agenda_foto_publica(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
