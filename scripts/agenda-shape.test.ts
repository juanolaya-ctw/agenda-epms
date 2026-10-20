import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import handler, { handleAgenda } from '../api/agenda.ts'
import { SPEAKER_PUBLIC_COLUMNS } from '../api/_lib/load.ts'
import { rawFromEmbed, rawFromRpc } from '../api/_lib/parse.ts'
import {
  ahoraBogota,
  assignEscenarioColors,
  buildAgendaBody,
  isoBogota,
  parseAgendaQuery,
  toIcs,
  type RawSesion,
} from '../api/_lib/public.ts'

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
        foto_url: 'https://example.com/foto.jpg',
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
    })
    assert.equal(
      proxied.sesiones[0]?.speakers[0]?.foto_url,
      'https://agenda.colombiatech.co/api/speaker-foto?id=spk-1',
    )
    const keys = keysDeep(body)
    for (const key of FORBIDDEN) assert.equal(keys.has(key), false, key)
  })

  it('descarta email y estado aunque vengan en la fila', () => {
    const input = {
      id: '0874dc42-1e85-4256-b119-40c737f3161a',
      titulo: 'Sesión',
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
            nombre: 'Ana',
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
    assert.equal(body.sesiones[0]?.descripcion, null)
    assert.equal(body.sesiones[0]?.speakers[0]?.bio, 'Escribir a')
    assert.equal(body.sesiones[0]?.speakers[0]?.foto_url, null)
    assert.equal(JSON.stringify(body).includes('@'), false)
    assert.equal(keysDeep(body).has('email'), false)
    assert.equal(rawFromEmbed({ ...input, estado: 'EN PROGRESO' }), null)
    assert.equal(rawFromEmbed({ ...input, estado: 'BORRADOR' }), null)
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

  it('no selecciona columnas privadas de speaker', () => {
    const cols = SPEAKER_PUBLIC_COLUMNS.toLowerCase()
    for (const key of ['email', 'telefono', 'documento', 'linkedin', 'fuente']) {
      assert.equal(cols.includes(key), false, key)
    }
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
      assert.match(body.error, /service_role/)
    } finally {
      for (const key of keys) {
        if (previous[key] === undefined) delete process.env[key]
        else process.env[key] = previous[key]
      }
    }
  })

  it('responde OPTIONS en el adaptador Node', async () => {
    const chunks: string[] = []
    let status = 0
    const headers = new Map<string, string>()
    await handler(
      { method: 'OPTIONS', url: '/api/agenda', headers: { host: 'agenda.colombiatech.co' } },
      {
        status(code: number) {
          status = code
          return this
        },
        setHeader(name: string, value: string) {
          headers.set(name.toLowerCase(), value)
        },
        end(body?: string) {
          if (body) chunks.push(body)
        },
      },
    )
    assert.equal(status, 204)
    assert.equal(headers.get('access-control-allow-origin'), '*')
    assert.equal(chunks.length, 0)
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
})
