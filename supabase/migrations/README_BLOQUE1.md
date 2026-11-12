# Bloque 1 — email opcional + estado por evento + UX asociar

Archivo: `20261112_crm_bloque1_email_estado.sql`

## Fuera de alcance de este archivo
Tally multi-evento, interacciones, rewrite RLS, KPIs, import Excel.

## Tally actual (sin tocar webhook/formulario)
El webhook desplegado sigue exigiendo nombre+email e inserta en `speakers`.
Tras esta migración:
- Inserts Tally con email siguen válidos.
- Unicidad pasa a `lower(btrim(email))` (compatible si no hay colisiones).
- Tally **no** escribe `evento_speakers` hoy → no asocia al evento solo.
- Prospecto creado en UI **sin email** que luego llena Tally con email:
  1. Match fuerte por email → fila existente (si ya había email) o **nuevo** speaker con ese email.
  2. Si existía prospecto sin email con mismo nombre → riesgo de **duplicado** (dos filas).
  3. No fusionar por nombre automáticamente; hace falta revisión humana / cola (bloque Tally posterior).
- No declarar “confirmado” solo porque Tally respondió, hasta política explícita.

## Permisos (bloqueante)
Las policies amplias de `authenticated` **siguen pendientes**. Este bloque no las corrige.
Resolver **antes** de cargar prospectos reales (alta manual **o** import).

## Duplicados Tally (pendiente, no aceptado para prod)
Prospecto sin email + submit Tally con email puede crear **otra** fila. No fusionar por nombre.
No está resuelto aquí ni aceptado para producción.

## Respaldo / aplicación / recuperación
1. Backup: dump o export de `epms.speakers` y `epms.evento_speakers`.
2. Ventana corta sin escrituras a speakers.
3. Aplicar SQL (aborta si hay dups normalizados o si el índice nuevo no existe/no es válido/no coincide la definición; no borra personas).
4. Desplegar frontend del bloque1 (`de50073` / rama `feat/crm-prospectos-bloque1`) solo tras staging.
5. Recuperación schema: **No** DROP de columnas de estado/seguimiento como rollback.
6. Recuperación app: **no** hay un build previo identificado en este repo que declare soporte de `email` NULL. No asumir que “revertir el deploy” basta; hace falta un artefacto concreto verificado (o forward-only / hotfix) **antes** de aplicar en un entorno con datos.
