-- EPMS — Fase 5 follow-up: search_path fijo en tally_envios_inmutable
-- Statements sueltos (sin BEGIN/COMMIT). Idempotente (CREATE OR REPLACE).
--
-- Documentación: el hotfix 1a de grants (service_role sobre tally_formularios,
-- evento_speakers, evento_speaker_gestiones) ya se aplicó en prod como
-- 20261128_hotfix_tally_service_role_grants; NO hay que reaplicarlo aquí.
-- La migración 20261129_fase5_tally.sql tampoco se edita (ya aplicada).

CREATE OR REPLACE FUNCTION epms.tally_envios_inmutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = epms, pg_temp
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

REVOKE ALL ON FUNCTION epms.tally_envios_inmutable() FROM PUBLIC, anon, authenticated;

-- ROLLBACK (opcional; inocuo dejar el search_path fijo):
-- CREATE OR REPLACE FUNCTION epms.tally_envios_inmutable()
-- RETURNS trigger LANGUAGE plpgsql AS $$
-- BEGIN
--   IF NEW.clave IS DISTINCT FROM OLD.clave
--     OR NEW.tally_form_id IS DISTINCT FROM OLD.tally_form_id
--     OR NEW.tally_submission_id IS DISTINCT FROM OLD.tally_submission_id
--     OR NEW.campos IS DISTINCT FROM OLD.campos
--     OR NEW.respuestas IS DISTINCT FROM OLD.respuestas
--     OR NEW.payload_raw IS DISTINCT FROM OLD.payload_raw
--     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
--     OR NEW.created_at IS DISTINCT FROM OLD.created_at
--   THEN
--     RAISE EXCEPTION 'tally_envios: columnas de contenido son inmutables'
--       USING ERRCODE = 'check_violation';
--   END IF;
--   RETURN NEW;
-- END;
-- $$;
