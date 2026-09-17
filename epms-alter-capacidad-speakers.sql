-- Amplía el tope de speakers por sesión (Policy Labs, workshops, etc.).
-- Ejecutar en el SQL editor de Supabase sobre el proyecto ydqbjyhcntszvrytdkml.

ALTER TABLE epms.sesiones
  DROP CONSTRAINT IF EXISTS sesiones_capacidad_speakers_check;

ALTER TABLE epms.sesiones
  ADD CONSTRAINT sesiones_capacidad_speakers_check
  CHECK (capacidad_speakers BETWEEN 1 AND 20);
