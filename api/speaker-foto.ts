import { imageMediaType } from './_lib/image'
import { AgendaConfigError, loadPublicFotoUrl } from './_lib/load'
import { adaptVercel, type NodeIncoming, type NodeOutgoing } from './_lib/node'
import { isUuid } from './_lib/public'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400',
  'X-Content-Type-Options': 'nosniff',
}

const FOTO_HEADERS: Record<string, string> = {
  ...CORS,
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'Content-Disposition': 'inline',
  'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
}

const CACHE_NONE = 'no-store'

export default function handler(
  req: Request | NodeIncoming,
  res?: NodeOutgoing,
): Promise<Response | void> {
  return adaptVercel(req, res, (request) => handleSpeakerFoto(request), '/api/speaker-foto')
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
    if (!fotoUrl) return text('Foto no disponible', 404)
    const upstream = await fetch(fotoUrl)
    const bytes = new Uint8Array(await upstream.arrayBuffer())
    const media = imageMediaType(bytes, upstream.headers.get('content-type') ?? '')
    if (!upstream.ok || !media) return text('Foto no disponible', 404)
    return new Response(bytes, {
      status: 200,
      headers: {
        ...FOTO_HEADERS,
        'Content-Type': media,
      },
    })
  } catch (error) {
    console.error('speaker-foto', error instanceof Error ? error.message : error)
    if (error instanceof AgendaConfigError) return text('No se pudo cargar la foto', 500)
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
