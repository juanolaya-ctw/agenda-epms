# PRD — Event Programming Management System (EPMS)
## Capa compartida de programación de eventos · Colombia Tech Week

**Versión:** 1.0 (MVP)
**Fecha:** Agosto 2026
**Proyecto Supabase:** nuevo, separado de `ctw-speakers-system`
**Audiencia:** Equipo técnico (developers, Claude Code)

---

## 1. Visión general

El EPMS reemplaza el Excel/Google Sheet de Agenda como fuente de verdad operativa. Agenda gestiona la programación completa (eventos, escenarios, slots, sesiones, asignación de speakers) desde un **Panel Admin con escritura directa a Supabase**, sin capa de sync intermedia. Sales y Customer Success consumen esa misma información en tiempo real desde vistas de solo lectura, y pueden generar **Requests** estructurados para proponer cambios — pero no pueden editar la agenda directamente.

**Principio fundacional:** exploración descentralizada, decisión editorial centralizada. Agenda mantiene control total sobre la composición final de la programación.

**Flujo de alto nivel:**
```
Tally (post-confirmación)          Panel Admin (Agenda)
    ↓ webhook, solo INSERT              ↓ escritura directa
    └──────────────┬──────────────────┘
                    ▼
              Supabase (RLS por rol)
                    ↓ Realtime
       ┌────────────┼────────────┐
       ▼            ▼            ▼
  Vista Agenda  Vista Sales   Vista CS
                    │            │
                    └─────┬──────┘
                          ▼
                  Tabla Requests
                          ↓
                 Bandeja de Agenda
                          ↓
              Aprobar / Rechazar / Pedir info
                          ↓
                 Actualiza agenda maestra
```

**Diferencia deliberada respecto al patrón de Speakers CTF2026:** ese sistema usa Google Sheets como fuente de verdad con sync cada 5 min vía Railway. El EPMS **no reutiliza ese patrón**. Agenda escribe directo a Supabase desde un panel propio porque el cuello de botella identificado es la latencia de actualización durante el evento en vivo — un ciclo de sync, por rápido que sea, sigue siendo más lento que escritura directa, y el Sheet además era incómodo de consultar para el resto del equipo.

---

## 2. Componentes del sistema

### 2.1 Intake — Formulario Tally (post-confirmación)

**Momento en el flujo:** el speaker ya fue confirmado por Agenda o Sales *fuera del sistema*. El Tally no es un formulario de aplicación ni de intención — es el mecanismo para que un speaker ya confirmado entregue sus datos de perfil.

**Campos del formulario (tal como existen hoy en Tally):**

| Campo Tally | Campo Supabase | Notas |
|---|---|---|
| Dirección de correo electrónico | *(descartado)* | Duplicado de diseño del form. No se usa. |
| Nombre y Apellidos/Full Name | `nombre` | |
| Tipo de documento de identidad/ID Type | `tipo_documento` | |
| Número de identificación / ID Number | `numero_documento` | |
| Cargo / Rol Actual | `cargo` | |
| Empresa / Organización | `empresa` | |
| Enlace a tu perfil de LinkedIn | `linkedin_url` | |
| Correo Electrónico Principal | `email` | **Llave de identificación.** Ver regla de no-duplicado abajo. |
| Correo Electrónico Secundario o de Asistente (Opcional) | `email_secundario` | |
| ¿De qué te imaginas hablando en el evento? | `tema_propuesto` | Aplica a `Speaker escenario` |
| Enfoque de la conferencia (máx. 200 palabras) | `resumen_conferencia` | Aplica a `Speaker escenario` |
| Disponibilidad de agenda | `disponibilidad_dias` | |
| Sube tu imagen | `foto_url` | URL de archivo alojado por Tally, no Drive. Ver 2.1.2. |
| Tipo de participación a la que has sido invitado | `tipo_participacion` | Valores: `Speaker escenario`, `Speaker workshop`, `Moderador`, `Host` |
| Número telefónico personal | `telefono` | |
| Describe el desarrollo de tu taller | `descripcion_taller` | Aplica a `Speaker workshop` |
| Outcome esperado | `outcome_esperado` | Aplica a `Speaker workshop` |
| ¿Se necesita alguna herramienta específica? | `herramientas_requeridas` | Aplica a `Speaker workshop` |
| Bio | `bio` | |

