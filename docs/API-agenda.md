# API pública de agenda

Endpoint de solo lectura para que la App de GovTech consuma el programa del evento. No requiere autenticación.

Después del merge a `main`, Vercel publica:

```
GET https://agenda.colombiatech.co/api/agenda
```

Calendario iCalendar (mismo filtro):

```
GET https://agenda.colombiatech.co/api/agenda.ics
GET https://agenda.colombiatech.co/api/agenda?format=ics
```

Foto de un speaker que aparece en la agenda (la devuelve el campo `foto_url`):

```
GET https://agenda.colombiatech.co/api/speaker-foto?id=<uuid>
```

## Qué sesiones entran

Solo entra una sesión si se cumplen las tres condiciones:

1. `sesiones.estado` es `CONFIRMADA` (sin distinguir mayúsculas, con espacios recortados).
2. Tiene slot: fecha, hora de inicio, hora de fin y escenario. Una sesión confirmada sin horario no sale.
3. El evento del escenario está activo (`eventos.activo = true`).

`BORRADOR` y `EN PROGRESO` son estados internos de Agenda y no salen. No hay columna `publicado`: en el catálogo del evento, `CONFIRMADA` es el estado que Agenda asigna cuando la sesión queda en el programa (ver `epms.estados_sesion` y el PRD). `cuenta_para_cupos` no se usa aquí; un borrador puede contar para cupos y seguir siendo interno.

Hoy el workspace GovTech Summit 2026 (`2f042639-cc2d-4c06-bea3-f8316a3419c1`) tiene más sesiones en `EN PROGRESO`. Aparecen en esta API cuando Agenda las pasa a `CONFIRMADA`.

Horarios: `slots.dia` + `hora_inicio` / `hora_fin` se interpretan como hora civil de `America/Bogota` (UTC−05:00, sin horario de verano) y se devuelven en ISO 8601 con ese offset.

## Parámetros

Todos opcionales.

| Parámetro | Alias | Ejemplo | Efecto |
|---|---|---|---|
| `date` | `fecha` | `2026-11-03` | Solo ese día (`YYYY-MM-DD`) |
| `evento` | `evento_id` | `2f042639-cc2d-4c06-bea3-f8316a3419c1` | Solo ese workspace. UUID inválido → 400. UUID desconocido o evento inactivo → 404 |
| `format` | | `json` (default) o `ics` | JSON o calendario |

Sin filtros devuelve todas las sesiones públicas de todos los eventos activos. Si el resultado es de un solo evento, el objeto `evento` de la raíz viene lleno; si hay varios, `evento` es `null` y cada sesión trae el suyo.

Ejemplos:

```
GET /api/agenda?evento=2f042639-cc2d-4c06-bea3-f8316a3419c1
GET /api/agenda?date=2026-11-03
GET /api/agenda?evento=2f042639-cc2d-4c06-bea3-f8316a3419c1&fecha=2026-11-04&format=ics
```

## Respuesta JSON

`Content-Type: application/json; charset=utf-8`

CORS: `Access-Control-Allow-Origin: *` (métodos `GET` y `OPTIONS`).

Caché: `Cache-Control: public, max-age=60, s-maxage=60, stale-while-revalidate=300`.

| Campo | Significado |
|---|---|
| `titulo` | Título de la sesión |
| `descripcion` | Texto público de la sesión |
| `fecha` | Día `YYYY-MM-DD` |
| `inicio` / `fin` | Inicio y fin en ISO 8601 con offset de Bogotá |
| `escenario.nombre` / `escenario.color` | Escenario y color hex del calendario |
| `formato` | Tipo (Keynote, Panel, …). `null` si no tiene |
| `track` | Track. `null` si no tiene |
| `idioma` | Idioma de la sesión |
| `speakers[].nombre` | Nombre |
| `speakers[].rol` | Rol en la sesión: `keynote`, `moderador`, `host` o `panelista` |
| `speakers[].cargo` | Cargo |
| `speakers[].empresa` | Empresa |
| `speakers[].foto_url` | URL de esta misma API, o `null` |
| `speakers[].bio` | Bio, o `null` |

No se devuelven correos, teléfonos, documentos, LinkedIn, estado interno, cupos, piezas, requests, CRM ni notas de Sales/CS. `foto_url` no apunta al objeto de Storage: algunos archivos se guardaron con el email dentro del nombre, y el endpoint `/api/speaker-foto` entrega la imagen sin revelar esa ruta. Las fotos se cachean más tiempo (`s-maxage=86400`).

El color del escenario usa `escenarios.color` cuando la columna existe. En producción todavía no está aplicada (`epms-alter-escenarios-color.sql`); mientras tanto el color es el de la paleta del calendario interno, por orden de nombre del escenario.

### Ejemplo real

Capturado el 2026-10-20 contra los datos de producción (handler local, mismas queries que desplegará Vercel). `GET /api/agenda` sin filtros:

