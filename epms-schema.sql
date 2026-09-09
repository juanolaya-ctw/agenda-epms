-- ============================================================
-- ACTUALIZADO: refleja el estado real de producción al 2026-09-09.
-- Incluye cambios aplicados directamente en Supabase que no
-- estaban en la versión original de este archivo
-- (propiedades_custom.entidad, valores_propiedades.speaker_id,
-- e índices de FKs muy consultadas).
-- ============================================================
-- EPMS — Event Programming Management System
-- Schema: epms
-- Proyecto Supabase: ydqbjyhcntszvrytdkml (ctw-speakers-system)
-- Ejecutar completo en el SQL Editor de Supabase
-- ============================================================

-- 0. Crear schema
CREATE SCHEMA IF NOT EXISTS epms;

-- Habilitar extensión uuid si no está activa
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLAS BASE
-- ============================================================

-- 1. Eventos (workspace raíz)
CREATE TABLE epms.eventos (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre          text NOT NULL,
    fecha_inicio    date,
    fecha_fin       date,
    cover_url       text,           -- imagen de portada del workspace
    cover_color     text,           -- fallback color/gradiente si no hay imagen
    activo          boolean DEFAULT true,
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

-- 2. Escenarios (scopeados por evento)
CREATE TABLE epms.escenarios (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id       uuid NOT NULL REFERENCES epms.eventos(id) ON DELETE CASCADE,
    nombre          text NOT NULL,
    capacidad_fisica integer,
    created_at      timestamptz DEFAULT now()
);

-- 3. Tracks (scopeados por evento)
CREATE TABLE epms.tracks (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id       uuid NOT NULL REFERENCES epms.eventos(id) ON DELETE CASCADE,
    nombre          text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

-- 4. Formatos (scopeados por evento)
CREATE TABLE epms.formatos (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id       uuid NOT NULL REFERENCES epms.eventos(id) ON DELETE CASCADE,
    nombre          text NOT NULL,   -- ej: 'Keynote', 'Panel', 'Workshop'
    created_at      timestamptz DEFAULT now()
);

-- 5. Slots (bloques de tiempo dentro de un escenario)
-- Constraint de no-solape: validación en UI, no en DB (deuda técnica abierta)
CREATE TABLE epms.slots (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    escenario_id    uuid NOT NULL REFERENCES epms.escenarios(id) ON DELETE CASCADE,
    dia             date NOT NULL,
    hora_inicio     time NOT NULL,
    hora_fin        time NOT NULL,
    created_at      timestamptz DEFAULT now(),
    CONSTRAINT hora_valida CHECK (hora_fin > hora_inicio)
);

-- 5b. Estados de sesión (catálogo editable por evento, igual que tracks/formatos)
CREATE TABLE epms.estados_sesion (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id          uuid NOT NULL REFERENCES epms.eventos(id) ON DELETE CASCADE,
    nombre             text NOT NULL,
    orden              integer NOT NULL DEFAULT 0,
    color              text DEFAULT 'gray',  -- 'gray'|'yellow'|'green'|'red'|'blue' — badges/kanban
    cuenta_para_cupos  boolean NOT NULL DEFAULT true,  -- si false, el Dashboard lo excluye del KPI de cupos abiertos
    created_at         timestamptz DEFAULT now()
);
-- Defaults sembrados al crear un evento: solo 'BORRADOR' y 'CONFIRMADA'.
-- No hay estado 'CANCELADA' de fábrica; el equipo crea los que necesite
-- (y desmarca cuenta_para_cupos en los que no deban contar).

-- 6. Sesiones
-- estado: texto libre; el catálogo válido vive en epms.estados_sesion (por evento),
-- no en un CHECK. El DEFAULT 'BORRADOR' se conserva por compatibilidad.
CREATE TABLE epms.sesiones (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_id             uuid REFERENCES epms.slots(id) ON DELETE SET NULL,
    titulo              text NOT NULL,
    descripcion         text,           -- placeholder libre, campo solicitado por el equipo
    formato             text,           -- 'Keynote' | 'Panel' | 'Workshop' (texto libre, no FK a formatos para flexibilidad)
    track               text,
    capacidad_speakers  integer DEFAULT 1 CHECK (capacidad_speakers BETWEEN 1 AND 4),
    estado              text DEFAULT 'BORRADOR',
    created_at          timestamptz DEFAULT now(),
    updated_at          timestamptz DEFAULT now()
);

-- 7. Speakers (pool GLOBAL — no scopeado por evento)
-- Campos de GovTech Tally (formulario pbNMvy, 12 campos confirmados)
-- Campos de piezas por fases (Opción A: piezas viven en el EPMS)
CREATE TABLE epms.speakers (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Datos de perfil (desde Tally o ingreso manual)
    nombre              text NOT NULL,
    pais                text,
    email               text NOT NULL,
    ciudad              text,
    telefono            text,
    linkedin_url        text,
    tipo_documento      text,
    numero_documento    text,
    empresa             text,
    cargo               text,
    email_secundario    text,
    foto_url            text,           -- URL de archivo Tally (no Drive); ver nota de re-alojamiento en PRD §2.1.2
    bio                 text,

    -- Metadatos de ingreso
    fuente              text DEFAULT 'tally' CHECK (fuente IN ('tally', 'admin_manual', 'import_sheet')),

    -- Piezas gráficas por fases (Opción A confirmada)
    link_pieza_fase1    text,           -- "Soy speaker" — URL Drive
    link_pieza_fase2    text,           -- "Soy speaker x día" — URL Drive
    link_pieza_fase3    text,           -- "Mi panel" — URL Drive
    estado_pieza        text DEFAULT 'PENDIENTE' CHECK (estado_pieza IN ('PENDIENTE', 'EN_DISENO', 'APROBADO', 'ENVIADO')),

    -- Timestamps
    created_at          timestamptz DEFAULT now(),
    updated_at          timestamptz DEFAULT now(),

    -- Unicidad por email (llave de no-duplicado del webhook Tally)
    CONSTRAINT speakers_email_unique UNIQUE (email)
);

-- 8. Sesion_speakers (tabla puente — muchos a muchos con rol)
CREATE TABLE epms.sesion_speakers (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sesion_id   uuid NOT NULL REFERENCES epms.sesiones(id) ON DELETE CASCADE,
    speaker_id  uuid NOT NULL REFERENCES epms.speakers(id) ON DELETE CASCADE,
    rol         text NOT NULL DEFAULT 'panelista' CHECK (rol IN ('moderador', 'panelista', 'host', 'keynote')),
    created_at  timestamptz DEFAULT now(),
    UNIQUE (sesion_id, speaker_id)
);

-- 9. Usuarios (roles individuales por persona, referencia a Supabase Auth)
CREATE TABLE epms.usuarios (
    id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre      text NOT NULL,
    email       text NOT NULL UNIQUE,
    area        text NOT NULL CHECK (area IN ('Agenda', 'Sales', 'CS')),
    rol         text NOT NULL DEFAULT 'colaborador' CHECK (rol IN ('admin', 'colaborador')),
    created_at  timestamptz DEFAULT now()
);

-- 10. Requests (propuestas y conflictos de Sales/CS → Agenda)
CREATE TABLE epms.requests (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    speaker_id          uuid REFERENCES epms.speakers(id) ON DELETE SET NULL,
    sesion_id           uuid REFERENCES epms.sesiones(id) ON DELETE SET NULL,
    tipo                text NOT NULL CHECK (tipo IN ('propuesta_speaker', 'conflicto', 'ajuste')),
    motivo              text NOT NULL,
    solicitante_id      uuid NOT NULL REFERENCES epms.usuarios(id),
    solicitante_area    text NOT NULL CHECK (solicitante_area IN ('Sales', 'CS')),
    estado              text DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'EN_REVISION', 'APROBADO', 'RECHAZADO')),
    respuesta_agenda    text,
    decidido_por        uuid REFERENCES epms.usuarios(id),
    created_at          timestamptz DEFAULT now(),
    updated_at          timestamptz DEFAULT now()
);

