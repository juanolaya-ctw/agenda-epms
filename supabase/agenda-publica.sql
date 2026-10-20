-- Agenda pública del EPMS.
--
-- ORDEN (el endpoint no debe romperse y anon no debe seguir leyendo tablas):
--   0. Correr el SELECT comentado del pre-check (más abajo) y guardar el resultado.
--   1. Ejecutar ESTE archivo completo en el SQL Editor de Supabase, en el
--      proyecto del EPMS, ANTES de mergear el PR a main.
--   2. Entrar a la app como Agenda. Si no puede leer, correr el GRANT comentado
--      hacia authenticated (el pre-check dice si hoy entra por PUBLIC).
--   3. Recién después, mergear. Vercel publica GET /api/agenda.
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

-- true solo si la URL es Storage de ESTE proyecto (mismo host que manda la API).
CREATE OR REPLACE FUNCTION epms.agenda_foto_en_proyecto(p_url text, p_storage_host text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_temp
AS $$
  SELECT COALESCE(
    NULLIF(lower(btrim(COALESCE(p_storage_host, ''))), '') IS NOT NULL
    AND (
      lower(btrim(p_url)) LIKE 'https://' || lower(btrim(p_storage_host)) || '/storage/v1/object/public/%'
      OR lower(btrim(p_url)) LIKE 'https://' || lower(btrim(p_storage_host)) || '/storage/v1/object/sign/%'
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION epms.agenda_foto_en_proyecto(text, text) FROM PUBLIC;

DROP FUNCTION IF EXISTS epms.agenda_publica(uuid, date);
DROP FUNCTION IF EXISTS epms.agenda_publica(uuid, date, text);

CREATE OR REPLACE FUNCTION epms.agenda_publica(
  p_evento_id uuid DEFAULT NULL,
  p_fecha date DEFAULT NULL,
  p_storage_host text DEFAULT NULL
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
          'nombre', epms.agenda_texto_publico(esc.nombre),
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
            'nombre', epms.agenda_texto_publico(esc.nombre),
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
              'tiene_foto', epms.agenda_foto_en_proyecto(sp.foto_url, p_storage_host)
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

REVOKE ALL ON FUNCTION epms.agenda_publica(uuid, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION epms.agenda_publica(uuid, date, text) TO anon, authenticated;

COMMENT ON FUNCTION epms.agenda_publica(uuid, date, text) IS
  'Agenda pública. Solo sesiones CONFIRMADA con slot. tiene_foto solo si el archivo está en el Storage de este proyecto.';

-- La URL de Storage puede traer un email en el nombre del archivo. Esta
-- función la devuelve solo para que /api/speaker-foto la descargue del lado
-- del servidor. El JSON de la agenda manda tiene_foto, no esta URL.
DROP FUNCTION IF EXISTS epms.agenda_foto_publica(uuid);
DROP FUNCTION IF EXISTS epms.agenda_foto_publica(uuid, text);

CREATE OR REPLACE FUNCTION epms.agenda_foto_publica(
  p_speaker_id uuid,
  p_storage_host text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = epms, pg_temp
AS $$
  SELECT sp.foto_url
  FROM epms.speakers sp
  WHERE sp.id = p_speaker_id
    AND epms.agenda_foto_en_proyecto(sp.foto_url, p_storage_host)
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

REVOKE ALL ON FUNCTION epms.agenda_foto_publica(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION epms.agenda_foto_publica(uuid, text) TO anon, authenticated;

COMMENT ON FUNCTION epms.agenda_foto_publica(uuid, text) IS
  'URL de Storage de un speaker en una sesión CONFIRMADA, solo si el host es el de este proyecto.';

-- ------------------------------------------------------------
-- 2. Pre-check (NO se ejecuta: está comentado). Correrlo ANTES de este archivo
-- y guardar el resultado. Si authenticated no aparece y PUBLIC sí, la app
-- interna hoy lee por el grant de PUBLIC.
--
-- SELECT grantee, table_name, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'epms'
--   AND grantee IN ('authenticated', 'PUBLIC');
--
-- Si después del REVOKE la app autenticada no puede leer, descomentar y correr
-- SOLO este bloque. No descomentar nada que otorgue a anon.
--
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA epms TO authenticated;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA epms TO authenticated;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA epms TO authenticated;
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 3. BLOQUE OBLIGATORIO — revocar SELECT anónimo sobre las tablas
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
GRANT EXECUTE ON FUNCTION epms.agenda_publica(uuid, date, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION epms.agenda_foto_publica(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION epms.agenda_texto_publico(text) TO anon, authenticated;

-- Objetos que se creen después, con el rol que corre este script, no quedan
-- legibles ni ejecutables por anon. PUBLIC tampoco: anon es miembro de PUBLIC.
-- No cambia los grants de lo que ya existe (eso lo hace el REVOKE de arriba).
ALTER DEFAULT PRIVILEGES IN SCHEMA epms REVOKE ALL ON TABLES FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA epms REVOKE ALL ON SEQUENCES FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA epms REVOKE ALL ON FUNCTIONS FROM anon, PUBLIC;

NOTIFY pgrst, 'reload schema';
