import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import handler, { handleAgenda } from '../api/agenda'
import fotoHandler from '../api/speaker-foto'
import { rawFromEmbed, rawFromRpc } from '../api/_lib/parse'
import {
  ahoraBogota,
  assignEscenarioColors,
  buildAgendaBody,
  isoBogota,
  parseAgendaQuery,
  toIcs,
  type RawSesion,
} from '../api/_lib/public'
import { readFileSync } from 'node:fs'

const FORBIDDEN = [
  'email',
  'telefono',
  'phone',
  'numero_documento',
  'tipo_documento',
  'email_secundario',
  'linkedin',
  'linkedin_url',
  'fuente',
  'estado',
  'estado_pieza',
  'toolkit_slug',
  'link_pieza_fase1',
  'notas',
  'motivo',
]

function keysDeep(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) keysDeep(item, found)
    return found
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      found.add(key)
      keysDeep(child, found)
    }
  }
  return found
}

function sampleRow(): RawSesion {
  return {
    id: '0874dc42-1e85-4256-b119-40c737f3161a',
    titulo: 'The 99% Digital Nation',
    descripcion: null,
    formato: 'Keynote',
    track: null,
    idioma: 'Español',
    fecha: '2026-11-04',
    horaInicio: '11:10:00',
    horaFin: '11:30:00',
    evento: {
      id: '2f042639-cc2d-4c06-bea3-f8316a3419c1',
      nombre: 'GovTech Summit 2026',
      fecha_inicio: '2026-11-03',
      fecha_fin: '2026-11-04',
    },
    escenario: { id: 'esc-1', nombre: 'Escenario principal', color: null },
    speakers: [
      {
        id: 'spk-1',
        nombre: 'Siim Sikkut',
        rol: 'keynote',
        cargo: 'Managing Partner',
        empresa: 'Digital Nation',
        foto_url: 'https://example.supabase.co/storage/v1/object/public/speaker-fotos/a.jpg',
        fotoEnStorage: true,
        bio: null,
      },
    ],
  }
}

