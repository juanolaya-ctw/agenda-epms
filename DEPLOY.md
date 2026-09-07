# Instrucciones de despliegue — EPMS Paso 1
## Schema SQL + Edge Function tally-webhook

---

## Paso 1 — Ejecutar el schema SQL en Supabase

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

---

## Paso 2 — Desplegar la Edge Function

### Prerequisito: Supabase CLI instalado y proyecto vinculado
```bash
# Si no está instalado
npm install -g supabase

# Vincular al proyecto (desde la raíz del repo donde vayas a trabajar)
supabase login
supabase link --project-ref ydqbjyhcntszvrytdkml
```

### Estructura de archivos requerida
```
supabase/
  functions/
    tally-webhook/
      index.ts    ← el archivo entregado
```

### Deploy
```bash
# --no-verify-jwt porque Tally no envía JWT — es un webhook externo
supabase functions deploy tally-webhook --no-verify-jwt
```

### Configurar secrets en Supabase Dashboard
Ir a: Dashboard → Edge Functions → tally-webhook → Secrets

Agregar:
- `SUPABASE_URL` = `https://ydqbjyhcntszvrytdkml.supabase.co`
- `SUPABASE_SERVICE_KEY` = la service_role key del proyecto (Settings → API → service_role)

⚠️ Nunca usar la anon key aquí — la Edge Function necesita bypassar RLS para el webhook de Tally.

---

## Paso 3 — Configurar el webhook en Tally

1. Ir al formulario de GovTech en Tally (pbNMvy)
2. Settings → Integrations → Webhooks
3. URL del webhook:
   ```
   https://ydqbjyhcntszvrytdkml.supabase.co/functions/v1/tally-webhook
   ```
4. Guardar y hacer un submit de prueba con datos reales

### Verificar que el insert funcionó
```sql
SELECT nombre, email, empresa, foto_url, fuente, created_at
FROM epms.speakers
ORDER BY created_at DESC
LIMIT 5;
```

### Verificar que un segundo submit del mismo email va a duplicados
```sql
SELECT email, revisado, created_at
FROM epms.tally_duplicados_pendientes
ORDER BY created_at DESC;
```

---

## Notas conocidas

- **`foto_url`**: Tally entrega la URL de la imagen subida en su propio CDN. Se guarda tal cual. Re-alojar en Supabase Storage es fase 2 (deuda técnica abierta en PRD §2.1.2).
- **Constraint de no-solape de slots**: validación solo en UI del Panel Admin, no en DB. Deuda técnica abierta.
- **`supabase-py`**: si en algún momento necesitas acceder al schema `epms` desde Python (Railway workers), usar `.schema("epms")` en el cliente. Verificar compatibilidad con la versión instalada — en proyectos anteriores hubo incompatibilidad con `sb_secret_` keys en Python 3.14/Windows; usar httpx directo si falla.
