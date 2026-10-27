-- Modalidad de la sesión: Presencial | Virtual
ALTER TABLE epms.sesiones
  ADD COLUMN IF NOT EXISTS modalidad text NOT NULL DEFAULT 'Presencial'
  CHECK (modalidad IN ('Presencial', 'Virtual'));