describe('agenda pública', () => {
  it('rechaza filtros inválidos', () => {
    const badDate = parseAgendaQuery(new URL('https://agenda.colombiatech.co/api/agenda?date=2026-13-40'))
    assert.equal(badDate.ok, false)
    const badEvent = parseAgendaQuery(new URL('https://agenda.colombiatech.co/api/agenda?evento=no'))
    assert.equal(badEvent.ok, false)
    const ok = parseAgendaQuery(
      new URL(
        'https://agenda.colombiatech.co/api/agenda?evento=2f042639-cc2d-4c06-bea3-f8316a3419c1&fecha=2026-11-03&format=ics',
      ),
    )
    assert.equal(ok.ok, true)
    if (ok.ok) {
      assert.equal(ok.format, 'ics')
      assert.equal(ok.filtros.fecha, '2026-11-03')
    }
  })

  it('arma ISO America/Bogota y omite campos privados', () => {
    const row = sampleRow()
    assignEscenarioColors(row ? [row] : [], [
      { id: 'esc-1', nombre: 'Escenario principal', eventoId: row.evento.id, color: null },
    ])
    const body = buildAgendaBody({
      rows: [row],
      filtros: { eventoId: row.evento.id, fecha: null },
      evento: row.evento,
      now: new Date('2026-10-20T21:38:00Z'),
    })
    assert.equal(body.timezone, 'America/Bogota')
    assert.equal(body.generado_en, '2026-10-20T16:38:00-05:00')
    assert.equal(body.sesiones[0]?.inicio, '2026-11-04T11:10:00-05:00')
    assert.equal(body.sesiones[0]?.fin, '2026-11-04T11:30:00-05:00')
    assert.equal(body.sesiones[0]?.escenario.color, '#0093FF')
    assert.equal(body.sesiones[0]?.speakers[0]?.foto_url, null)
    const proxied = buildAgendaBody({
      rows: [row],
      filtros: { eventoId: row.evento.id, fecha: null },
      evento: row.evento,
      assetOrigin: 'https://agenda.colombiatech.co',
      supabaseUrl: 'https://example.supabase.co',
    })
    assert.equal(
      proxied.sesiones[0]?.speakers[0]?.foto_url,
      'https://agenda.colombiatech.co/api/speaker-foto?id=spk-1',
    )
    const external = buildAgendaBody({
      rows: [
        {
          ...row,
          speakers: [
            {
              ...row.speakers[0],
              foto_url: 'https://cdn.example/a.jpg',
              fotoEnStorage: false,
            },
          ],
        },
      ],
      filtros: { eventoId: null, fecha: null },
      evento: row.evento,
      assetOrigin: 'https://agenda.colombiatech.co',
      supabaseUrl: 'https://example.supabase.co',
    })
    assert.equal(external.sesiones[0]?.speakers[0]?.foto_url, null)
    const keys = keysDeep(body)
    for (const key of FORBIDDEN) assert.equal(keys.has(key), false, key)
  })

  it('descarta email y estado aunque vengan en la fila', () => {
    const input = {
      id: '0874dc42-1e85-4256-b119-40c737f3161a',
      titulo: 'Sesión de ana@example.com',
      estado: 'CONFIRMADA',
      descripcion: '  ',
      formato: 'Panel',
      track: 'GovTech',
      idioma: 'Español',
      email: 'secreto@example.com',
      slot: {
        dia: '2026-11-03',
        hora_inicio: '09:00:00',
        hora_fin: '10:00:00',
        escenario: {
          id: 'esc-1',
          nombre: 'Principal',
          evento: {
            id: '2f042639-cc2d-4c06-bea3-f8316a3419c1',
            nombre: 'GovTech Summit 2026',
            fecha_inicio: '2026-11-03',
            fecha_fin: '2026-11-04',
            activo: true,
          },
        },
      },
      sesion_speakers: [
        {
          rol: 'Panelista',
          speaker: {
            id: 'spk-1',
            nombre: 'Ana ana@banco.co',
            cargo: 'Directora',
            empresa: 'Banco',
            foto_url: 'https://cdn.example/speakers/ana@example.com.jpg',
            bio: 'Escribir a ana@example.com',
            email: 'ana@example.com',
            telefono: '+57',
          },
        },
      ],
    }
    const embed = rawFromEmbed(input)
    assert.ok(embed)
    const body = buildAgendaBody({
      rows: [embed],
      filtros: { eventoId: null, fecha: null },
      evento: null,
    })
    assert.equal(body.sesiones[0]?.speakers[0]?.rol, 'panelista')
    assert.equal(body.sesiones[0]?.titulo, 'Sesión de')
    assert.equal(body.sesiones[0]?.speakers[0]?.nombre, 'Ana')
    assert.equal(body.sesiones[0]?.descripcion, null)
    assert.equal(body.sesiones[0]?.speakers[0]?.bio, 'Escribir a')
    assert.equal(body.sesiones[0]?.speakers[0]?.foto_url, null)
    assert.equal(JSON.stringify(body).includes('@'), false)
    assert.equal(keysDeep(body).has('email'), false)
    assert.equal(rawFromEmbed({ ...input, estado: 'EN PROGRESO' }), null)
    assert.equal(rawFromEmbed({ ...input, estado: 'BORRADOR' }), null)
    assert.ok(rawFromEmbed({ ...input, estado: '  confirmada  ' }))
    assert.equal(rawFromRpc({ ...rpcPayload(embed), estado: ' CONFIRMADA ' })?.id, embed.id)
    const rpc = rawFromRpc({
      id: embed.id,
      titulo: embed.titulo,
      fecha: embed.fecha,
      hora_inicio: embed.horaInicio,
      hora_fin: embed.horaFin,
      evento: { ...embed.evento, activo: true },
      escenario: { id: embed.escenario.id, nombre: embed.escenario.nombre, color: null },
      speakers: [{ ...embed.speakers[0], email: 'no@example.com', telefono: '+57' }],
      email: 'no@example.com',
      estado: 'CONFIRMADA',
    })
    assert.ok(rpc)
    assert.equal(keysDeep(rpc).has('email'), false)
    assert.equal(keysDeep(rpc).has('telefono'), false)
    assert.equal(keysDeep(rpc).has('estado'), false)
  })

  it('el SQL no lee columnas privadas y revoca anon', () => {
    const sql = readFileSync('supabase/agenda-publica.sql', 'utf8')
    assert.equal(sql.includes('ydqbjyhcntszvrytdkml'), false)
    assert.match(sql, /REVOKE ALL ON ALL TABLES IN SCHEMA epms FROM anon, PUBLIC/)
    assert.match(sql, /upper\(btrim\(s\.estado\)\) = 'CONFIRMADA'/)
    for (const column of ['sp.email', 'sp.telefono', 'sp.numero_documento', 'sp.linkedin_url']) {
      assert.equal(sql.includes(column), false, column)
    }
    assert.match(sql, /tiene_foto/)
    assert.doesNotMatch(sql, /'foto_url', sp\.foto_url/)
  })

  it('rechaza una service_role key', async () => {
    const keys = [
      'SUPABASE_URL',
      'VITE_SUPABASE_URL',
      'SB_URL',
      'SUPABASE_ANON_KEY',
      'VITE_SUPABASE_ANON_KEY',
      'SB_ANON_KEY',
    ] as const
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.VITE_SUPABASE_URL = ''
    process.env.SB_URL = ''
    process.env.SUPABASE_ANON_KEY = 'e30.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.x'
    process.env.VITE_SUPABASE_ANON_KEY = ''
    process.env.SB_ANON_KEY = ''
    try {
      const response = await handleAgenda(new Request('https://agenda.colombiatech.co/api/agenda'))
      assert.equal(response.status, 500)
      const body = (await response.json()) as { error: string }
      assert.equal(body.error, 'No se pudo cargar la agenda')
      assert.equal(/supabase|service_role|anon key|VITE_/i.test(body.error), false)
    } finally {
      for (const key of keys) {
        if (previous[key] === undefined) delete process.env[key]
        else process.env[key] = previous[key]
      }
    }
  })

  it('responde OPTIONS en el adaptador Node', async () => {
    const chunks: (string | Uint8Array)[] = []
    let status = 0
    const headers = new Map<string, string>()
    await handler(
      { method: 'OPTIONS', url: '/api/agenda', headers: { host: 'agenda.colombiatech.co' } },
      {
        status(code: number) {
          status = code
          return this
        },
        setHeader(name: string, value: string | number | readonly string[]) {
          headers.set(name.toLowerCase(), String(value))
        },
        end(body?: string | Uint8Array) {
          if (body) chunks.push(body)
        },
      },
    )
    assert.equal(status, 204)
    assert.equal(headers.get('access-control-allow-origin'), '*')
    const body = chunks[0]
    assert.ok(body === undefined || (Buffer.isBuffer(body) && body.length === 0))
  })

  it('genera ICS con zona America/Bogota', () => {
    const body = buildAgendaBody({
      rows: [sampleRow()],
      filtros: { eventoId: null, fecha: null },
      evento: sampleRow().evento,
      now: new Date('2026-10-20T21:38:00Z'),
    })
    const ics = toIcs(body, new Date('2026-10-20T21:38:00Z'))
    const unfolded = ics.replace(/\r\n[ \t]/g, '')
    assert.match(unfolded, /DTSTART;TZID=America\/Bogota:20261104T111000/)
    assert.match(unfolded, /DTEND;TZID=America\/Bogota:20261104T113000/)
    assert.match(unfolded, /Siim Sikkut/)
    assert.equal(unfolded.includes('email'), false)
    for (const line of ics.split('\r\n')) {
      assert.ok(Buffer.byteLength(line) <= 75, line)
    }
    assert.equal(isoBogota('2026-11-03', '10:45:00'), '2026-11-03T10:45:00-05:00')
    assert.equal(ahoraBogota(new Date('2026-10-21T05:00:00Z')), '2026-10-21T00:00:00-05:00')
  })

  it('500 si falta agenda_publica y no lee tablas', async () => {
    const previous = swapEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_URL: '',
      SB_URL: '',
      SUPABASE_ANON_KEY: 'sb_publishable_test',
      VITE_SUPABASE_ANON_KEY: '',
      SB_ANON_KEY: '',
    })
    const seen: string[] = []
    const restore = mockFetch(async (url) => {
      seen.push(url)
      if (url.includes('/rest/v1/speakers') || url.includes('/rest/v1/sesiones') || url.includes('/rest/v1/escenarios')) {
        throw new Error(`leyó una tabla: ${url}`)
      }
      if (url.includes('/rpc/agenda_publica')) {
        return new Response(
          JSON.stringify({
            code: 'PGRST202',
            message: 'Could not find the function epms.agenda_publica in the schema cache',
          }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        )
      }
      throw new Error(`fetch inesperado ${url}`)
    })
    try {
      const sent: Uint8Array[] = []
      let status = 0
      await handler(
        { method: 'GET', url: '/api/agenda', headers: { host: 'agenda.colombiatech.co', 'x-forwarded-proto': 'https' } },
        nodeRes(sent, (code) => {
          status = code
        }),
      )
      assert.equal(status, 500)
      const body = JSON.parse(Buffer.from(sent[0] ?? []).toString('utf8')) as { error: string; sesiones?: unknown }
      assert.equal(body.error, 'No se pudo cargar la agenda')
      assert.equal(body.sesiones, undefined)
      assert.equal(/schema cache|agenda_publica|supabase/i.test(body.error), false)
      assert.ok(seen.some((url) => url.includes('/rpc/agenda_publica')))
    } finally {
      restore()
      previous()
    }
  })

  it('el adaptador Node de Vercel envía el JPEG byte a byte', async () => {
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x07, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9, 0x00, 0x00,
    ])
    assert.equal(jpeg.length, 15)
    const utf8 = Buffer.from(jpeg.toString('utf8'))
    assert.notEqual(utf8.length, jpeg.length)

    const previous = swapEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_URL: '',
      SB_URL: '',
      SUPABASE_ANON_KEY: 'sb_publishable_test',
      VITE_SUPABASE_ANON_KEY: '',
      SB_ANON_KEY: '',
    })
    const storage = 'https://example.supabase.co/storage/v1/object/public/speaker-fotos/a.jpg'
    const restore = mockFetch(async (url) => {
      if (url.includes('/rest/v1/speakers') || url.includes('/rest/v1/sesiones')) {
        throw new Error(`leyó una tabla: ${url}`)
      }
      if (url.includes('/rpc/agenda_foto_publica')) {
        return new Response(JSON.stringify(storage), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url === storage) {
        return new Response(jpeg, { status: 200, headers: { 'content-type': 'image/jpeg' } })
      }
      throw new Error(`fetch inesperado ${url}`)
    })
    try {
      const sent: Uint8Array[] = []
      const headers = new Map<string, string>()
      let status = 0
      await fotoHandler(
        {
          method: 'GET',
          url: '/api/speaker-foto?id=7669695f-23eb-4bc6-854d-43042d127fe0',
          headers: { host: 'agenda.colombiatech.co', 'x-forwarded-proto': 'https' },
        },
        nodeRes(sent, (code) => {
          status = code
        }, headers),
      )
      assert.equal(status, 200)
      const body = Buffer.from(sent[0] ?? [])
      assert.ok(Buffer.isBuffer(sent[0]))
      assert.equal(body.length, 15)
      assert.ok(body.equals(jpeg))
      assert.equal(headers.get('content-type'), 'image/jpeg')
      assert.equal(headers.get('content-length'), '15')
      assert.equal(headers.get('x-content-type-options'), 'nosniff')
      assert.match(headers.get('content-security-policy') ?? '', /default-src 'none'/)
      assert.match(headers.get('content-security-policy') ?? '', /sandbox/)
    } finally {
      restore()
      previous()
    }
  })

  it('rechaza image/svg+xml en el adaptador Node', async () => {
    const previous = swapEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_URL: '',
      SB_URL: '',
      SUPABASE_ANON_KEY: 'sb_publishable_test',
      VITE_SUPABASE_ANON_KEY: '',
      SB_ANON_KEY: '',
    })
    const storage = 'https://example.supabase.co/storage/v1/object/public/speaker-fotos/a.svg'
    const restore = mockFetch(async (url) => {
      if (url.includes('/rpc/agenda_foto_publica')) {
        return new Response(JSON.stringify(storage), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url === storage) {
        return new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>', {
          status: 200,
          headers: { 'content-type': 'image/svg+xml' },
        })
      }
      throw new Error(`fetch inesperado ${url}`)
    })
    try {
      const sent: Uint8Array[] = []
      let status = 0
      await fotoHandler(
        {
          method: 'GET',
          url: '/api/speaker-foto?id=7669695f-23eb-4bc6-854d-43042d127fe0',
          headers: { host: 'agenda.colombiatech.co', 'x-forwarded-proto': 'https' },
        },
        nodeRes(sent, (code) => {
          status = code
        }),
      )
      assert.equal(status, 404)
      assert.equal(Buffer.from(sent[0] ?? []).toString('utf8').includes('<svg'), false)
    } finally {
      restore()
      previous()
    }
  })

  it('500 si falta agenda_foto_publica', async () => {
    const previous = swapEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_URL: '',
      SB_URL: '',
      SUPABASE_ANON_KEY: 'sb_publishable_test',
      VITE_SUPABASE_ANON_KEY: '',
      SB_ANON_KEY: '',
    })
    const restore = mockFetch(async (url) => {
      if (url.includes('/rest/v1/speakers') || url.includes('/rest/v1/sesiones')) {
        throw new Error(`leyó una tabla: ${url}`)
      }
      if (url.includes('/rpc/agenda_foto_publica')) {
        return new Response(
          JSON.stringify({
            code: 'PGRST202',
            message: 'Could not find the function epms.agenda_foto_publica in the schema cache',
          }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        )
      }
      throw new Error(`fetch inesperado ${url}`)
    })
    try {
      const sent: Uint8Array[] = []
      let status = 0
      await fotoHandler(
        {
          method: 'GET',
          url: '/api/speaker-foto?id=7669695f-23eb-4bc6-854d-43042d127fe0',
          headers: { host: 'agenda.colombiatech.co', 'x-forwarded-proto': 'https' },
        },
        nodeRes(sent, (code) => {
          status = code
        }),
      )
      assert.equal(status, 500)
      const body = Buffer.from(sent[0] ?? []).toString('utf8')
      assert.equal(body, 'No se pudo cargar la foto')
      assert.equal(/schema cache|agenda_foto|supabase|VITE_/i.test(body), false)
    } finally {
      restore()
      previous()
    }
  })
})

