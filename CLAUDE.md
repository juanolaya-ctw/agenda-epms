# CLAUDE.md — EPMS (Event Programming Management System)
## Memoria del proyecto para nuevas sesiones de Claude

**Última actualización:** Septiembre 2026
**Repo:** `juanolaya-ctw/agenda-epms`
**URL producción:** `https://agenda.colombiatech.co`
**Rama de trabajo:** `dev` → merge a `main` → Vercel autodeploy

---

## Qué es esto

Sistema de gestión de agenda y speakers para eventos de Colombia Tech 
(GovTech Summit 2026, AI Summit, CTW, CTF). Reemplaza el flujo 
anterior de Excel + Supabase manual + Google Sheets separados.

Audiencias:
- **Equipo Agenda**: crea y gestiona sesiones, asigna speakers, 
  aprueba/rechaza requests
- **Sales**: explora la agenda y propone speakers para sesiones 
  con cupos disponibles
- **CS (Customer Success)**: consulta speakers y reporta conflictos

---

## Stack técnico

```
Frontend:     Vite + React + TypeScript + Shadcn/ui + Tailwind v4
UI library:   Shadcn con Radix UI (radix-nova preset)
Tipografía:   Mosvita (3 pesos: Light/Regular/SemiBold, en src/assets/fonts/)
Paleta:       Negro #1D1D1B (primary), Azul #42B3F3 (secondary), 
              Azul claro #A4D4FF (accent), Violeta #EE82EE (accent2)
Backend:      Supabase proyecto ydqbjyhcntszvrytdkml, schema: epms
Auth:         Supabase Auth (email+password), roles individuales
Deploy:       Vercel (plan Hobby, rama main)
Edge Fns:     Supabase Edge Functions (Deno)
Webhook:      tally-webhook (ya deployado, recibe submits de formulario pbNMvy)
Storage:      bucket speaker-fotos (público)
DNS:          GoDaddy → colombiatech.co
```

---

## Arquitectura de datos (schema epms en Supabase)

### Jerarquía principal
```
eventos
  └── escenarios
  └── tracks
  └── formatos
  └── estados_sesion (dinámicos, editables, con campo cuenta_para_cupos)
        └── slots
              └── sesiones
                    └── sesion_speakers (FK a speakers, con rol)
                          └── speakers (pool GLOBAL, no scopeado por evento)
```

### Tablas de seguimiento
```
requests            — propuestas y conflictos de Sales/CS → Agenda
propiedades_custom  — columnas dinámicas tipo Notion (entidad: sesion | speaker)
valores_propiedades — valores de esas propiedades por sesion_id o speaker_id
usuarios            — equipo interno (FK a auth.users, con area y rol)
tally_duplicados_pendientes — submits rechazados por email duplicado
```

### Tablas del toolkit (speakers externos)
```
toolkit_speakers    — copia editable por el speaker (NUNCA modifica epms.speakers)
```

### Columnas clave en epms.speakers
```
toolkit_slug        — slug único para la URL pública del toolkit
link_pieza_fase1    — URL de la pieza "Soy Speaker" generada
link_pieza_fase2    — URL de la pieza "Mi Panel"
link_pieza_fase3    — URL de la pieza "Quote del evento"
estado_pieza        — PENDIENTE | EN_DISENO | APROBADO | ENVIADO
foto_url            — URL en Supabase Storage (re-alojada desde Tally)
```

---

## Flujo del webhook de Tally

**Formulario:** `https://tally.so/r/pbNMvy`
**Endpoint:** `ydqbjyhcntszvrytdkml.supabase.co/functions/v1/tally-webhook`

**Lección crítica aprendida:** Tally manda los labels de sus campos 
como entidades HTML (`&nbsp;` literal, no Unicode NBSP). La función 
`normalizarLabel()` ya lo resuelve — NO cambiar ese fix.

```typescript
function normalizarLabel(label: string): string {
  return label
    .replace(/&nbsp;/gi, ' ')   // CRÍTICO: Tally manda &nbsp; literal
    .replace(/&amp;/gi, '&')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
```

**Regla de no-duplicado:** si el email ya existe en epms.speakers, 
va a `tally_duplicados_pendientes`, NO hace upsert.

**El webhook también genera el `toolkit_slug`** al insertar un 
speaker nuevo (slug = nombre-normalizado + 6 chars del UUID).

