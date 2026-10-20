-- API pública de agenda (opcional, recomendado antes de endurecer RLS).
--
-- La función de Vercel /api/agenda ya responde con la anon key seleccionando
-- solo columnas públicas. Cuando esta función existe, la API la usa y deja
-- de leer las tablas directamente. Así el endpoint sigue funcionando si
-- anon pierde SELECT sobre epms.sesiones / epms.speakers.
--
-- Ejecutar una vez en el SQL Editor de Supabase (proyecto ydqbjyhcntszvrytdkml).
-- No agregues email, teléfono, documento, LinkedIn, piezas, requests ni estado.

CREATE OR REPLACE FUNCTION epms.agenda_publica(
  p_evento_id uuid DEFAULT NULL,
  p_fecha date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = epms, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id', s.id,
      'titulo', s.titulo,
      'descripcion', s.descripcion,
      'formato', s.formato,
      'track', s.track,
      'idioma', s.idioma,
      'fecha', sl.dia,
      'hora_inicio', sl.hora_inicio,
      'hora_fin', sl.hora_fin,
      'evento', jsonb_build_object(
        'id', e.id,
        'nombre', e.nombre,
        'fecha_inicio', e.fecha_inicio,
        'fecha_fin', e.fecha_fin,
        'activo', e.activo
      ),
      'escenario', jsonb_build_object(
        'id', esc.id,
        'nombre', esc.nombre,
        'color', NULL
      ),
      'speakers', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', sp.id,
          'nombre', sp.nombre,
          'rol', ss.rol,
          'cargo', sp.cargo,
          'empresa', sp.empresa,
          'foto_url', sp.foto_url,
          'bio', sp.bio
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
    WHERE e.activo IS TRUE
      AND upper(btrim(s.estado)) = 'CONFIRMADA'
      AND (p_evento_id IS NULL OR e.id = p_evento_id)
      AND (p_fecha IS NULL OR sl.dia = p_fecha)
  ) q;
$$;

REVOKE ALL ON FUNCTION epms.agenda_publica(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION epms.agenda_publica(uuid, date) TO anon, authenticated;

COMMENT ON FUNCTION epms.agenda_publica(uuid, date) IS
  'Agenda pública: solo sesiones CONFIRMADA con slot, columnas de speaker públicas.';
