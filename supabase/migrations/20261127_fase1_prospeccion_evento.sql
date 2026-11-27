-- EPMS — Fase 1: prospección por evento (campos en evento_speakers)
-- NO aplicar en producción sin leer este encabezado.
-- NO ejecutar contra la base desde el repo: el owner lo corre en el SQL Editor.
--
-- Qué agrega
--   Campos de seguimiento / prospección en epms.evento_speakers
--   (responsable, próximo seguimiento, viáticos, pista, notas,
--   snapshot datos_prospeccion). Todos nullable. No se toca el CHECK
--   ni el catálogo de estado. No hay backfill.
--   Política agenda_read_usuarios: colaboradores Agenda pueden listar
--   el equipo para el selector de responsable (antes solo admin).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- DROP POLICY IF EXISTS + CREATE POLICY.
--
-- El rollback comentado está al final. No lo ejecutes junto con esto.

BEGIN;

-- ── 1) Columnas de prospección en la membresía ─────────────────────────────
ALTER TABLE epms.evento_speakers
  ADD COLUMN IF NOT EXISTS responsable_id uuid
    REFERENCES epms.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responsable_texto text,
  ADD COLUMN IF NOT EXISTS proximo_seguimiento_at timestamptz,
  ADD COLUMN IF NOT EXISTS proximo_seguimiento_nota text,
  ADD COLUMN IF NOT EXISTS requiere_viaticos boolean,
  ADD COLUMN IF NOT EXISTS viaticos_nota text,
  ADD COLUMN IF NOT EXISTS pista_espacio text,
  ADD COLUMN IF NOT EXISTS notas_internas text,
  ADD COLUMN IF NOT EXISTS datos_prospeccion jsonb;

COMMENT ON COLUMN epms.evento_speakers.responsable_id IS
  'Usuario del hub (Agenda) responsable de la prospección en ESTE evento.';
COMMENT ON COLUMN epms.evento_speakers.responsable_texto IS
  'Label del responsable (nombre del usuario o texto libre si no es usuario).';
COMMENT ON COLUMN epms.evento_speakers.proximo_seguimiento_at IS
  'Próximo follow-up de ESTE evento. Civil America/Bogota en la UI.';
COMMENT ON COLUMN epms.evento_speakers.proximo_seguimiento_nota IS
  'Nota del próximo follow-up (qué falta).';
COMMENT ON COLUMN epms.evento_speakers.requiere_viaticos IS
  'Flag de viáticos en ESTE evento.';
COMMENT ON COLUMN epms.evento_speakers.viaticos_nota IS
  'Detalle de viáticos (monto, condición, etc.).';
COMMENT ON COLUMN epms.evento_speakers.pista_espacio IS
  'Pista de espacio deseada (p. ej. Main Stage / Policy Lab). Texto libre.';
COMMENT ON COLUMN epms.evento_speakers.notas_internas IS
  'Notas internas del equipo para ESTE evento.';
COMMENT ON COLUMN epms.evento_speakers.datos_prospeccion IS
  'Snapshot de lo que capturó el equipo al prospectar: {nombre, empresa, cargo, pais, contacto_raw, …}.';

CREATE INDEX IF NOT EXISTS idx_evento_speakers_proximo_seguimiento
  ON epms.evento_speakers (evento_id, proximo_seguimiento_at)
  WHERE proximo_seguimiento_at IS NOT NULL;

-- ── 2) Lectura de equipo Agenda para el selector de responsable ────────────
-- RLS de evento_speakers ya es fila completa (agenda_all / sales_cs_read);
-- las columnas nuevas no requieren políticas aparte.
DROP POLICY IF EXISTS "agenda_read_usuarios" ON epms.usuarios;
CREATE POLICY "agenda_read_usuarios" ON epms.usuarios
  FOR SELECT TO authenticated
  USING (epms.mi_area() = 'Agenda');

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (no forma parte de la transacción de arriba; ejecutarlo a mano
-- solo si hay que deshacer el esquema). La app nueva deja de funcionar.
--
-- BEGIN;
--
-- DROP POLICY IF EXISTS "agenda_read_usuarios" ON epms.usuarios;
--
-- DROP INDEX IF EXISTS epms.idx_evento_speakers_proximo_seguimiento;
--
-- ALTER TABLE epms.evento_speakers
--   DROP COLUMN IF EXISTS responsable_id,
--   DROP COLUMN IF EXISTS responsable_texto,
--   DROP COLUMN IF EXISTS proximo_seguimiento_at,
--   DROP COLUMN IF EXISTS proximo_seguimiento_nota,
--   DROP COLUMN IF EXISTS requiere_viaticos,
--   DROP COLUMN IF EXISTS viaticos_nota,
--   DROP COLUMN IF EXISTS pista_espacio,
--   DROP COLUMN IF EXISTS notas_internas,
--   DROP COLUMN IF EXISTS datos_prospeccion;
--
-- COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────