-- 11. Tally duplicados pendientes (submits rechazados por email ya existente)
CREATE TABLE epms.tally_duplicados_pendientes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email           text NOT NULL,
    payload_raw     jsonb NOT NULL,     -- payload completo de Tally para revisión manual
    revisado        boolean DEFAULT false,
    created_at      timestamptz DEFAULT now()
);

-- 12. Propiedades custom de sesiones (motor tipo Notion)
CREATE TABLE epms.propiedades_custom (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id   uuid NOT NULL REFERENCES epms.eventos(id) ON DELETE CASCADE,
    entidad     text NOT NULL DEFAULT 'sesion' CHECK (entidad IN ('sesion', 'speaker')),
    nombre      text NOT NULL,
    tipo        text NOT NULL CHECK (tipo IN ('texto', 'select', 'fecha', 'checklist', 'checkbox')),  -- checkbox: valor jsonb boolean simple
    opciones    jsonb,          -- solo aplica si tipo = 'select': ["opción 1", "opción 2"]
    orden       integer DEFAULT 0,
    created_at  timestamptz DEFAULT now()
);

-- 13. Valores de propiedades custom por sesión O por speaker
CREATE TABLE epms.valores_propiedades (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sesion_id       uuid REFERENCES epms.sesiones(id) ON DELETE CASCADE,
    speaker_id      uuid REFERENCES epms.speakers(id) ON DELETE CASCADE,
    propiedad_id    uuid NOT NULL REFERENCES epms.propiedades_custom(id) ON DELETE CASCADE,
    valor           jsonb,      -- texto: "string", select: "opción", fecha: "2026-08-13", checklist: [{"label":"X","checked":true}]
    updated_at      timestamptz DEFAULT now(),
    CONSTRAINT valor_tiene_exactamente_una_entidad CHECK (
        (sesion_id IS NOT NULL AND speaker_id IS NULL) OR
        (sesion_id IS NULL AND speaker_id IS NOT NULL)
    ),
    UNIQUE (sesion_id, propiedad_id)
);

