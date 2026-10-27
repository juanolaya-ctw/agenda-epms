-- Agrega 'Híbrida' a las modalidades permitidas
ALTER TABLE epms.sesiones DROP CONSTRAINT IF EXISTS sesiones_modalidad_check;
ALTER TABLE epms.sesiones
  ADD CONSTRAINT sesiones_modalidad_check
  CHECK (modalidad IN ('Presencial', 'Virtual', 'Híbrida'));
