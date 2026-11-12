-- Membresía speaker ↔ evento (workspace).
-- Un speaker del pool global puede asociarse a varios eventos sin re-crearlo.
-- Backfill: quien ya tiene sesión en un evento queda asociado automáticamente.

CREATE TABLE IF NOT EXISTS epms.evento_speakers (
    evento_id   uuid NOT NULL REFERENCES epms.eventos(id) ON DELETE CASCADE,
    speaker_id  uuid NOT NULL REFERENCES epms.speakers(id) ON DELETE CASCADE,
    created_at  timestamptz DEFAULT now(),
    PRIMARY KEY (evento_id, speaker_id)
);

CREATE INDEX IF NOT EXISTS idx_evento_speakers_speaker
    ON epms.evento_speakers(speaker_id);

CREATE INDEX IF NOT EXISTS idx_evento_speakers_evento
    ON epms.evento_speakers(evento_id);

INSERT INTO epms.evento_speakers (evento_id, speaker_id)
SELECT DISTINCT esc.evento_id, ss.speaker_id
FROM epms.sesion_speakers ss
JOIN epms.sesiones s ON s.id = ss.sesion_id
JOIN epms.slots sl ON sl.id = s.slot_id
JOIN epms.escenarios esc ON esc.id = sl.escenario_id
ON CONFLICT DO NOTHING;

ALTER TABLE epms.evento_speakers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agenda_all_evento_speakers" ON epms.evento_speakers;
CREATE POLICY "agenda_all_evento_speakers" ON epms.evento_speakers
    FOR ALL TO authenticated
    USING (epms.mi_area() = 'Agenda')
    WITH CHECK (epms.mi_area() = 'Agenda');

DROP POLICY IF EXISTS "sales_cs_read_evento_speakers" ON epms.evento_speakers;
CREATE POLICY "sales_cs_read_evento_speakers" ON epms.evento_speakers
    FOR SELECT TO authenticated
    USING (epms.mi_area() IN ('Sales', 'CS'));