> ⚠️ **El formulario en Tally es plano, sin lógica condicional.** Los campos de workshop (`descripcion_taller`, `outcome_esperado`, `herramientas_requeridas`) y de conferencia (`tema_propuesto`, `resumen_conferencia`) coexisten para todos los tipos de participación. El backend infiere cuáles son relevantes según `tipo_participacion` — no se debe usar la presencia/ausencia de estos campos como señal de validez del registro.

#### 2.1.1 Regla de no-duplicado (crítica)

**Tally solo puede INSERTAR, nunca actualizar un registro existente.** No hay upsert por email.

Antes de insertar, el webhook debe verificar si ya existe un speaker con el mismo `email`:

```
SI existe speaker con email = payload.email:
    → NO insertar
    → Insertar en tabla `tally_duplicados_pendientes` con el payload completo
    → (Opcional fase 2: notificación a Agenda)
SI NO existe:
    → INSERT normal en `speakers`
```

> **Por qué esta regla:** permitir que Agenda edite manualmente un registro en el Panel Admin sin riesgo de que un segundo submit de Tally (reenvío accidental del link, el speaker llenándolo dos veces) sobreescriba esa corrección. La contraparte es que un segundo submit legítimo (ej. el speaker corrigiendo un error tipográfico) no se aplica automáticamente — queda en la tabla de pendientes para revisión manual de Agenda. Esto es una decisión consciente de priorizar no perder ediciones de Agenda sobre la conveniencia del speaker de autocorregirse.

#### 2.1.2 Manejo de imagen

La URL que entrega Tally para "Sube tu imagen" es un archivo alojado por Tally, **no** una URL de Google Drive. El helper `getDirectDriveImageUrl` usado en el proyecto de Speakers no aplica aquí. Se debe implementar un manejo directo de la URL de Tally como `<img src>`, validando que el link responda antes de guardarlo como `foto_url` definitiva (fase 2: descargar y re-alojar en Supabase Storage para no depender de la disponibilidad del CDN de Tally a largo plazo).

---

### 2.2 Supabase — Modelo de datos

**Proyecto:** nuevo, no reutiliza `ydqbjyhcntszvrytdkml`.

#### Jerarquía de entidades

```
eventos
   └── escenarios
          └── slots
                 └── sesiones
                        └── sesion_speakers (tabla puente) ──→ speakers
```

#### Tabla `eventos`

```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
nombre              text NOT NULL
fecha_inicio        date NOT NULL
fecha_fin           date NOT NULL
activo              boolean DEFAULT true
created_at          timestamptz DEFAULT now()
updated_at          timestamptz DEFAULT now()
```

#### Tabla `escenarios`

```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
evento_id           uuid NOT NULL REFERENCES eventos(id)
nombre              text NOT NULL          -- ej. "Escenario Origen"
capacidad_fisica    integer                -- capacidad del espacio físico (opcional, informativo)
created_at          timestamptz DEFAULT now()
```

#### Tabla `slots`

Un slot es un bloque de tiempo dentro de un escenario, exista o no una sesión asignada todavía.

```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
escenario_id        uuid NOT NULL REFERENCES escenarios(id)
dia                 date NOT NULL
hora_inicio         time NOT NULL
hora_fin            time NOT NULL
created_at          timestamptz DEFAULT now()

CONSTRAINT slot_sin_solape -- ver 2.2.1
```

#### Tabla `sesiones`

```sql
id                      uuid PRIMARY KEY DEFAULT gen_random_uuid()
slot_id                 uuid NOT NULL REFERENCES slots(id)
titulo                  text NOT NULL
formato                 text NOT NULL    -- 'Charla', 'Panel', 'Workshop'
track                   text
descripcion             text
capacidad_speakers      integer DEFAULT 1 CHECK (capacidad_speakers BETWEEN 1 AND 4)
estado                  text DEFAULT 'BORRADOR'   -- BORRADOR / CONFIRMADA / CANCELADA
created_at              timestamptz DEFAULT now()
updated_at              timestamptz DEFAULT now()
```

