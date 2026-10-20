import { AgendaConfigError, loadPublicAgenda } from './_lib/load.ts'
import {
  buildAgendaBody,
  parseAgendaQuery,
  toIcs,
  type AgendaBody,
} from './_lib/public.ts'

const CACHE_OK = 'public, max-age=60, s-maxage=60, stale-while-revalidate=300'
const CACHE_NONE = 'no-store'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400',
  'X-Content-Type-Options': 'nosniff',
}

type NodeRequest = {
  method?: string
  url?: string
  headers: Headers | Record<string, string | string[] | undefined>
}

type NodeResponse = {
  status: (code: number) => NodeResponse
  setHeader: (name: string, value: string) => void
  end: (body?: string) => void
}

export default async function handler(
  req: Request | NodeRequest,
  res?: NodeResponse,
): Promise<Response | void> {
  const response = await handleAgenda(toWebRequest(req))
  if (res && typeof res.status === 'function' && typeof res.end === 'function' && !isWebRequest(req)) {
    await writeNode(res, response)
    return
  }
  return response
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
    if (error instanceof AgendaConfigError) {
      return json({ error: error.message }, 500, CACHE_NONE)
    }
    return json({ error: 'No se pudo cargar la agenda' }, 500, CACHE_NONE)
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

function isWebRequest(value: unknown): value is Request {
  return typeof Request !== 'undefined' && value instanceof Request
}

function toWebRequest(req: Request | NodeRequest): Request {
  if (isWebRequest(req)) return req
  const headers = headersFrom(req.headers)
  const proto = headers.get('x-forwarded-proto') ?? 'https'
  const host = headers.get('x-forwarded-host') ?? headers.get('host') ?? 'localhost'
  const path = req.url && req.url.length > 0 ? req.url : '/api/agenda'
  const url = path.startsWith('http') ? path : `${proto}://${host}${path}`
  return new Request(url, { method: req.method ?? 'GET', headers })
}

function headersFrom(headers: NodeRequest['headers']): Headers {
  if (typeof Headers !== 'undefined' && headers instanceof Headers) return headers
  const out = new Headers()
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) out.append(key, item)
    } else if (typeof value === 'string') {
      out.set(key, value)
    }
  }
  return out
}

async function writeNode(res: NodeResponse, response: Response): Promise<void> {
  res.status(response.status)
  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })
  res.end(await response.text())
}