function rpcPayload(embed: RawSesion) {
  return {
    id: embed.id,
    titulo: embed.titulo,
    fecha: embed.fecha,
    hora_inicio: embed.horaInicio,
    hora_fin: embed.horaFin,
    evento: { ...embed.evento, activo: true },
    escenario: { id: embed.escenario.id, nombre: embed.escenario.nombre, color: null },
    speakers: [{ ...embed.speakers[0], email: 'no@example.com', telefono: '+57' }],
    email: 'no@example.com',
  }
}

function nodeRes(
  sent: Uint8Array[],
  onStatus: (code: number) => void,
  headers = new Map<string, string>(),
) {
  return {
    status(code: number) {
      onStatus(code)
      return this
    },
    setHeader(name: string, value: string | number | readonly string[]) {
      headers.set(name.toLowerCase(), String(value))
    },
    end(body?: string | Uint8Array) {
      if (typeof body === 'string') sent.push(Buffer.from(body))
      else if (body) sent.push(Buffer.from(body))
    },
  }
}

function swapEnv(next: Record<string, string>): () => void {
  const previous = Object.fromEntries(Object.keys(next).map((key) => [key, process.env[key]]))
  for (const [key, value] of Object.entries(next)) process.env[key] = value
  return () => {
    for (const key of Object.keys(next)) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
}

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response): () => void {
  const previous = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    return handler(url, init)
  }) as typeof fetch
  return () => {
    globalThis.fetch = previous
  }
}
