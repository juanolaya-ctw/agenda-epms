export type NodeIncoming = {
  method?: string
  url?: string
  headers?: Headers | Record<string, string | string[] | undefined>
}

export type NodeOutgoing = {
  statusCode?: number
  status?: (code: number) => NodeOutgoing
  setHeader: (name: string, value: string | number | readonly string[]) => void
  end: (body?: string | Uint8Array) => void
}

/**
 * Vercel invoca las funciones de /api como Node (IncomingMessage, ServerResponse).
 * El cuerpo tiene que ser un Buffer: res.end(string) re-codifica los bytes y rompe JPEG/PNG.
 */
export async function adaptVercel(
  req: Request | NodeIncoming,
  res: NodeOutgoing | undefined,
  handle: (request: Request) => Promise<Response>,
  fallbackPath = '/api/agenda',
): Promise<Response | void> {
  const request = toWebRequest(req, fallbackPath)
  const response = await handle(request)
  if (res && isNodeResponse(res) && !isWebRequest(req)) {
    await writeNodeResponse(res, response)
    return
  }
  return response
}

export async function writeNodeResponse(res: NodeOutgoing, response: Response): Promise<void> {
  const bytes = Buffer.from(await response.arrayBuffer())
  if (typeof res.status === 'function') res.status(response.status)
  else res.statusCode = response.status
  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })
  res.setHeader('Content-Length', String(bytes.length))
  res.end(bytes)
}

function isNodeResponse(value: NodeOutgoing | undefined): value is NodeOutgoing {
  return Boolean(value) && typeof value?.setHeader === 'function' && typeof value?.end === 'function'
}

function isWebRequest(value: unknown): value is Request {
  return typeof Request !== 'undefined' && value instanceof Request
}

export function toWebRequest(req: Request | NodeIncoming, fallbackPath: string): Request {
  if (isWebRequest(req)) return req
  const headers = headersFrom(req.headers)
  const proto = headers.get('x-forwarded-proto') ?? 'https'
  const host = headers.get('x-forwarded-host') ?? headers.get('host') ?? 'localhost'
  const path = req.url && req.url.length > 0 ? req.url : fallbackPath
  const url = path.startsWith('http') ? path : `${proto}://${host}${path}`
  return new Request(url, { method: req.method ?? 'GET', headers })
}

function headersFrom(headers: NodeIncoming['headers']): Headers {
  if (!headers) return new Headers()
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
