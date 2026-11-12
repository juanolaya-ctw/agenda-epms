-- EPMS — Bloque 1 (acotado): email opcional + estado por evento
-- NO aplicar en producción sin aprobación.
-- NO incluye: Tally multi-form, interacciones, RLS rewrite, KPIs, import Excel.
--
-- Constraint email verificado en prod (lectura): speakers_email_unique UNIQUE (email)
-- Re-comprobar colisiones lower(btrim(email)) al aplicar (conteos previos no bastan).

BEGIN;

-- ── 1) Email opcional + unicidad normalizada ───────────────────────────────
DO $$
DECLARE
  v_grupos int;
BEGIN
  SELECT COUNT(*) INTO v_grupos
  FROM (
    SELECT 1
    FROM epms.speakers
    WHERE email IS NOT NULL AND btrim(email) <> ''
    GROUP BY lower(btrim(email))
    HAVING COUNT(*) > 1
  ) d;

  IF v_grupos > 0 THEN
    RAISE EXCEPTION
      'ABORT bloque1: % grupo(s) duplicados por lower(btrim(email)). Sin borrar/fusionar.',
      v_grupos;
  END IF;
END $$;

ALTER TABLE epms.speakers ALTER COLUMN email DROP NOT NULL;

UPDATE epms.speakers
SET email = NULL
WHERE email IS NOT NULL AND btrim(email) = '';

-- Crear índice (si falta). Luego EXIGIR definición exacta + validez antes del DROP.
CREATE UNIQUE INDEX IF NOT EXISTS speakers_email_lower_trim_uidx
  ON epms.speakers (lower(btrim(email)))
  WHERE email IS NOT NULL;

DO $$
DECLARE
  v_def text;
  v_indisvalid boolean;
  v_indisready boolean;
  v_expected text :=
    'CREATE UNIQUE INDEX speakers_email_lower_trim_uidx ON epms.speakers USING btree (lower(btrim(email))) WHERE (email IS NOT NULL)';
BEGIN
  SELECT pg_get_indexdef(x.indexrelid), x.indisvalid, x.indisready
  INTO v_def, v_indisvalid, v_indisready
  FROM pg_index x
  JOIN pg_class c ON c.oid = x.indexrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'epms'
    AND c.relname = 'speakers_email_lower_trim_uidx';

  IF v_def IS NULL THEN
    RAISE EXCEPTION
      'ABORT bloque1: índice speakers_email_lower_trim_uidx no existe tras CREATE';
  END IF;

  IF v_indisvalid IS NOT TRUE OR v_indisready IS NOT TRUE THEN
    RAISE EXCEPTION
      'ABORT bloque1: índice speakers_email_lower_trim_uidx no es válido/listo (indisvalid=%, indisready=%)',
      v_indisvalid, v_indisready;
  END IF;

  -- Comparar sin ruido de espacios
  IF regexp_replace(lower(v_def), '\s+', ' ', 'g')
     <> regexp_replace(lower(v_expected), '\s+', ' ', 'g') THEN
    RAISE EXCEPTION
      'ABORT bloque1: definición de índice inesperada. got=% expected=%',
      v_def, v_expected;
  END IF;
END $$;

-- Solo tras verificación: quitar UNIQUE crudo
ALTER TABLE epms.speakers DROP CONSTRAINT IF EXISTS speakers_email_unique;

-- ── 2) Estado de invitación por membresía (no infiere desde sesiones) ──────
ALTER TABLE epms.evento_speakers
  ADD COLUMN IF NOT EXISTS estado text,
  ADD COLUMN IF NOT EXISTS estado_motivo text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE epms.evento_speakers
SET estado = 'SIN_CLASIFICAR'
WHERE estado IS NULL;

ALTER TABLE epms.evento_speakers
  ALTER COLUMN estado SET DEFAULT 'PENDIENTE_CONTACTAR',
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE epms.evento_speakers
  DROP CONSTRAINT IF EXISTS evento_speakers_estado_check;

ALTER TABLE epms.evento_speakers
  ADD CONSTRAINT evento_speakers_estado_check CHECK (
    estado IN (
      'SIN_CLASIFICAR',
      'PENDIENTE_CONTACTAR',
      'CONTACTADO',
      'EN_CONVERSACION',
      'CONFIRMADO',
      'NO_DISPONIBLE',
      'DESCARTADO'
    )
  );

COMMENT ON COLUMN epms.evento_speakers.estado IS
  'Pipeline invitación por evento. Independiente de sesiones y agenda pública. Backfill: SIN_CLASIFICAR.';

COMMIT;

-- Aplicación sugerida (staging primero):
-- 1) Backup lógico speakers + evento_speakers
-- 2) Congelar escrituras speakers/webhook breve
-- 3) Ejecutar este archivo en una transacción
-- 4) Verificar: email nullable, índice parcial, estados SIN_CLASIFICAR en filas previas
-- Recuperación schema: NO DROP de estado/seguimiento.
-- Recuperación app: no hay build de recuperación identificado en este repo que
--   declare soporte explícito de email NULL; no asumir que "revert deploy" basta
--   sin verificar el commit/artefacto concreto antes de aplicar.