#### Tabla `speakers`

```sql
id                      uuid PRIMARY KEY DEFAULT gen_random_uuid()
nombre                  text NOT NULL
tipo_documento          text
numero_documento        text
cargo                   text
empresa                 text
linkedin_url            text
email                   text NOT NULL UNIQUE     -- llave de no-duplicado (2.1.1)
email_secundario        text
telefono                text
tipo_participacion      text                     -- Speaker escenario / Speaker workshop / Moderador / Host
tema_propuesto          text
resumen_conferencia     text
descripcion_taller      text
outcome_esperado        text
herramientas_requeridas text
disponibilidad_dias     text
foto_url                text
bio                     text
fuente                  text DEFAULT 'tally'      -- 'tally' | 'admin_manual' | 'import_sheet'
created_at              timestamptz DEFAULT now()
updated_at              timestamptz DEFAULT now()
```

#### Tabla `sesion_speakers` (tabla puente)

Soporta paneles de hasta 4 personas con roles distintos.

```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
sesion_id           uuid NOT NULL REFERENCES sesiones(id) ON DELETE CASCADE
speaker_id          uuid NOT NULL REFERENCES speakers(id)
rol                 text NOT NULL DEFAULT 'panelista'  -- 'moderador' | 'panelista' | 'host'
created_at          timestamptz DEFAULT now()

UNIQUE(sesion_id, speaker_id)
```

> La validación de "máximo 4 speakers por sesión" (2.2 en la conversación de producto) se aplica a nivel de aplicación (Panel Admin) antes del insert, no como constraint SQL rígido, para permitir excepciones editoriales sin migración.

#### Tabla `requests`

```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
speaker_id          uuid REFERENCES speakers(id)          -- null si es un speaker nuevo propuesto, no aún en el sistema
sesion_id           uuid REFERENCES sesiones(id)           -- sesión propuesta u objeto del conflicto
tipo                text NOT NULL       -- 'propuesta_speaker' | 'conflicto' | 'ajuste'
motivo              text NOT NULL
solicitante_id      uuid NOT NULL REFERENCES usuarios(id)
solicitante_area    text NOT NULL       -- 'Sales' | 'CS'
estado              text DEFAULT 'PENDIENTE'  -- PENDIENTE / EN_REVISION / APROBADO / RECHAZADO
respuesta_agenda    text
decidido_por         uuid REFERENCES usuarios(id)
created_at          timestamptz DEFAULT now()
updated_at          timestamptz DEFAULT now()
```

#### Tabla `usuarios` (roles individuales)

```sql
id                  uuid PRIMARY KEY REFERENCES auth.users(id)
nombre              text NOT NULL
email               text NOT NULL UNIQUE
area                text NOT NULL       -- 'Agenda' | 'Sales' | 'CS'
rol                 text NOT NULL       -- 'admin' | 'colaborador'
created_at          timestamptz DEFAULT now()
```

#### 2.2.1 Constraint de no-solape de slots (pendiente de definir en detalle)

> ⚠️ **Deuda de diseño abierta:** no se ha definido si dos slots del mismo escenario pueden solaparse en horario (ej. error de captura) ni si el sistema debe bloquear esto a nivel de base de datos con un `EXCLUDE USING gist` sobre rango de tiempo, o si se deja como validación de UI en el Panel Admin. Se recomienda resolver esto antes de implementar el CRUD de slots — no es un detalle menor, afecta si el modelo permite estados inconsistentes por diseño o por omisión.

---

### 2.3 Políticas RLS

| Tabla | Rol | Operación | Regla |
|---|---|---|---|
| `speakers` | `authenticated` (área Agenda) | ALL | vía `usuarios.area = 'Agenda'` |
| `speakers` | `authenticated` (Sales/CS) | SELECT | lectura completa |
| `sesiones`, `slots`, `escenarios`, `eventos` | `authenticated` (Agenda) | ALL | |
| `sesiones`, `slots`, `escenarios`, `eventos` | `authenticated` (Sales/CS) | SELECT | |
| `requests` | `authenticated` (Sales/CS) | INSERT, SELECT (propios) | `solicitante_id = auth.uid()` en SELECT |
| `requests` | `authenticated` (Agenda) | ALL | |
| `service_role` | — | ALL | para el webhook de Tally |

