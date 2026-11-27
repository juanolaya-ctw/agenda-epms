-- EPMS — Fase 2: gestiones (bitácora) por speaker y evento
-- NO aplicar en producción sin leer este encabezado.
-- NO ejecutar contra la base desde el repo: el owner lo corre en el SQL Editor.
--
-- Qué agrega
--   Tabla epms.evento_speaker_gestiones (append-only: SELECT + INSERT).
--   Sin FK a evento_speakers: al desasociar, las gestiones se conservan.
--   RLS Agenda-only. RPC epms.registrar_gestion (SECURITY INVOKER) que
--   inserta la gestión y opcionalmente actualiza próximo follow-up /
--   estado CONTACTADO en la membresía.
--
-- Sin BEGIN/COMMIT (statements sueltos). Idempotente donde aplica.
-- Rollback comentado al final.

-- ── 1) Tabla ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS epms.evento_speaker_gestiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL REFERENCES epms.eventos(id) ON DELETE CASCADE,
  speaker_id uuid NOT NULL REFERENCES epms.speakers(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (
    tipo IN (
      'correo',
      'linkedin',
      'referencia',
      'institucion',
      'whatsapp',
      'llamada',
      'otro'
    )
  ),
  nota text,
  ocurrida_at timestamptz NOT NULL,
  proxima_at timestamptz,
  creado_por uuid REFERENCES epms.usuarios(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE epms.evento_speaker_gestiones IS
  'Bitácora append-only de gestiones de prospección por speaker y evento. No FK a evento_speakers.';
COMMENT ON COLUMN epms.evento_speaker_gestiones.tipo IS
  'Canal: correo | linkedin | referencia | institucion | whatsapp | llamada | otro.';
COMMENT ON COLUMN epms.evento_speaker_gestiones.ocurrida_at IS
  'Cuándo ocurrió la gestión (civil America/Bogota en la UI).';
COMMENT ON COLUMN epms.evento_speaker_gestiones.proxima_at IS
  'Próximo follow-up opcional dejado al registrar (también se copia a evento_speakers si no null).';

CREATE INDEX IF NOT EXISTS idx_evento_speaker_gestiones_evento_speaker_ocurrida
  ON epms.evento_speaker_gestiones (evento_id, speaker_id, ocurrida_at DESC);

CREATE INDEX IF NOT EXISTS idx_evento_speaker_gestiones_speaker
  ON epms.evento_speaker_gestiones (speaker_id);

-- ── 2) RLS Agenda-only ───────────────────────────────────────────────────
ALTER TABLE epms.evento_speaker_gestiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agenda_select_evento_speaker_gestiones"
  ON epms.evento_speaker_gestiones;
CREATE POLICY "agenda_select_evento_speaker_gestiones"
  ON epms.evento_speaker_gestiones
  FOR SELECT TO authenticated
  USING (epms.mi_area() = 'Agenda');

DROP POLICY IF EXISTS "agenda_insert_evento_speaker_gestiones"
  ON epms.evento_speaker_gestiones;
CREATE POLICY "agenda_insert_evento_speaker_gestiones"
  ON epms.evento_speaker_gestiones
  FOR INSERT TO authenticated
  WITH CHECK (
    epms.mi_area() = 'Agenda'
    AND creado_por = auth.uid()
  );

GRANT SELECT, INSERT ON epms.evento_speaker_gestiones TO authenticated;
-- Sin UPDATE ni DELETE: bitácora append-only.

-- ── 3) RPC registrar_gestion ─────────────────────────────────────────────
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
    AND es.speaker_id = p_speaker_id;

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
      proximo_seguimiento_nota = CASE
        WHEN p_proxima_nota IS NULL THEN proximo_seguimiento_nota
        ELSE NULLIF(btrim(p_proxima_nota), '')
      END,
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
      AND speaker_id = p_speaker_id;
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
-- DROP FUNCTION IF EXISTS epms.registrar_gestion(
--   uuid, uuid, text, text, timestamptz, timestamptz, text, boolean
-- );
-- DROP POLICY IF EXISTS "agenda_insert_evento_speaker_gestiones"
--   ON epms.evento_speaker_gestiones;
-- DROP POLICY IF EXISTS "agenda_select_evento_speaker_gestiones"
--   ON epms.evento_speaker_gestiones;
-- DROP TABLE IF EXISTS epms.evento_speaker_gestiones;
-- ─────────────────────────────────────────────────────────────────────────────
