-- EPMS — Fase 0: segmentación por evento (toolkit, piezas, Tally)
-- NO aplicar en producción sin leer este encabezado.
-- NO ejecutar contra la base desde el repo: el owner lo corre en el SQL Editor.
--
-- Qué mueve
--   toolkit_slug, link_pieza_fase1/2/3 y estado_pieza dejan de vivir en
--   epms.speakers (la persona global) y pasan a epms.evento_speakers
--   (la participación en UN evento).
--   La URL base del toolkit pasa a epms.eventos.toolkit_base_url.
--   Cada evento registra su formulario Tally en epms.tally_formularios
--   (un webhook propio: ?token=…).
--
-- Backfill
--   Todo toolkit/pieza que hoy está en speakers se copia SOLO a la
--   membresía de GovTech Summit 2026
--   (2f042639-cc2d-4c06-bea3-f8316a3419c1). Media Bootcamp y el resto
--   quedan sin slug ni piezas.
--   Si la persona tiene artefacto de toolkit y todavía no está en
--   GovTech, se crea esa membresía con estado SIN_CLASIFICAR (el
--   backfill legacy; no es un estado nuevo) para no perder el dato.
--   Después se anulan las columnas globales. Un trigger impide que un
--   writer viejo las vuelva a llenar.
--   GovTech queda con toolkit_base_url = https://speakers.govtechsummit.co
--   y el formulario pbNMvy registrado.
--
-- Idempotente: si se corre dos veces, el segundo pase no pisa un
--   toolkit ya copiado (solo copia mientras speakers todavía tenga el
--   artefacto).
--
-- Orden operativo
--   1) Backup lógico de speakers, evento_speakers, eventos,
--      tally_duplicados_pendientes.
--   2) Aplicar ESTE archivo (una transacción).
--   3) Desplegar la app (lee evento_speakers + toolkit_base_url).
--   4) Desplegar la edge function tally-webhook (--no-verify-jwt).
--   5) Redesplegar el worker Railway govtech-imagen (escribe
--      evento_speakers y exige evento_id). Hasta ese redespliegue el
--      worker viejo escribe speakers.link_pieza_fase1 y el trigger lo
--      deja en NULL: la pieza no se guarda.
--
-- El rollback comentado está al final. No lo ejecutes junto con esto.

BEGIN;

-- ── 0) Columnas fuente (prod ya tiene toolkit_slug; el schema del repo no) ─
ALTER TABLE epms.speakers
  ADD COLUMN IF NOT EXISTS toolkit_slug text;

ALTER TABLE epms.speakers
  ADD COLUMN IF NOT EXISTS link_pieza_fase1 text,
  ADD COLUMN IF NOT EXISTS link_pieza_fase2 text,
  ADD COLUMN IF NOT EXISTS link_pieza_fase3 text;

ALTER TABLE epms.speakers
  ADD COLUMN IF NOT EXISTS estado_pieza text;

-- El trigger deja estas columnas en NULL. Si en prod estado_pieza fuera
-- NOT NULL, el trigger rompería cada update de la ficha.
ALTER TABLE epms.speakers ALTER COLUMN estado_pieza DROP NOT NULL;
ALTER TABLE epms.speakers ALTER COLUMN estado_pieza DROP DEFAULT;

-- ── 1) Recursos de toolkit por (evento, speaker) ───────────────────────────
ALTER TABLE epms.evento_speakers
  ADD COLUMN IF NOT EXISTS toolkit_slug text,
  ADD COLUMN IF NOT EXISTS link_pieza_fase1 text,
  ADD COLUMN IF NOT EXISTS link_pieza_fase2 text,
  ADD COLUMN IF NOT EXISTS link_pieza_fase3 text,
  ADD COLUMN IF NOT EXISTS estado_pieza text;

ALTER TABLE epms.evento_speakers
  DROP CONSTRAINT IF EXISTS evento_speakers_estado_pieza_check;

ALTER TABLE epms.evento_speakers
  ADD CONSTRAINT evento_speakers_estado_pieza_check CHECK (
    estado_pieza IS NULL
    OR estado_pieza IN ('PENDIENTE', 'EN_DISENO', 'APROBADO', 'ENVIADO')
  );