-- ============================================================
-- TRIGGERS — updated_at automático
-- ============================================================

CREATE OR REPLACE FUNCTION epms.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_eventos_updated_at
    BEFORE UPDATE ON epms.eventos
    FOR EACH ROW EXECUTE FUNCTION epms.set_updated_at();

CREATE TRIGGER trg_sesiones_updated_at
    BEFORE UPDATE ON epms.sesiones
    FOR EACH ROW EXECUTE FUNCTION epms.set_updated_at();

CREATE TRIGGER trg_speakers_updated_at
    BEFORE UPDATE ON epms.speakers
    FOR EACH ROW EXECUTE FUNCTION epms.set_updated_at();

CREATE TRIGGER trg_requests_updated_at
    BEFORE UPDATE ON epms.requests
    FOR EACH ROW EXECUTE FUNCTION epms.set_updated_at();

-- ============================================================
-- ÍNDICES
-- ============================================================

CREATE INDEX idx_escenarios_evento ON epms.escenarios(evento_id);
CREATE INDEX idx_slots_escenario ON epms.slots(escenario_id);
CREATE INDEX idx_sesiones_slot ON epms.sesiones(slot_id);
CREATE INDEX idx_sesion_speakers_sesion ON epms.sesion_speakers(sesion_id);
CREATE INDEX idx_sesion_speakers_speaker ON epms.sesion_speakers(speaker_id);
CREATE INDEX idx_speakers_email ON epms.speakers(email);
CREATE INDEX idx_requests_estado ON epms.requests(estado);
CREATE INDEX idx_requests_solicitante ON epms.requests(solicitante_id);
CREATE INDEX idx_propiedades_evento ON epms.propiedades_custom(evento_id);
CREATE INDEX idx_valores_sesion ON epms.valores_propiedades(sesion_id);

-- Índices agregados post-lanzamiento (FKs consultadas en cada carga de vista)
CREATE INDEX idx_tracks_evento ON epms.tracks(evento_id);
CREATE INDEX idx_formatos_evento ON epms.formatos(evento_id);
CREATE INDEX idx_requests_sesion ON epms.requests(sesion_id);
CREATE INDEX idx_valores_propiedad ON epms.valores_propiedades(propiedad_id);
CREATE INDEX idx_valores_speaker ON epms.valores_propiedades(speaker_id);
CREATE INDEX idx_estados_sesion_evento ON epms.estados_sesion(evento_id);

-- ============================================================
-- RLS — Row Level Security
-- ============================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE epms.eventos                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE epms.escenarios                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE epms.tracks                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE epms.formatos                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE epms.slots                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE epms.sesiones                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE epms.speakers                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE epms.sesion_speakers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE epms.usuarios                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE epms.requests                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE epms.tally_duplicados_pendientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE epms.propiedades_custom         ENABLE ROW LEVEL SECURITY;
ALTER TABLE epms.valores_propiedades        ENABLE ROW LEVEL SECURITY;
ALTER TABLE epms.estados_sesion             ENABLE ROW LEVEL SECURITY;
-- NOTA: estados_sesion se creó con políticas permisivas (anon+authenticated,
-- USING(true)/WITH CHECK(true)) — diverge del patrón mi_area()='Agenda' del
-- resto del schema. Revisar si se quiere endurecer.

-- Helper: obtener área del usuario autenticado
CREATE OR REPLACE FUNCTION epms.mi_area()
RETURNS text AS $$
    SELECT area FROM epms.usuarios WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: obtener rol del usuario autenticado
CREATE OR REPLACE FUNCTION epms.mi_rol()
RETURNS text AS $$
    SELECT rol FROM epms.usuarios WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- service_role bypassa RLS por defecto en Supabase — no necesita políticas explícitas

