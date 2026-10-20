import { createClient } from '@supabase/supabase-js'
import { rawFromRpc } from './parse.js'
import {
  assignEscenarioColors,
  isAllowedFotoUrl,
  textOrNull,
  type AgendaFiltros,
  type EventoPublico,
  type RawSesion,
} from './public.js'

export class AgendaConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgendaConfigError'
  }
}

export type AgendaLoad =
  | { notFound: true }
  | { notFound: false; rows: RawSesion[]; evento: EventoPublico | null }

type PgError = { code?: string; message?: string; details?: string | null }

/**
 * Una sola llamada a epms.agenda_publica. El jsonb lo arma Postgres, así que
 * el tope de 1000 filas de PostgREST no recorta la agenda.
 * Si la función no existe, esto lanza: la API responde 500, no una lista vacía.
 */
export async function loadPublicAgenda(filtros: AgendaFiltros): Promise<AgendaLoad> {
  const client = createAgendaClient()
  const { data, error } = await client.rpc('agenda_publica', {
    p_evento_id: filtros.eventoId,
    p_fecha: filtros.fecha,
    p_storage_host: storageHostFromEnv(),
  })
  if (error) {
    if (isMissingRpc(error, 'agenda_publica')) {
      throw new AgendaConfigError(
        'Falta epms.agenda_publica. Hay que ejecutar supabase/agenda-publica.sql en Supabase antes del merge.',
      )
    }
    throw error
  }
  const body = record(data)
  if (!body || !Array.isArray(body.sesiones) || !Array.isArray(body.escenarios)) {
    throw new Error('agenda_publica devolvió un JSON inesperado')
  }
  if (body.encontrado === false) return { notFound: true }

  const rows = body.sesiones
    .map((item) => rawFromRpc(item))
    .filter((row): row is RawSesion => row !== null)
  const catalog = body.escenarios.flatMap((item) => {
    const row = record(item)
    const id = textOrNull(row?.id)
    const eventoId = textOrNull(row?.evento_id)
    if (!row || !id || !eventoId) return []
    return [
      {
        id,
        nombre: textOrNull(row.nombre) ?? '',
        eventoId,
        color: textOrNull(row.color),
      },
    ]
  })
  assignEscenarioColors(rows, catalog)
  return {
    notFound: false,
    rows,
    evento: filtros.eventoId ? eventoFrom(body.evento) : null,
  }
}

export async function loadPublicFotoUrl(speakerId: string): Promise<string | null> {
  const client = createAgendaClient()
  const { data, error } = await client.rpc('agenda_foto_publica', {
    p_speaker_id: speakerId,
    p_storage_host: storageHostFromEnv(),
  })
  if (error) {
    if (isMissingRpc(error, 'agenda_foto_publica')) {
      throw new AgendaConfigError(
        'Falta epms.agenda_foto_publica. Hay que ejecutar supabase/agenda-publica.sql en Supabase antes del merge.',
      )
    }
    throw error
  }
  const url = textOrNull(data)
  const supabaseUrl = supabaseUrlFromEnv()
  if (!url || !supabaseUrl || !isAllowedFotoUrl(url, supabaseUrl)) return null
  return url
}

export function supabaseUrlFromEnv(): string | null {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SB_URL || null
}

/** Host de la URL configurada (con puerto si no es el default). La SQL lo usa para tiene_foto. */
export function storageHostFromEnv(): string | null {
  const url = supabaseUrlFromEnv()
  if (!url) return null
  try {
    const host = new URL(url).host.trim().toLowerCase()
    return host || null
  } catch {
    return null
  }
}

function createAgendaClient() {
  const url = supabaseUrlFromEnv()
  const key =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SB_ANON_KEY
  if (!url || !key) {
    throw new AgendaConfigError('Faltan la URL y la anon key de Supabase en el entorno del servidor.')
  }
  assertNotServiceRole(key)
  return createClient(url, key, {
    db: { schema: 'epms' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function assertNotServiceRole(key: string): void {
  const payload = decodeJwtPayload(key)
  if (payload?.role === 'service_role') {
    throw new AgendaConfigError('La API pública no acepta la service role key.')
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const parsed = JSON.parse(atob(padded)) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function isMissingRpc(error: PgError, name: string): boolean {
  if (error.code === 'PGRST202' || error.code === '42883') return true
  const msg = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  return (
    msg.includes(name) &&
    (msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('could not find'))
  )
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function eventoFrom(value: unknown): EventoPublico | null {
  const row = record(value)
  if (!row) return null
  const id = textOrNull(row.id)
  const nombre = textOrNull(row.nombre)
  if (!id || !nombre) return null
  return {
    id,
    nombre,
    fecha_inicio: textOrNull(row.fecha_inicio),
    fecha_fin: textOrNull(row.fecha_fin),
  }
}
