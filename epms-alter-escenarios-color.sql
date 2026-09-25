-- Color de escenario para la vista Calendario (bloques y leyenda).
-- Ejecutar en el SQL editor de Supabase sobre el proyecto ydqbjyhcntszvrytdkml.

ALTER TABLE epms.escenarios
  ADD COLUMN IF NOT EXISTS color text;

-- Defaults por orden de creación (coinciden con la paleta del frontend).
WITH ranked AS (
  SELECT
    id,
    (ROW_NUMBER() OVER (PARTITION BY evento_id ORDER BY nombre) - 1) AS idx
  FROM epms.escenarios
  WHERE color IS NULL
)
UPDATE epms.escenarios e
SET color = (ARRAY[
  '#0093FF',
  '#FFEDB5',
  '#EE82EE',
  '#42B3F3',
  '#16A34A',
  '#F97316',
  '#0F766E',
  '#BE123C'
])[1 + (ranked.idx % 8)]
FROM ranked
WHERE e.id = ranked.id;