-- Eventos: Agenda ALL, Sales/CS SELECT
CREATE POLICY "agenda_all_eventos" ON epms.eventos
    FOR ALL TO authenticated
    USING (epms.mi_area() = 'Agenda')
    WITH CHECK (epms.mi_area() = 'Agenda');

CREATE POLICY "sales_cs_read_eventos" ON epms.eventos
    FOR SELECT TO authenticated
    USING (epms.mi_area() IN ('Sales', 'CS'));

-- Escenarios, tracks, formatos, slots: mismo patrón
CREATE POLICY "agenda_all_escenarios" ON epms.escenarios
    FOR ALL TO authenticated
    USING (epms.mi_area() = 'Agenda') WITH CHECK (epms.mi_area() = 'Agenda');

CREATE POLICY "sales_cs_read_escenarios" ON epms.escenarios
    FOR SELECT TO authenticated USING (epms.mi_area() IN ('Sales', 'CS'));

CREATE POLICY "agenda_all_tracks" ON epms.tracks
    FOR ALL TO authenticated
    USING (epms.mi_area() = 'Agenda') WITH CHECK (epms.mi_area() = 'Agenda');

CREATE POLICY "sales_cs_read_tracks" ON epms.tracks
    FOR SELECT TO authenticated USING (epms.mi_area() IN ('Sales', 'CS'));

CREATE POLICY "agenda_all_formatos" ON epms.formatos
    FOR ALL TO authenticated
    USING (epms.mi_area() = 'Agenda') WITH CHECK (epms.mi_area() = 'Agenda');

CREATE POLICY "sales_cs_read_formatos" ON epms.formatos
    FOR SELECT TO authenticated USING (epms.mi_area() IN ('Sales', 'CS'));

CREATE POLICY "agenda_all_slots" ON epms.slots
    FOR ALL TO authenticated
    USING (epms.mi_area() = 'Agenda') WITH CHECK (epms.mi_area() = 'Agenda');

CREATE POLICY "sales_cs_read_slots" ON epms.slots
    FOR SELECT TO authenticated USING (epms.mi_area() IN ('Sales', 'CS'));

-- Sesiones
CREATE POLICY "agenda_all_sesiones" ON epms.sesiones
    FOR ALL TO authenticated
    USING (epms.mi_area() = 'Agenda') WITH CHECK (epms.mi_area() = 'Agenda');

CREATE POLICY "sales_cs_read_sesiones" ON epms.sesiones
    FOR SELECT TO authenticated USING (epms.mi_area() IN ('Sales', 'CS'));

-- Sesion_speakers
CREATE POLICY "agenda_all_sesion_speakers" ON epms.sesion_speakers
    FOR ALL TO authenticated
    USING (epms.mi_area() = 'Agenda') WITH CHECK (epms.mi_area() = 'Agenda');

CREATE POLICY "sales_cs_read_sesion_speakers" ON epms.sesion_speakers
    FOR SELECT TO authenticated USING (epms.mi_area() IN ('Sales', 'CS'));

-- Speakers: Agenda ALL, Sales/CS solo SELECT
CREATE POLICY "agenda_all_speakers" ON epms.speakers
    FOR ALL TO authenticated
    USING (epms.mi_area() = 'Agenda') WITH CHECK (epms.mi_area() = 'Agenda');

CREATE POLICY "sales_cs_read_speakers" ON epms.speakers
    FOR SELECT TO authenticated USING (epms.mi_area() IN ('Sales', 'CS'));

-- Requests: Sales/CS insert+select propios; Agenda ALL
CREATE POLICY "sales_cs_insert_requests" ON epms.requests
    FOR INSERT TO authenticated
    WITH CHECK (epms.mi_area() IN ('Sales', 'CS') AND solicitante_id = auth.uid());

CREATE POLICY "sales_cs_read_own_requests" ON epms.requests
    FOR SELECT TO authenticated
    USING (epms.mi_area() IN ('Sales', 'CS') AND solicitante_id = auth.uid());

CREATE POLICY "agenda_all_requests" ON epms.requests
    FOR ALL TO authenticated
    USING (epms.mi_area() = 'Agenda') WITH CHECK (epms.mi_area() = 'Agenda');

-- Usuarios: cada uno lee el suyo; Agenda admin ve todos
CREATE POLICY "read_own_usuario" ON epms.usuarios
    FOR SELECT TO authenticated USING (id = auth.uid());

CREATE POLICY "agenda_admin_all_usuarios" ON epms.usuarios
    FOR ALL TO authenticated
    USING (epms.mi_area() = 'Agenda' AND epms.mi_rol() = 'admin')
    WITH CHECK (epms.mi_area() = 'Agenda' AND epms.mi_rol() = 'admin');