---

## Navegación y rutas

```
/login              → LoginPage (sin navbar)
/home               → WorkspaceHome (grilla tipo Classroom de eventos)
/crm                → CRM global de speakers (fuera de workspaces)

/workspace/:id/agenda             → DashboardTab (KPIs reales de Supabase)
/workspace/:id/agenda/sesiones    → SesionesTab (Tabla/Kanban/Calendario)
/workspace/:id/agenda/speakers    → SpeakersTab (tabla completa + propiedades)
/workspace/:id/agenda/requests    → RequestsTab
/workspace/:id/agenda/settings    → SettingsTab (sin cover ni tabs)

/workspace/:id/sales              → Vista Sales
/workspace/:id/cs                 → Vista CS
```

**Auth guards:** implementados con `ProtectedRoute` + `AuthContext`. 
Bug conocido y resuelto: condición de carrera `signIn` vs 
`onAuthStateChange` — se resolvió con flag `signInEnProgreso`.

---

## Usuarios del sistema

| Nombre | Email | Área | Rol |
|---|---|---|---|
| Juan Esteban Olaya | juan.olaya@colombiatechweek.co | Agenda | admin |
| Alexandra Rivera | alex@colombiatechweek.co | Agenda | admin |
| Alejandro Gamboa | alejandro.gamboa@colombiatechweek.co | Agenda | admin |
| Liz Hernández | liz@colombiatechweek.co | Agenda | admin |
| Sarah Coral | sarah.coral@colombiatechweek.co | Agenda | admin |
| Juliana Casas | juliana.casas@colombiatechweek.co | Agenda | admin |
| Valentina Ulloa | valentina@colombiatechweek.co | Agenda | admin |
| Nathalia Muñoz | nathalia@colombiatechweek.co | CS | colaborador |
| Daniela Serrano | daniela.serrano@colombiatechweek.co | CS | colaborador |
| Daniela Rivera | daniela.rivera@colombiatechweek.co | Sales | colaborador |

**Admins** (rol=admin): ven todas las áreas vía dropdown "Ingresar como".
**Colaboradores**: solo ven su área, sin el dropdown.

---

## Decisiones de arquitectura ya tomadas (no reabrir)

1. **Schema `epms` separado** dentro del proyecto `ydqbjyhcntszvrytdkml` 
   (compartido con el proyecto de Speakers de CTF que está en `public`)
2. **Pool global de speakers** — un speaker existe una sola vez, 
   participa en eventos a través de `sesion_speakers`
3. **Estados de sesión dinámicos** — tabla `estados_sesion` editable 
   por evento, con campo `cuenta_para_cupos` boolean, 2 defaults al 
   crear evento: BORRADOR y CONFIRMADA (sin CANCELADA)
4. **Propiedades custom tipo checkbox** (no checklist) para seguimiento 
   de speakers — escribe en `valores_propiedades` como boolean JSON
5. **Tally solo INSERT, nunca upsert** — segundo submit del mismo 
   email va a `tally_duplicados_pendientes`
6. **RLS permisivo en desarrollo** con políticas `USING (true)` — 
   se restringe cuando se implemente auth completa de speakers externos
7. **Edición inline tipo Excel** en las 3 tablas (Speakers, CRM, Sesiones) 
   usando el componente `InlineText.tsx`
8. **DialogContent usa CSS Grid** (Shadcn/Radix default) — cualquier 
   truncado de texto dentro del Dialog requiere `min-w-0` explícito 
   en la cadena de contenedores

---

## Speaker Toolkit — arquitectura aprobada, pendiente de construcción

### Qué es
UI pública por speaker (a construir en Lovable) donde cada speaker 
accede por su link único, edita sus datos de pieza y descarga su 
imagen generada. Sin login, sin password — el slug es la "llave".

### Principio de seguridad
Los cambios del speaker escriben en `epms.toolkit_speakers` NUNCA 
en `epms.speakers`. Esto protege la fuente de verdad interna.

### URL del toolkit
`agenda.colombiatech.co/toolkit/<toolkit_slug>`

### 3 etapas de piezas
- **Fase 1 — Soy Speaker:** nombre, cargo, empresa, foto. Disponible al confirmar.
- **Fase 2 — Mi Panel:** datos de sesión asignada (solo lectura). Disponible cuando Agenda asigna la sesión.
- **Fase 3 — Quote:** texto del quote + foto. Disponible durante/después del evento.