COMMENT ON COLUMN epms.evento_speakers.toolkit_slug IS
  'Slug del toolkit de ESTA participación. No se hereda entre eventos.';
COMMENT ON COLUMN epms.evento_speakers.link_pieza_fase1 IS
  'URL de la pieza fase 1 generada para este evento.';
COMMENT ON COLUMN epms.evento_speakers.estado_pieza IS
  'PENDIENTE | EN_DISENO | APROBADO | ENVIADO. NULL = sin pieza en este evento.';

-- ── 2) Dominio del toolkit por evento ──────────────────────────────────────
ALTER TABLE epms.eventos
  ADD COLUMN IF NOT EXISTS toolkit_base_url text;

COMMENT ON COLUMN epms.eventos.toolkit_base_url IS
  'Origen https del toolkit público de este evento, sin barra final. NULL = sin toolkit.';

-- ── 3) Aborta si hay slugs globales duplicados (no se fusionan) ────────────
DO $$
DECLARE
  v_grupos int;
BEGIN
  SELECT COUNT(*) INTO v_grupos
  FROM (
    SELECT 1
    FROM epms.speakers
    WHERE toolkit_slug IS NOT NULL AND btrim(toolkit_slug) <> ''
    GROUP BY btrim(toolkit_slug)
    HAVING COUNT(*) > 1
  ) d;

  IF v_grupos > 0 THEN
    RAISE EXCEPTION
      'ABORT fase0: % grupo(s) con toolkit_slug duplicado en speakers. Sin fusionar.',
      v_grupos;
  END IF;
END $$;

-- ── 4) Backfill hacia GovTech y anulado de la fila global ──────────────────
DO $$
DECLARE
  v_govtech uuid := '2f042639-cc2d-4c06-bea3-f8316a3419c1';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM epms.eventos WHERE id = v_govtech) THEN
    RAISE NOTICE
      'fase0: el evento GovTech % no existe en esta base. Se omite el backfill de datos.',
      v_govtech;
    RETURN;
  END IF;

  UPDATE epms.eventos
  SET toolkit_base_url = 'https://speakers.govtechsummit.co'
  WHERE id = v_govtech
    AND (toolkit_base_url IS NULL OR btrim(toolkit_base_url) = '');

  -- Membresía que ya existe: copiar el artefacto, sin tocar el estado
  -- de prospección y sin pisar un slug que la membresía ya tenga.
  UPDATE epms.evento_speakers es
  SET
    toolkit_slug = COALESCE(es.toolkit_slug, NULLIF(btrim(s.toolkit_slug), '')),
    link_pieza_fase1 = COALESCE(es.link_pieza_fase1, s.link_pieza_fase1),
    link_pieza_fase2 = COALESCE(es.link_pieza_fase2, s.link_pieza_fase2),
    link_pieza_fase3 = COALESCE(es.link_pieza_fase3, s.link_pieza_fase3),
    estado_pieza = COALESCE(es.estado_pieza, s.estado_pieza)
  FROM epms.speakers s
  WHERE es.evento_id = v_govtech
    AND es.speaker_id = s.id
    AND (
      NULLIF(btrim(s.toolkit_slug), '') IS NOT NULL
      OR s.link_pieza_fase1 IS NOT NULL
      OR s.link_pieza_fase2 IS NOT NULL
      OR s.link_pieza_fase3 IS NOT NULL
      OR (s.estado_pieza IS NOT NULL AND s.estado_pieza <> 'PENDIENTE')
    );

  -- Artefacto sin membresía GovTech: crearla (legacy SIN_CLASIFICAR)
  -- para que el dato no se pierda al anular la fila global. No se copia
  -- a ningún otro evento.
  INSERT INTO epms.evento_speakers (
    evento_id,
    speaker_id,
    estado,
    toolkit_slug,
    link_pieza_fase1,
    link_pieza_fase2,
    link_pieza_fase3,
    estado_pieza
  )
  SELECT
    v_govtech,
    s.id,
    'SIN_CLASIFICAR',
    NULLIF(btrim(s.toolkit_slug), ''),
    s.link_pieza_fase1,
    s.link_pieza_fase2,
    s.link_pieza_fase3,
    s.estado_pieza
  FROM epms.speakers s
  WHERE (
      NULLIF(btrim(s.toolkit_slug), '') IS NOT NULL
      OR s.link_pieza_fase1 IS NOT NULL
      OR s.link_pieza_fase2 IS NOT NULL
      OR s.link_pieza_fase3 IS NOT NULL
      OR (s.estado_pieza IS NOT NULL AND s.estado_pieza <> 'PENDIENTE')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM epms.evento_speakers es
      WHERE es.evento_id = v_govtech
        AND es.speaker_id = s.id
    );

  UPDATE epms.speakers s
  SET
    toolkit_slug = NULL,
    link_pieza_fase1 = NULL,
    link_pieza_fase2 = NULL,
    link_pieza_fase3 = NULL,
    estado_pieza = NULL
  WHERE
    NULLIF(btrim(s.toolkit_slug), '') IS NOT NULL
    OR s.link_pieza_fase1 IS NOT NULL
    OR s.link_pieza_fase2 IS NOT NULL
    OR s.link_pieza_fase3 IS NOT NULL
    OR s.estado_pieza IS NOT NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS evento_speakers_toolkit_slug_uidx
  ON epms.evento_speakers (evento_id, toolkit_slug)
  WHERE toolkit_slug IS NOT NULL;

