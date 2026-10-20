import {
  AgendaConfigError,
  isAllowedFotoUrl,
  loadPublicFotoUrl,
  supabaseUrlFromEnv,
} from './_lib/load.ts'
import { isUuid } from './_lib/public.ts'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400',
  'X-Content-Type-Options': 'nosniff',
}

const CACHE_FOTO = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'
const CACHE_NONE = 'no-store'

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
  const response = await handleSpeakerFoto(toWebRequest(req))
  if (res && typeof res.status === 'function' && typeof res.end === 'function' && !isWebRequest(req)) {
    res.status(response.status)
    response.headers.forEach((value, key) => {
      res.setHeader(key, value)
    })
    res.end(await response.text())
    return
  }
  return response
}

export async function handleSpeakerFoto(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }
  if (request.method !== 'GET') {
    return text('Método no permitido', 405, { Allow: 'GET, OPTIONS' })
  }
  const id = new URL(request.url).searchParams.get('id')?.trim() ?? ''
  if (!isUuid(id)) return text('id debe ser un UUID', 400)

  try {
    const fotoUrl = await loadPublicFotoUrl(id)
    const supabaseUrl = supabaseUrlFromEnv()
    if (!fotoUrl || !supabaseUrl || !isAllowedFotoUrl(fotoUrl, supabaseUrl)) {
      return text('Foto no disponible', 404)
    }
    const upstream = await fetch(fotoUrl)
    const contentType = upstream.headers.get('content-type') ?? ''
    if (!upstream.ok || !contentType.toLowerCase().startsWith('image/')) {
      return text('Foto no disponible', 404)
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': contentType,
        'Cache-Control': CACHE_FOTO,
        'Content-Disposition': 'inline',
      },
    })
  } catch (error) {
    console.error('speaker-foto', error instanceof Error ? error.message : error)
    if (error instanceof AgendaConfigError) return text(error.message, 500)
    return text('Foto no disponible', 404)
  }
}

function text(body: string, status: number, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: {
      ...CORS,
      ...extra,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': CACHE_NONE,
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
  const path = req.url && req.url.length > 0 ? req.url : '/api/speaker-foto'
  const url = path.startsWith('http') ? path : `${proto}://${host}${path}`
  return new Request(url, { method: req.method ?? 'GET', headers })
}

function headersFrom(headers: NodeRequest['headers']): Headers {
  if (typeof Headers !== 'undefined' && headers instanceof Headers) return headers
  const out = new Headers()
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) out.append(key, item)
    } else if (typeof value === 'string') out.set(key, value)
  }
  return out
}