### Generación de imagen
- **Railway worker** (mismo repo de CTF) con nuevo endpoint `/govtech/fase1`
- **Pillow/Python** para composición — NO rembg (la foto va en B/N, sin quitar fondo)
- **OpenCV** para detección de rostro y centrado automático en el rombo
- **Template:** SVG de 1080×1350px ya analizado — PNG de fondo extraído como asset fijo
  - Fondo azul `#a4d4ff` / `#95d5ff` con logos Bogotá y GovTech Summit
  - Rombo/diamante donde va la foto en B/N
  - Tipografía Mosvita: "SOY SPEAKER" (Black 41px, pos 25.66,1074), 
    Nombre (Black 57px, pos 25.66,1177), Cargo/Empresa (Regular 40px, pos 25.66,1232)
- **Re-alojamiento de pieza:** la imagen generada se sube a Storage 
  bucket `toolkit-piezas` y la URL se guarda en `epms.speakers.link_pieza_fase1`

### Pendientes antes de construir el toolkit
1. Template SVG de las fases 2 y 3 (ya tenemos fase 1)
2. Decidir: ¿quién escribe el quote de fase 3 (speaker o Agenda)?
3. Decidir: ¿notificación al speaker automática (email/WhatsApp) o manual?
4. El worker de Railway necesita acceso al bucket `speaker-fotos` 
   para descargar la foto del speaker — revisar si las URLs de 
   Supabase Storage son accesibles desde Railway sin auth

---

## Próximos pasos inmediatos (ya commiteados, pendientes de integrar)

### En el EPMS (Cursor, rama dev):
1. **Webhook actualizado** para generar `toolkit_slug` al insertar speaker
2. **Columna Toolkit en la tabla de Speakers** — muestra el link del 
   toolkit copiable con un clic, para que Agenda lo envíe al speaker
3. **Política de lectura pública** en `epms.speakers` por slug (para 
   que el toolkit en Lovable pueda leer los datos sin auth)

### En el Railway worker de CTF:
4. **Nuevo endpoint `/govtech/fase1`** — recibe speaker_id, lee 
   toolkit_speakers (fallback a speakers), genera imagen con Pillow, 
   sube a Storage, devuelve URL
5. **Dependencia nueva:** OpenCV (`cv2`) para detección de rostro

### En Lovable (toolkit del speaker):
6. **UI del toolkit** — pantalla única con datos precargados, edición 
   de nombre/cargo/empresa/foto, botón "Generar mi pieza", descarga

---

## Gotchas y fixes ya aplicados — no reverter

| Problema | Fix aplicado | Archivo |
|---|---|---|
| Tally manda `&nbsp;` literal | `normalizarLabel()` con `.replace(/&nbsp;/gi, ' ')` | `tally-webhook/index.ts` |
| Login falla al entrar directo a /login | Flag `signInEnProgreso` evita carrera `signIn` vs `onAuthStateChange` | `AuthContext.tsx` |
| Bundle 786kB sin code-splitting | React.lazy por ruta de rol y subvista Kanban/Calendario | `main.tsx`, `SesionesTab.tsx` |
| SPAs dan 404 en Vercel en rutas directas | `vercel.json` con rewrite a `index.html` | `vercel.json` |
| DialogContent es CSS Grid, truncate no funciona | `min-w-0` explícito en cadena de contenedores del Dialog | `SesionFormDialog.tsx` |
| Foto del speaker expira (URL de Tally Storage) | Re-alojamiento a Supabase Storage en el webhook | `tally-webhook/index.ts` |
| Cascadas de 4-7 queries secuenciales | Queries embebidas con `.select('*, relacion:tabla(...)')` | Todos los hooks de datos |

---

## Git workflow

```bash
# Siempre trabajar en dev
git checkout dev

# Al terminar un cambio
git add .
git commit -m "tipo: descripción"
git push origin dev        # Juanes hace el push manualmente

# Al aprobar para producción
git checkout main
git merge dev
git push origin main       # Vercel redespliega automáticamente
git checkout dev
```

**Regla:** Juanes hace siempre el push final — Claude Code no hace 
push sin aprobación explícita visual.
