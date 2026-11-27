-- EPMS — Fix: GRANT DELETE para desasociar / eliminar speakers
-- NO aplicar en producción sin leer este encabezado.
-- NO ejecutar contra la base desde el repo: el owner lo corre en el SQL Editor.
--
-- Causa en prod: authenticated tenía SELECT/INSERT/UPDATE en
-- epms.evento_speakers pero NO DELETE. "Quitar del evento" fallaba con
-- "permission denied for table evento_speakers". La policy RLS
-- agenda_all_evento_speakers (FOR ALL) ya limita a Agenda; solo faltaba
-- el privilege de tabla.
--
-- También se otorga DELETE en sesion_speakers y valores_propiedades:
-- eliminarSpeaker (y quitarSpeakerDeEvento) borran esas tablas antes del
-- perfil global / membresía. En el repo no hay GRANT DELETE explícito
-- para ellas; el mismo hueco de privilegios que en evento_speakers haría
-- fallar (o silenciar) esos deletes. RLS de Agenda sigue gobernando.
--
-- Sin BEGIN/COMMIT a pedido (statement sueltos, idempotentes vía GRANT).

GRANT DELETE ON epms.evento_speakers TO authenticated;
GRANT DELETE ON epms.sesion_speakers TO authenticated;
GRANT DELETE ON epms.valores_propiedades TO authenticated;
