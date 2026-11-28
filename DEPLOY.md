# Instrucciones de despliegue — EPMS

## Schema SQL + Edge Function tally-webhook

---

## Paso 1 — Schema base (`epms-schema.sql`)

1. Ir a [Supabase Dashboard](https://supabase.com/dashboard/project/ydqbjyhcntszvrytdkml)
2. SQL Editor → New Query
3. Pegar el contenido completo de `epms-schema.sql`
4. Ejecutar (Run)
5. Verificar que no haya errores — si alguna tabla ya existe con ese nombre en otro schema, el `CREATE SCHEMA IF NOT EXISTS epms` la aísla correctamente

**Verificación post-ejecución:**
```sql
-- Debe devolver 13 tablas del schema epms
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'epms'
ORDER BY table_name;
```

Tablas esperadas: `escenarios`, `eventos`, `formatos`, `propiedades_custom`, `requests`, `sesion_speakers`, `sesiones`, `slots`, `speakers`, `tally_duplicados_pendientes`, `tracks`, `usuarios`, `valores_propiedades`

> En entornos ya provisionados este paso ya está hecho. No borrar ni saltar la documentación del schema base.

---

## Paso 2 — Aplicar la migración Fase 5

1. SQL Editor → New Query
2. Pegar el contenido completo de `supabase/migrations/20261129_fase5_tally.sql`
3. Ejecutar (Run)

**Importante:** el bloque **1a** (grants de `service_role`) es independiente y puede aplicarse solo como hotfix. En prod ya se aplicó como `20261128_hotfix_tally_service_role_grants` — no reaplicarlo. Sin esos grants, la función responde 500 al leer `tally_formularios`.

Follow-up opcional (search_path en el trigger inmutable):
`supabase/migrations/20261130_fase5_tally_inmutable_search_path.sql`

**Verificación mínima:**
```sql
SELECT has_table_privilege('service_role', 'epms.tally_formularios', 'SELECT');
SELECT has_table_privilege('service_role', 'epms.tally_envios', 'INSERT');
SELECT has_function_privilege(
  'service_role',
  'epms.registrar_tally_envio(text, text, uuid, text, timestamptz, jsonb, jsonb, jsonb, text, text)',
  'EXECUTE'
);
SELECT has_function_privilege(
  'authenticated',
  'epms.registrar_tally_envio(text, text, uuid, text, timestamptz, jsonb, jsonb, jsonb, text, text)',
  'EXECUTE'
); -- debe ser false
```

QA de la RPC (solo datos TEST; lo corre el owner, no el agente):
`scripts/fase5-tally-qa.sql`

---

## Paso 3 — Desplegar la Edge Function

### Prerequisito: Supabase CLI instalado y proyecto vinculado
```bash
npm install -g supabase
supabase login
supabase link --project-ref ydqbjyhcntszvrytdkml
```

### Deploy
```bash
# Primero con otro slug para QA (el código no depende del nombre):
supabase functions deploy tally-webhook-qa --no-verify-jwt

# Luego el slug de producción:
supabase functions deploy tally-webhook --no-verify-jwt
```

`--no-verify-jwt` porque Tally no envía JWT — es un webhook externo.

### Secrets (Dashboard → Edge Functions → Secrets)

Variables **reales** que lee el código:

- `SB_URL` = `https://ydqbjyhcntszvrytdkml.supabase.co`
- `SB_SERVICE_KEY` = service_role key (Settings → API → service_role)

⚠️ Nunca usar la anon key. No uses `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` (nombres viejos; el código no los lee).

---

## Paso 4 — Configurar el webhook en Tally y verificar

Cada evento tiene su propio formulario en `epms.tally_formularios` y su URL:

```
https://ydqbjyhcntszvrytdkml.supabase.co/functions/v1/tally-webhook?token=<webhook_token>
```

El token se copia desde Settings del workspace (Agenda). También se reconoce el envío por `data.formId` si el token no viene en la URL — así sigue funcionando el webhook de **GovTech** ya configurado (formulario `pbNMvy`).

1. Tally → Settings → Integrations → Webhooks
2. Pegar la URL (con o sin `?token=`)
3. Submit de prueba

### Verificar en `tally_envios`
```sql
SELECT id, estado, razon, speaker_id, evento_id, created_at
FROM epms.tally_envios
ORDER BY created_at DESC
LIMIT 10;
```

Los envíos nuevos **ya no** van a `tally_duplicados_pendientes` (obsoleta desde Fase 5).

---

## Notas

- **Idempotencia:** Tally reintenta si no recibe 2xx. Misma `clave` → `200 { status: "reenvio" }` sin nuevas gestiones ni cambios (ni re-alojar foto).
- **Foto:** si la URL es de `storage.tally.so`, se re-aloja en el bucket `speaker-fotos` con nombre `speakers/tally-<8chars>-<ts>.<ext>` (sin email).
- **Orden de deploy:** 1) schema base (si aplica) 2) migración Fase 5 3) función 4) verificar. Sin el bloque 1a, cualquier envío falla.
