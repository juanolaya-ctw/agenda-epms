import { createClient } from '@supabase/supabase-js'
import { rawFromEmbed, rawFromRpc } from './parse.ts'
import {
  assignEscenarioColors,
  textOrNull,
  type AgendaFiltros,
  type EventoPublico,
  type RawSesion,
} from './public.ts'

/**
 * Columnas de speaker que salen al público. No agregar email, teléfono,
 * documento, LinkedIn, piezas ni campos de CRM.
 */
export const SPEAKER_PUBLIC_COLUMNS = 'id, nombre, cargo, empresa, foto_url, bio'

const SESIONES_SELECT = `
  id, titulo, descripcion, formato, track, idioma, estado,
  slot:slots!inner (
    dia, hora_inicio, hora_fin,
    escenario:escenarios!inner (
      id, nombre, evento_id,
      evento:eventos!inner ( id, nombre, fecha_inicio, fecha_fin, activo )
    )
  ),
  sesion_speakers (
    rol,
    speaker:speakers ( ${SPEAKER_PUBLIC_COLUMNS} )
  )
`

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

let rpcUnavailableUntil = 0

export async function loadPublicFotoUrl(speakerId: string): Promise<string | null> {
  const client = createAgendaClient()
  const { data, error } = await client
    .from('sesion_speakers')
    .select(
      `
      speaker:speakers!inner ( foto_url ),
      sesion:sesiones!inner (
        estado,
        slot:slots!inner (
          escenario:escenarios!inner (
            evento:eventos!inner ( activo )
          )
        )
      )
    `,
    )
    .eq('speaker_id', speakerId)
    .ilike('sesion.estado', 'CONFIRMADA')
    .eq('sesion.slot.escenario.evento.activo', true)
    .limit(1)
  if (error) throw error
  const row = (data ?? [])[0] as
    | { speaker?: { foto_url?: string | null } | { foto_url?: string | null }[] }
    | undefined
  const speaker = Array.isArray(row?.speaker) ? row?.speaker[0] : row?.speaker
  return textOrNull(speaker?.foto_url)
}

export function isAllowedFotoUrl(fotoUrl: string, supabaseUrl: string): boolean {
  try {
    const foto = new URL(fotoUrl)
    const base = new URL(supabaseUrl)
    return foto.protocol === 'https:' && foto.host === base.host
  } catch {
    return false
  }
}

export function supabaseUrlFromEnv(): string | null {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SB_URL || null
}

export async function loadPublicAgenda(filtros: AgendaFiltros): Promise<AgendaLoad> {
  const client = createAgendaClient()
  if (filtros.eventoId) {
    const evento = await loadEvento(client, filtros.eventoId)
    if (!evento) return { notFound: true }
    const rows = await loadRows(client, filtros)
    await paintColors(client, rows)
    return { notFound: false, rows, evento }
  }
  const rows = await loadRows(client, filtros)
  await paintColors(client, rows)
  return { notFound: false, rows, evento: null }
}