-- Writer viejo (webhook o worker sin redesplegar) no puede reponer el
-- toolkit en la persona global.
CREATE OR REPLACE FUNCTION epms.speakers_descarta_toolkit_global()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.toolkit_slug := NULL;
  NEW.link_pieza_fase1 := NULL;
  NEW.link_pieza_fase2 := NULL;
  NEW.link_pieza_fase3 := NULL;
  NEW.estado_pieza := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_speakers_descarta_toolkit_global ON epms.speakers;

CREATE TRIGGER trg_speakers_descarta_toolkit_global
  BEFORE INSERT OR UPDATE ON epms.speakers
  FOR EACH ROW
  EXECUTE FUNCTION epms.speakers_descarta_toolkit_global();

COMMENT ON COLUMN epms.speakers.toolkit_slug IS
  'OBSOLETO (fase 0). Siempre NULL. El slug vive en evento_speakers.';
COMMENT ON COLUMN epms.speakers.link_pieza_fase1 IS
  'OBSOLETO (fase 0). Siempre NULL. La pieza vive en evento_speakers.';

-- ── 5) Formulario Tally por evento + webhook propio ────────────────────────
CREATE TABLE IF NOT EXISTS epms.tally_formularios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id       uuid NOT NULL REFERENCES epms.eventos(id) ON DELETE CASCADE,
  tally_form_id   text NOT NULL,
  nombre          text,
  activo          boolean NOT NULL DEFAULT true,
  webhook_token   text NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tally_formularios_form_id_key UNIQUE (tally_form_id),
  CONSTRAINT tally_formularios_evento_key UNIQUE (evento_id),
  CONSTRAINT tally_formularios_token_key UNIQUE (webhook_token)
);

COMMENT ON TABLE epms.tally_formularios IS
  'Un formulario Tally por evento. El webhook es /tally-webhook?token=<webhook_token>. Si no viene token, se resuelve por data.formId.';

ALTER TABLE epms.tally_formularios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agenda_all_tally_formularios" ON epms.tally_formularios;
CREATE POLICY "agenda_all_tally_formularios" ON epms.tally_formularios
  FOR ALL TO authenticated
  USING (epms.mi_area() = 'Agenda')
  WITH CHECK (epms.mi_area() = 'Agenda');

-- GovTech: el formulario que ya apunta al webhook sin token.
INSERT INTO epms.tally_formularios (evento_id, tally_form_id, nombre, activo)
SELECT
  '2f042639-cc2d-4c06-bea3-f8316a3419c1',
  'pbNMvy',
  'GovTech Summit 2026',
  true
WHERE EXISTS (
  SELECT 1 FROM epms.eventos WHERE id = '2f042639-cc2d-4c06-bea3-f8316a3419c1'
)
AND NOT EXISTS (
  SELECT 1
  FROM epms.tally_formularios
  WHERE evento_id = '2f042639-cc2d-4c06-bea3-f8316a3419c1'
     OR tally_form_id = 'pbNMvy'
);

