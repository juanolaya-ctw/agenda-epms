-- Dashboard en tiempo real: checkboxes (Envio Fotos, toolkit, etc.), asignaciones y pool de speakers.
-- Idempotente: no falla si la tabla ya está publicada.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['valores_propiedades','sesion_speakers','speakers'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'epms' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE epms.%I', t);
    END IF;
  END LOOP;
END $$;