function createAgendaClient() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.SB_URL
  const key =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SB_ANON_KEY
  if (!url || !key) {
    throw new AgendaConfigError(
      'Faltan SUPABASE_URL y SUPABASE_ANON_KEY (o VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY) en el entorno del servidor.',
    )
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
    throw new AgendaConfigError(
      'La API pública no usa la service_role key. Configura la anon key o la publishable key.',
    )
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

type AgendaClient = ReturnType<typeof createAgendaClient>

async function loadEvento(
  client: AgendaClient,
  eventoId: string,
): Promise<EventoPublico | null> {
  const { data, error } = await client
    .from('eventos')
    .select('id, nombre, fecha_inicio, fecha_fin, activo')
    .eq('id', eventoId)
    .maybeSingle()
  if (error) throw error
  const row = data as {
    id?: string
    nombre?: string
    fecha_inicio?: string | null
    fecha_fin?: string | null
    activo?: boolean | null
  } | null
  if (!row?.id || !row.nombre || row.activo === false) return null
  return {
    id: row.id,
    nombre: row.nombre,
    fecha_inicio: textOrNull(row.fecha_inicio),
    fecha_fin: textOrNull(row.fecha_fin),
  }
}

async function loadRows(client: AgendaClient, filtros: AgendaFiltros): Promise<RawSesion[]> {
  if (Date.now() < rpcUnavailableUntil) return loadFromTables(client, filtros)
  const rpc = await tryRpc(client, filtros)
  if (rpc.kind === 'missing') {
    rpcUnavailableUntil = Date.now() + 5 * 60 * 1000
    return loadFromTables(client, filtros)
  }
  return rpc.rows
}

async function tryRpc(
  client: AgendaClient,
  filtros: AgendaFiltros,
): Promise<{ kind: 'missing' } | { kind: 'ok'; rows: RawSesion[] }> {
  const { data, error } = await client.rpc('agenda_publica', {
    p_evento_id: filtros.eventoId,
    p_fecha: filtros.fecha,
  })
  if (error) {
    if (isMissingRpc(error)) return { kind: 'missing' }
    throw error
  }
  if (!Array.isArray(data)) {
    throw new Error('agenda_publica no devolvió un arreglo')
  }
  return {
    kind: 'ok',
    rows: data
      .map((item) => rawFromRpc(item))
      .filter((row): row is RawSesion => row !== null),
  }
}

function isMissingRpc(error: PgError): boolean {
  if (error.code === 'PGRST202' || error.code === '42883') return true
  const msg = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  return (
    msg.includes('agenda_publica') &&
    (msg.includes('schema cache') ||
      msg.includes('does not exist') ||
      msg.includes('could not find'))
  )
}

async function loadFromTables(
  client: AgendaClient,
  filtros: AgendaFiltros,
): Promise<RawSesion[]> {
  let query = client
    .from('sesiones')
    .select(SESIONES_SELECT)
    .ilike('estado', 'CONFIRMADA')
    .eq('slot.escenario.evento.activo', true)
    .limit(2000)
  if (filtros.eventoId) query = query.eq('slot.escenario.evento_id', filtros.eventoId)
  if (filtros.fecha) query = query.eq('slot.dia', filtros.fecha)
  const { data, error } = await query
  if (error) throw error
  return (data ?? [])
    .map((item) => rawFromEmbed(item))
    .filter((row): row is RawSesion => row !== null)
}

async function paintColors(client: AgendaClient, rows: RawSesion[]): Promise<void> {
  const eventoIds = [...new Set(rows.map((row) => row.evento.id))]
  if (eventoIds.length === 0) return
  const base = await client
    .from('escenarios')
    .select('id, nombre, evento_id')
    .in('evento_id', eventoIds)
  if (base.error) {
    assignEscenarioColors(rows, catalogFromRows(rows))
    return
  }
  const colors = new Map<string, string | null>()
  const withColor = await client
    .from('escenarios')
    .select('id, color')
    .in('evento_id', eventoIds)
  if (!withColor.error) {
    for (const item of withColor.data ?? []) {
      const row = item as { id?: string; color?: string | null }
      if (row.id) colors.set(row.id, row.color ?? null)
    }
  } else if (!/color/i.test(withColor.error.message ?? '')) {
    throw withColor.error
  }
  assignEscenarioColors(
    rows,
    (base.data ?? []).map((item) => {
      const row = item as { id: string; nombre: string | null; evento_id: string }
      return {
        id: row.id,
        nombre: row.nombre ?? '',
        eventoId: row.evento_id,
        color: colors.get(row.id) ?? null,
      }
    }),
  )
}

function catalogFromRows(rows: RawSesion[]) {
  const seen = new Map<string, { id: string; nombre: string; eventoId: string; color: string | null }>()
  for (const row of rows) {
    seen.set(row.escenario.id, {
      id: row.escenario.id,
      nombre: row.escenario.nombre,
      eventoId: row.evento.id,
      color: row.escenario.color,
    })
  }
  return [...seen.values()]
}