-- ── 6) La cola de duplicados recuerda el evento del formulario ─────────────
ALTER TABLE epms.tally_duplicados_pendientes
  ADD COLUMN IF NOT EXISTS evento_id uuid REFERENCES epms.eventos(id) ON DELETE SET NULL;

COMMENT ON COLUMN epms.tally_duplicados_pendientes.evento_id IS
  'Evento del formulario que generó el duplicado. No aplica los campos.';

CREATE INDEX IF NOT EXISTS idx_tally_duplicados_evento
  ON epms.tally_duplicados_pendientes (evento_id);

-- ── 7) Match de email = lower(btrim(email)), el mismo índice de Bloque 1 ──
CREATE OR REPLACE FUNCTION epms.buscar_speaker_por_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = epms, public
AS $$
  SELECT s.id
  FROM epms.speakers s
  WHERE p_email IS NOT NULL
    AND btrim(p_email) <> ''
    AND lower(btrim(s.email)) = lower(btrim(p_email))
  LIMIT 1;
$$;

COMMENT ON FUNCTION epms.buscar_speaker_por_email(text) IS
  'Id del speaker cuyo email normalizado (lower(btrim)) coincide. NULL si no hay.';

REVOKE ALL ON FUNCTION epms.buscar_speaker_por_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION epms.buscar_speaker_por_email(text) TO authenticated, service_role;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (no forma parte de la transacción de arriba; ejecutarlo a mano
-- solo si hay que deshacer el esquema). La app nueva deja de funcionar.
--
-- BEGIN;
--
-- DROP TRIGGER IF EXISTS trg_speakers_descarta_toolkit_global ON epms.speakers;
-- DROP FUNCTION IF EXISTS epms.speakers_descarta_toolkit_global();
--
-- -- Devolver el toolkit de GovTech a la fila global.
-- UPDATE epms.speakers s
-- SET
--   toolkit_slug = es.toolkit_slug,
--   link_pieza_fase1 = es.link_pieza_fase1,
--   link_pieza_fase2 = es.link_pieza_fase2,
--   link_pieza_fase3 = es.link_pieza_fase3,
--   estado_pieza = COALESCE(es.estado_pieza, 'PENDIENTE')
-- FROM epms.evento_speakers es
-- WHERE es.evento_id = '2f042639-cc2d-4c06-bea3-f8316a3419c1'
--   AND es.speaker_id = s.id
--   AND (
--     es.toolkit_slug IS NOT NULL
--     OR es.link_pieza_fase1 IS NOT NULL
--     OR es.link_pieza_fase2 IS NOT NULL
--     OR es.link_pieza_fase3 IS NOT NULL
--     OR es.estado_pieza IS NOT NULL
--   );
--
-- DROP FUNCTION IF EXISTS epms.buscar_speaker_por_email(text);
--
-- ALTER TABLE epms.tally_duplicados_pendientes DROP COLUMN IF EXISTS evento_id;
-- DROP TABLE IF EXISTS epms.tally_formularios;
--
-- ALTER TABLE epms.eventos DROP COLUMN IF EXISTS toolkit_base_url;
--
-- DROP INDEX IF EXISTS epms.evento_speakers_toolkit_slug_uidx;
-- ALTER TABLE epms.evento_speakers
--   DROP CONSTRAINT IF EXISTS evento_speakers_estado_pieza_check;
-- ALTER TABLE epms.evento_speakers
--   DROP COLUMN IF EXISTS toolkit_slug,
--   DROP COLUMN IF EXISTS link_pieza_fase1,
--   DROP COLUMN IF EXISTS link_pieza_fase2,
--   DROP COLUMN IF EXISTS link_pieza_fase3,
--   DROP COLUMN IF EXISTS estado_pieza;
--
-- -- Las membresías GovTech creadas en el backfill (estado SIN_CLASIFICAR,
-- -- speaker que antes no estaba en el evento) NO se borran solas.
-- -- Revísalas antes de borrarlas a mano.
--
-- COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────