-- Tally duplicados: solo Agenda
CREATE POLICY "agenda_all_duplicados" ON epms.tally_duplicados_pendientes
    FOR ALL TO authenticated
    USING (epms.mi_area() = 'Agenda') WITH CHECK (epms.mi_area() = 'Agenda');

-- Propiedades custom: Agenda ALL, Sales/CS SELECT
CREATE POLICY "agenda_all_propiedades" ON epms.propiedades_custom
    FOR ALL TO authenticated
    USING (epms.mi_area() = 'Agenda') WITH CHECK (epms.mi_area() = 'Agenda');

CREATE POLICY "sales_cs_read_propiedades" ON epms.propiedades_custom
    FOR SELECT TO authenticated USING (epms.mi_area() IN ('Sales', 'CS'));

CREATE POLICY "agenda_all_valores" ON epms.valores_propiedades
    FOR ALL TO authenticated
    USING (epms.mi_area() = 'Agenda') WITH CHECK (epms.mi_area() = 'Agenda');

CREATE POLICY "sales_cs_read_valores" ON epms.valores_propiedades
    FOR SELECT TO authenticated USING (epms.mi_area() IN ('Sales', 'CS'));

-- ============================================================
-- REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE epms.sesiones;
ALTER PUBLICATION supabase_realtime ADD TABLE epms.sesion_speakers;
ALTER PUBLICATION supabase_realtime ADD TABLE epms.requests;
ALTER PUBLICATION supabase_realtime ADD TABLE epms.speakers;

ALTER TABLE epms.sesiones         REPLICA IDENTITY FULL;
ALTER TABLE epms.sesion_speakers  REPLICA IDENTITY FULL;
ALTER TABLE epms.requests         REPLICA IDENTITY FULL;
ALTER TABLE epms.speakers         REPLICA IDENTITY FULL;

-- ============================================================
-- VISTAS DE REPORTES (solo lectura; base para un dashboard de reportes futuro)
-- ============================================================
-- v_resumen_speakers_evento: por evento, total de speakers asignados a alguna
--   sesión, cuántos entraron vía Tally y cuántos tienen foto.
-- v_progreso_propiedades_speaker: por propiedad custom de speaker, cuántos
--   valores hay registrados y (para tipo 'checkbox') cuántos están en true.
--   Sirve para reportes tipo "cuántos speakers tienen 'Pieza Soy Speaker' marcada".
-- Ambas usan SECURITY INVOKER (default) → respetan la RLS del que consulta.

CREATE OR REPLACE VIEW epms.v_resumen_speakers_evento AS
SELECT
  e.id as evento_id,
  e.nombre as evento_nombre,
  COUNT(DISTINCT sp.id) as total_speakers,
  COUNT(DISTINCT sp.id) FILTER (WHERE sp.fuente = 'tally') as speakers_via_tally,
  COUNT(DISTINCT sp.id) FILTER (WHERE sp.foto_url IS NOT NULL) as speakers_con_foto
FROM epms.eventos e
LEFT JOIN epms.escenarios esc ON esc.evento_id = e.id
LEFT JOIN epms.slots sl ON sl.escenario_id = esc.id
LEFT JOIN epms.sesiones ses ON ses.slot_id = sl.id
LEFT JOIN epms.sesion_speakers ss ON ss.sesion_id = ses.id
LEFT JOIN epms.speakers sp ON sp.id = ss.speaker_id
GROUP BY e.id, e.nombre;

CREATE OR REPLACE VIEW epms.v_progreso_propiedades_speaker AS
SELECT
  pc.evento_id,
  pc.id as propiedad_id,
  pc.nombre as propiedad_nombre,
  pc.tipo,
  COUNT(vp.id) as total_valores_registrados,
  COUNT(vp.id) FILTER (
    WHERE pc.tipo = 'checkbox' AND vp.valor::text = 'true'
  ) as marcados_true
FROM epms.propiedades_custom pc
LEFT JOIN epms.valores_propiedades vp ON vp.propiedad_id = pc.id
WHERE pc.entidad = 'speaker'
GROUP BY pc.evento_id, pc.id, pc.nombre, pc.tipo;

-- ============================================================
-- DATO INICIAL — GovTech Summit 2026
-- ============================================================

INSERT INTO epms.eventos (nombre, fecha_inicio, fecha_fin, activo)
VALUES ('GovTech Summit 2026', '2026-08-13', '2026-08-14', true);

-- ============================================================
-- FIN DEL SCHEMA
-- Siguiente paso: desplegar Edge Function tally-webhook
-- ============================================================