```json
{
  "timezone": "America/Bogota",
  "generado_en": "2026-10-20T11:47:31-05:00",
  "filtros": { "evento_id": null, "fecha": null },
  "evento": {
    "id": "2f042639-cc2d-4c06-bea3-f8316a3419c1",
    "nombre": "GovTech Summit 2026",
    "fecha_inicio": "2026-11-03",
    "fecha_fin": "2026-11-04"
  },
  "sesiones": [
    {
      "id": "c06cd4e1-a791-43ea-a0b5-86e0b10da908",
      "titulo": "13 Ranks in 1 Year: Taipei’s Playbook for Modern Cities",
      "descripcion": "smartcity blueprint",
      "fecha": "2026-11-03",
      "inicio": "2026-11-03T10:45:00-05:00",
      "fin": "2026-11-03T11:35:00-05:00",
      "escenario": {
        "id": "44aac3bf-5ed4-46f7-b6e9-6e7747731feb",
        "nombre": "Escenario principal",
        "color": "#0093FF"
      },
      "track": "Innovación Pública",
      "formato": "Keynote",
      "idioma": "Español",
      "evento": {
        "id": "2f042639-cc2d-4c06-bea3-f8316a3419c1",
        "nombre": "GovTech Summit 2026",
        "fecha_inicio": "2026-11-03",
        "fecha_fin": "2026-11-04"
      },
      "speakers": [
        {
          "id": "7669695f-23eb-4bc6-854d-43042d127fe0",
          "nombre": "Jack Shih-Lung Chao",
          "rol": "panelista",
          "cargo": "Commissioner, Department of Information Technology",
          "empresa": "Taipei City Government",
          "foto_url": "https://agenda.colombiatech.co/api/speaker-foto?id=7669695f-23eb-4bc6-854d-43042d127fe0",
          "bio": null
        }
      ]
    },
    {
      "id": "48900887-61e3-4172-bd51-9b6592d772ed",
      "titulo": "Technology as the Real Driver of Financial Inclusion",
      "descripcion": "Este panel abordará la paradoja del crédito: ¿cómo impacta el tope de usura al acceso al capital? Analizaremos cómo los modelos de Inteligencia Artificial y el scoring alternativo (utilizados en EE. UU. y mercados avanzados) pueden predecir el riesgo de pago sin depender de un historial crediticio tradicional, y cómo la flexibilización de estas tasas podría habilitar una verdadera inclusión financiera.",
      "fecha": "2026-11-03",
      "inicio": "2026-11-03T14:55:00-05:00",
      "fin": "2026-11-03T15:40:00-05:00",
      "escenario": {
        "id": "44aac3bf-5ed4-46f7-b6e9-6e7747731feb",
        "nombre": "Escenario principal",
        "color": "#0093FF"
      },
      "track": "GovTech",
      "formato": "Panel",
      "idioma": "Español",
      "evento": {
        "id": "2f042639-cc2d-4c06-bea3-f8316a3419c1",
        "nombre": "GovTech Summit 2026",
        "fecha_inicio": "2026-11-03",
        "fecha_fin": "2026-11-04"
      },
      "speakers": [
        {
          "id": "78375c36-225b-4ac6-a82e-448ea1bc3518",
          "nombre": "Ana Maria Prieto",
          "rol": "panelista",
          "cargo": "Directora de Sistemas de Pago",
          "empresa": "Banco de la República",
          "foto_url": "https://agenda.colombiatech.co/api/speaker-foto?id=78375c36-225b-4ac6-a82e-448ea1bc3518",
          "bio": null
        },
        {
          "id": "cb6b9b46-b539-42f6-935b-76f089e6d680",
          "nombre": "Diego Caicedo",
          "rol": "panelista",
          "cargo": "CEO",
          "empresa": "Revolut Colombia",
          "foto_url": "https://agenda.colombiatech.co/api/speaker-foto?id=cb6b9b46-b539-42f6-935b-76f089e6d680",
          "bio": null
        }
      ]
    }
  ]
}
```

El ejemplo está recortado a dos sesiones. La tercera confirmada ese día de captura fue `The 99% Digital Nation: Lessons from Estonia’s Ex-CIO` (`2026-11-04T11:10:00-05:00`–`11:30:00-05:00`, keynote, Siim Sikkut).

## Errores

| HTTP | Cuándo |
|---|---|
| 400 | `date`/`fecha` o `evento` con formato inválido, o `format` distinto de `json`/`ics` |
| 404 | `evento` no existe o está inactivo. Foto de alguien que no está en una sesión pública |
| 405 | Cualquier método que no sea `GET` u `OPTIONS` |
| 500 | Faltan las variables de Supabase, o la base no respondió. El cuerpo no incluye detalles de SQL |

## Variables de entorno

No hace falta crear secretos nuevos. La función lee, en este orden:

- URL: `SUPABASE_URL`, `VITE_SUPABASE_URL`, `SB_URL`
- Key: `SUPABASE_ANON_KEY`, `VITE_SUPABASE_ANON_KEY`, `SB_ANON_KEY`

En Vercel ya están `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (el sitio las usa en el build). La anon key respeta RLS. Esta API no acepta la `service_role` key: si alguien la pone en esas variables, el endpoint responde 500 y no consulta.

La consulta pide solo columnas públicas. `estado` se usa para filtrar y no sale en el JSON.

## SQL opcional

`supabase/agenda-publica.sql` crea `epms.agenda_publica(uuid, date)`, `SECURITY DEFINER`, con las mismas columnas públicas y el mismo filtro `CONFIRMADA`. Hay que pegarlo una vez en el SQL Editor de Supabase. Cuando la función existe, `/api/agenda` la usa (puede tardar unos minutos en notarla) y sigue respondiendo aunque `anon` pierda `SELECT` sobre las tablas. No es necesario para el primer deploy.

No hay cambios de RLS en este cambio. Conviene no abrir `SELECT` de `epms.speakers` a `anon`: esa tabla tiene email y teléfono.
