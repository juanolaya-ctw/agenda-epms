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

1. `sesiones.estado`, recortado y en mayúsculas, es `CONFIRMADA` (`upper(btrim(estado))` en `epms.agenda_publica`).
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
| `speakers[].foto_url` | URL de `/api/speaker-foto` si la foto está en el Storage de este proyecto. `null` si no hay foto o si el archivo está en otro host |
| `speakers[].bio` | Bio, o `null` |

No se devuelven correos, teléfonos, documentos, LinkedIn, estado interno, cupos, piezas, requests, CRM ni notas de Sales/CS. Si un texto público trae un email, se elimina (título, descripción, nombre del escenario, nombre, cargo, empresa y bio). `foto_url` es `null` cuando la foto no está en el Storage de este proyecto: `epms.agenda_publica` marca `tiene_foto` solo si el host de `foto_url` es el de la URL de Supabase configurada en el servidor. Cuando sí lo está, la URL es de esta API (`/api/speaker-foto`): el objeto de Storage a veces lleva un email en el nombre y esa ruta no sale en el JSON ni en los headers. La foto solo se sirve si es jpeg, png, webp, gif o avif y pesa como máximo 5 MB (`Content-Security-Policy: default-src 'none'; sandbox` y `X-Content-Type-Options: nosniff`). Se cachea con `s-maxage=86400`.

`epms.agenda_publica` devuelve `escenario.color` en `null`: la columna `escenarios.color` todavía no existe en producción (`epms-alter-escenarios-color.sql`) y la función no la lee. La API pinta el color con la paleta del calendario interno, por orden de nombre del escenario dentro del evento.

### Ejemplo real

Forma del JSON. Los tres títulos de abajo son sesiones `CONFIRMADA` reales del 2026-10-20. Desde este cambio la API solo lee `epms.agenda_publica`, así que en producción responde eso después de ejecutar el SQL. `GET /api/agenda` sin filtros:

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
| 500 | La función `epms.agenda_publica` no existe, faltan variables o Supabase falló. El cuerpo es `{"error":"No se pudo cargar la agenda"}` y no lista variables ni SQL. No devuelve una agenda vacía en ese caso |

## Variables de entorno

No hace falta crear secretos nuevos. La función lee, en este orden:

- URL: `SUPABASE_URL`, `VITE_SUPABASE_URL`, `SB_URL`
- Key: `SUPABASE_ANON_KEY`, `VITE_SUPABASE_ANON_KEY`, `SB_ANON_KEY`

En el proyecto de Vercel de `juanolaya-ctw` ya están `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. La API solo llama a `epms.agenda_publica` y `epms.agenda_foto_publica` (anon key, sin `service_role`). El detalle de configuración se escribe en el log del servidor, no en la respuesta.

## SQL obligatorio, antes del merge

En el SQL Editor del proyecto Supabase del EPMS, en este orden, y **después** mergear este PR a `main`:

1. Correr el pre-check que está comentado en `supabase/agenda-publica.sql` y guardar el resultado:

```sql
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'epms'
  AND grantee IN ('authenticated', 'PUBLIC');
```

2. Ejecutar **todo** `supabase/agenda-publica.sql`. Crea `epms.agenda_publica` y `epms.agenda_foto_publica` como `SECURITY DEFINER` (solo columnas públicas de sesiones `CONFIRMADA`; `tiene_foto` solo si el archivo está en el Storage de este proyecto). Luego hace `REVOKE ALL` de `anon` y `PUBLIC` sobre las tablas de `epms`. Al final, `ALTER DEFAULT PRIVILEGES` para que las tablas, secuencias y funciones que se creen después con ese rol no queden abiertas a `anon` ni a `PUBLIC`. `authenticated` no se toca.

3. Entrar a la app con un usuario de Agenda y abrir Speakers. Si no puede leer, el pre-check mostró grants solo en `PUBLIC`. Descomentar y correr el bloque `GRANT ... TO authenticated` del mismo archivo (tablas, secuencias y funciones). No otorgar nada a `anon`.

Si se mergea antes de correr el SQL, `GET /api/agenda` responde 500 hasta que el script exista. No consulta las tablas con la anon key.