Auth vía Supabase Auth, roles individuales por persona (tabla `usuarios` referenciando `auth.users`). No se reutiliza ningún proyecto de auth existente.

---

### 2.4 Realtime

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.sesiones;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sesion_speakers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.requests;
ALTER TABLE public.sesiones REPLICA IDENTITY FULL;
ALTER TABLE public.requests REPLICA IDENTITY FULL;
```

Las vistas de Sales y CS se suscriben a cambios en `sesiones`, `sesion_speakers` y `requests` (para ver el estado de sus propias solicitudes reflejarse sin refresh).

---

## 3. Componentes de aplicación

### 3.1 Panel Admin (Agenda)

**Audiencia:** equipo de Agenda, autenticado individualmente.

**Páginas:**

| Ruta | Descripción |
|---|---|
| `/admin` | Dashboard — KPIs de programación (sesiones sin asignar, requests pendientes) |
| `/admin/eventos` | CRUD de eventos |
| `/admin/escenarios` | CRUD de escenarios por evento |
| `/admin/slots` | CRUD de slots por escenario |
| `/admin/sesiones` | CRUD de sesiones, asignación de speakers vía `sesion_speakers` |
| `/admin/speakers` | Catálogo de speakers (incluye los de Tally y los creados manualmente) |
| `/admin/requests` | Bandeja de requests — aprobar / rechazar / pedir info |
| `/admin/tally-duplicados` | Cola de submits de Tally rechazados por email duplicado, revisión manual |

**Acciones clave en `/admin/requests`:**
- **Aprobar:** ejecuta la acción propuesta (asignación de speaker a sesión vía `sesion_speakers`), cambia `estado` a `APROBADO`, registra `decidido_por`.
- **Rechazar:** cambia `estado` a `RECHAZADO`, requiere `respuesta_agenda` (motivo).
- **Pedir info:** cambia `estado` a `EN_REVISION`, notifica al solicitante (fase 2: vía email/Slack; MVP: visible en su vista).

### 3.2 Vista Sales

**Páginas:**

| Ruta | Descripción |
|---|---|
| `/sales` | Explorador de agenda — filtros por tema, horario, escenario, capacidad disponible |
| `/sales/sesion/:id` | Detalle de sesión — participantes actuales, spots disponibles, botón "Proponer speaker" |
| `/sales/mis-requests` | Historial de requests creados por el usuario, con estado |

**Regla de negocio visible en UI:** un spot disponible (`capacidad_speakers > count(sesion_speakers)`) se muestra como "oportunidad potencial", nunca como acción de asignación directa. El único CTA disponible es "Proponer", que crea un `request`.

### 3.3 Vista CS

**Páginas:**

| Ruta | Descripción |
|---|---|
| `/cs` | Buscador de speakers — ver sesión, hora, escenario, compañeros de panel asignados |
| `/cs/mis-requests` | Historial de requests creados por el usuario |

---

## 4. Flujo operativo completo

### Fase 1 — Alta de speaker (Tally)

| Acción | Quién | Herramienta | Resultado |
|---|---|---|---|
| Confirmar speaker (fuera del sistema) | Agenda / Sales | — | Decisión tomada |
| Enviar link de Tally | Agenda / Sales | Tally | Speaker recibe formulario |
| Llenar formulario | Speaker | Tally | Submit |
| Webhook procesa submit | Automático | Tally API → Supabase Edge Function | INSERT en `speakers` si email no existe; si existe, va a `tally_duplicados_pendientes` |

### Fase 2 — Construcción de programación

| Acción | Quién | Herramienta | Resultado |
|---|---|---|---|
| Crear evento / escenarios / slots | Agenda | Panel Admin | Estructura base |
| Crear sesión, asignar slot | Agenda | Panel Admin | Sesión en estado `BORRADOR` |
| Asignar speakers a sesión | Agenda | Panel Admin (`sesion_speakers`) | Sesión pasa a `CONFIRMADA` cuando Agenda lo decide manualmente |

### Fase 3 — Exploración y requests (Sales / CS)

Igual al flujo de proceso ya validado en FigJam: explorar → identificar oportunidad → proponer → bandeja de Agenda → decisión editorial → reflejo en tiempo real.

### Fase 4 — Import inicial desde el Sheet actual

Import único, no continuo. Requiere mapeo explícito columna a columna del Sheet actual de Agenda hacia el nuevo modelo normalizado (Evento → Escenario → Slot → Sesión → Speaker), incluyendo:
- Reconstrucción de jerarquía a partir de columnas planas
- De-duplicación de speakers ya presentes en el Sheet (posible cruce con `speakers` ya insertados vía Tally, por email)
- Exclusión de filas basura conocidas (mismo patrón visto en el Sheet de Speakers: headers duplicados como dato)

> ⚠️ Este import no está detallado a nivel de script en este PRD — requiere inspección directa del Sheet actual de Agenda antes de escribir el script de migración.

---

## 5. Decisiones de arquitectura y por qué

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Panel Admin con escritura directa a Supabase | Patrón Sheet → sync → Supabase (como Speakers) | El cuello de botella es latencia durante el evento en vivo; un sync, por rápido, sigue siendo más lento que escritura directa. El Sheet además era incómodo de consultar para el equipo. |
| Proyecto Supabase nuevo y separado | Reutilizar `ctw-speakers-system` | Decisión explícita del usuario — no reutilizar nada del sistema de Speakers. |
| Tally solo INSERT, nunca UPDATE | Upsert por email | Evita que un reenvío accidental del formulario sobreescriba ediciones manuales de Agenda. Trade-off: duplicados van a cola de revisión en vez de autoresolver. |
| Roles individuales por persona (Supabase Auth) | Un login por área | Control de acceso real y auditable (`decidido_por`, `solicitante_id`). Costo: mantenimiento de altas/bajas de usuarios. |
| Tabla puente `sesion_speakers` con rol | Columnas `speaker_1_id`...`speaker_4_id` en `sesiones` | Modela correctamente relación muchos-a-muchos con atributo (rol); evita rigidez frente a cambios de formato de panel. |
| `fecha_publicacion_fase*` — **no aplica a este sistema** | — | Ese patrón es específico del toolkit de Speakers (fases de publicación de piezas gráficas). El EPMS no tiene ese concepto; se documenta aquí solo para evitar confusión al comparar ambos PRDs. |

---

## 6. Deuda técnica y decisiones abiertas

| Item | Prioridad | Descripción |
|---|---|---|
| Constraint de no-solape de slots | Alta | No definido si se bloquea a nivel DB (`EXCLUDE USING gist`) o solo en UI. Resolver antes de construir CRUD de slots. |
| Reubicación automática al aprobar request | Fuera de MVP | Explícitamente diferido a fase 2 por decisión del usuario. |
| Notificaciones de cambio de estado de request | Media | MVP solo refleja estado en `/mis-requests`; sin email/Slack. |
| Re-alojamiento de `foto_url` de Tally | Media | Depende hoy de la disponibilidad del CDN de Tally a largo plazo. Fase 2: descargar a Supabase Storage. |
| Script de import del Sheet actual | Alta (bloquea lanzamiento) | No se ha inspeccionado el Sheet real de Agenda; el mapeo de columnas y de-duplicación se define en esa inspección, no en este PRD. |
| Validación de máx. 4 speakers por sesión | Baja | A nivel de aplicación, no constraint SQL — permite excepción editorial manual. |

---

## 7. Fuera de alcance (fase 2, explícito)

- Reubicación automática de speakers al aprobar un request
- Notificaciones push/email/Slack de cambios de estado
- Edición del speaker por parte del propio speaker después del submit de Tally
- Re-alojamiento de imágenes en Supabase Storage
- Resolución automática de duplicados de Tally
