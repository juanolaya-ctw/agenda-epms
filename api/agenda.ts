import { loadPublicAgenda, supabaseUrlFromEnv } from './_lib/load'
import { adaptVercel } from './_lib/node'
import { buildAgendaBody, parseAgendaQuery, toIcs, type AgendaBody } from './_lib/public'

const CACHE_OK = 'public, max-age=60, s-maxage=60, stale-while-revalidate=300'
const CACHE_NONE = 'no-store'
const PUBLIC_ERROR = 'No se pudo cargar la agenda'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400',
  'X-Content-Type-Options': 'nosniff',
}

export default function handler(
  req: Request | Parameters<typeof adaptVercel>[0],
  res?: Parameters<typeof adaptVercel>[1],
): Promise<Response | void> {
  return adaptVercel(req, res, handleAgenda)
}

export async function handleAgenda(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }
  if (request.method !== 'GET') {
    return json({ error: 'Método no permitido' }, 405, CACHE_NONE, {
      Allow: 'GET, OPTIONS',
    })
  }

  const parsed = parseAgendaQuery(new URL(request.url))
  if (!parsed.ok) return json({ error: parsed.error }, 400, CACHE_NONE)

  try {
    const loaded = await loadPublicAgenda(parsed.filtros)
    if (loaded.notFound) {
      return json({ error: 'Evento no encontrado' }, 404, CACHE_NONE)
    }
    const body = buildAgendaBody({
      rows: loaded.rows,
      filtros: parsed.filtros,
      evento: loaded.evento,
      assetOrigin: new URL(request.url).origin,
      supabaseUrl: supabaseUrlFromEnv(),
    })
    if (parsed.format === 'ics') {
      return new Response(toIcs(body), {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': 'inline; filename="agenda.ics"',
          'Cache-Control': CACHE_OK,
        },
      })
    }
    return json(body, 200, CACHE_OK)
  } catch (error) {
    console.error('agenda pública', error instanceof Error ? error.message : error)
    return json({ error: PUBLIC_ERROR }, 500, CACHE_NONE)
  }
}

function json(
  body: AgendaBody | { error: string },
  status: number,
  cache: string,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      ...extra,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache,
    },
  })
}
