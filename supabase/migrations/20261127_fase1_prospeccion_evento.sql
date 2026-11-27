-- EPMS — Fase 1: prospección por evento (campos en evento_speakers)
-- NO aplicar en producción sin leer este encabezado.
-- NO ejecutar contra la base desde el repo: el owner lo corre en el SQL Editor.
--
-- Qué agrega
--   Campos de seguimiento / prospección en epms.evento_speakers
--   (responsable, próximo seguimiento, viáticos, pista, notas,
--   snapshot datos_prospeccion). Todos nullable. No se toca el CHECK
--   ni el catálogo de estado. No hay backfill.
--   Función epms.listar_usuarios_agenda(): lista id/nombre del equipo
--   Agenda solo si el caller es área Agenda (SECURITY DEFINER, sin
--   ampliar SELECT RLS sobre usuarios).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION.
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

-- ── 2) Lista de equipo Agenda para el selector de responsable ──────────────
-- RLS de evento_speakers ya es fila completa (agenda_all / sales_cs_read);
-- las columnas nuevas no requieren políticas aparte.
-- No se amplía SELECT sobre epms.usuarios: solo esta RPC (id, nombre).
DROP POLICY IF EXISTS "agenda_read_usuarios" ON epms.usuarios;

CREATE OR REPLACE FUNCTION epms.listar_usuarios_agenda()
RETURNS TABLE(id uuid, nombre text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = epms, pg_temp
AS $$
  SELECT u.id, u.nombre
  FROM epms.usuarios u
  WHERE u.area = 'Agenda'
    AND epms.mi_area() = 'Agenda'
  ORDER BY u.nombre;
$$;

COMMENT ON FUNCTION epms.listar_usuarios_agenda() IS
  'Id y nombre de usuarios área Agenda. Solo si el caller es Agenda. Sin email.';

REVOKE ALL ON FUNCTION epms.listar_usuarios_agenda() FROM PUBLIC;
REVOKE ALL ON FUNCTION epms.listar_usuarios_agenda() FROM anon;
GRANT EXECUTE ON FUNCTION epms.listar_usuarios_agenda() TO authenticated;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (no forma parte de la transacción de arriba; ejecutarlo a mano
-- solo si hay que deshacer el esquema). La app nueva deja de funcionar.
--
-- BEGIN;
--
-- DROP FUNCTION IF EXISTS epms.listar_usuarios_agenda();
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
