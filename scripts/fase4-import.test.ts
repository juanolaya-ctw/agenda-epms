/**
 * Fase 4 — import Excel/CSV (offline, sin BD ni red salvo SheetJS opcional).
 * npm run test:fase4
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import {
  autodetectarMapeo,
  bulkActualizarNombreEmpresa,
  construirGestionesDeCanales,
  construirPlan,
  enmascararEmail,
  importClave,
  mapearEstadoExcel,
  matchSpeaker,
  normalizarEmailImport,
  normalizarTextoMatch,
  parseCsv,
  parseFechaYmd,
  scoreMapeo,
} from '../src/lib/importSpeakers'
import { celdaValor } from '../src/lib/importSpeakers/parse'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE = join(__dirname, 'fixtures', 'fase4-import-qa.csv')

describe('normalizarTextoMatch (paridad SQL)', () => {
  it('quita tildes, ñ, puntuación y colapsa espacios', () => {
    assert.equal(normalizarTextoMatch('José  María'), 'jose maria')
    assert.equal(normalizarTextoMatch('Ñandú, S.A.'), 'nandu s a')
    assert.equal(normalizarTextoMatch('  FOO   BAR  '), 'foo bar')
    assert.equal(normalizarTextoMatch(''), null)
    assert.equal(normalizarTextoMatch(null), null)
    assert.equal(normalizarTextoMatch('Café-Orgánicá'), 'cafe organica')
  })
})

describe('parseFechaYmd', () => {
  it('ISO y DD/MM/YYYY', () => {
    assert.equal(parseFechaYmd('2026-10-15'), '2026-10-15')
    assert.equal(parseFechaYmd('15/10/2026'), '2026-10-15')
    assert.equal(parseFechaYmd(true), null)
  })

  it('Date medianoche UTC no se corre de día (Bogotá)', () => {
    // SheetJS cellDates: 2026-10-15T00:00:00.000Z → en Bogotá es 14 a las 19:00
    const d = new Date('2026-10-15T00:00:00.000Z')
    assert.equal(parseFechaYmd(d), '2026-10-15')
  })

  it('serial Excel offline → YMD UTC', () => {
    // 2026-10-15 = días desde 1899-12-30
    const epoch = Date.UTC(1899, 11, 30)
    const serial = (Date.UTC(2026, 9, 15) - epoch) / 86400000
    assert.equal(parseFechaYmd(serial), '2026-10-15')
  })
})

describe('mapearEstadoExcel', () => {
  it('tabla de sinónimos del brief', () => {
    assert.equal(mapearEstadoExcel('').estado, 'SIN_CLASIFICAR')
    assert.equal(mapearEstadoExcel('no enviado').estado, 'PENDIENTE_CONTACTAR')
    assert.equal(mapearEstadoExcel('ENVIADO').estado, 'CONTACTADO')
    assert.equal(mapearEstadoExcel('no respondió').estado, 'CONTACTADO')
    assert.equal(mapearEstadoExcel('no respondió').motivo, 'no respondió')
    assert.equal(mapearEstadoExcel('en conversación').estado, 'EN_CONVERSACION')
    assert.equal(mapearEstadoExcel('confirmó').estado, 'CONFIRMADO')
    assert.equal(
      mapearEstadoExcel('confirmó pero quiere viáticos').fuerzaViaticos,
      true,
    )
    assert.equal(mapearEstadoExcel('no puede').estado, 'NO_DISPONIBLE')
    assert.equal(mapearEstadoExcel('despriorizado').estado, 'DESCARTADO')
    const unk = mapearEstadoExcel('estado rarísimo xyz')
    assert.equal(unk.estado, 'SIN_CLASIFICAR')
    assert.ok(unk.aviso)
    assert.equal(unk.motivo, 'estado rarísimo xyz')
  })
})

describe('gestiones de canales', () => {
  it('checkbox+fecha, fecha sin checkbox, checkbox sin fecha', () => {
    const r = construirGestionesDeCanales([
      { tipo: 'correo', checkboxRaw: true, fechaRaw: '2026-10-15' },
      { tipo: 'linkedin', checkboxRaw: false, fechaRaw: '2026-11-01' },
      { tipo: 'referencia', checkboxRaw: true, fechaRaw: null },
      { tipo: 'institucion', checkboxRaw: false, fechaRaw: null },
    ])
    assert.equal(r.gestiones.length, 2)
    assert.ok(r.gestiones.some((g) => g.tipo === 'correo'))
    assert.ok(r.gestiones.some((g) => g.tipo === 'linkedin'))
    assert.ok(r.avisos.some((a) => a.codigo === 'fecha_sin_checkbox'))
    assert.ok(r.avisos.some((a) => a.codigo === 'checkbox_sin_fecha'))
    assert.equal(
      importClave('e1', 's1', 'correo', '2026-10-15'),
      'e1:s1:correo:2026-10-15',
    )
  })

  it('email en checkbox → aviso email_detectado_en_otra_columna', () => {
    const r = construirGestionesDeCanales([
      {
        tipo: 'correo',
        checkboxRaw: 'alguien@example.com',
        fechaRaw: '2026-10-15',
      },
    ])
    assert.ok(
      r.avisos.some((a) => a.codigo === 'email_detectado_en_otra_columna'),
    )
    assert.equal(r.canales.correo.marcado, false)
    assert.equal(r.gestiones.length, 1)
  })

  it('fecha anterior a 2026 → fecha_sospechosa', () => {
    const r = construirGestionesDeCanales([
      { tipo: 'correo', checkboxRaw: true, fechaRaw: '2025-03-01' },
    ])
    assert.ok(r.avisos.some((a) => a.codigo === 'fecha_sospechosa'))
    assert.equal(r.gestiones.length, 1)
  })
})

describe('matching', () => {
  const speakers = [
    {
      id: '1',
      nombre: 'Ana Pérez',
      empresa: 'Acme',
      cargo: 'CEO',
      email: 'ana@example.com',
      pais: null,
    },
    {
      id: '2',
      nombre: 'Ana Pérez',
      empresa: 'Beta',
      cargo: 'CTO',
      email: null,
      pais: null,
    },
    {
      id: '3',
      nombre: 'Luis Gómez',
      empresa: 'Acme',
      cargo: null,
      email: null,
      pais: null,
    },
  ]

  it('alta por email', () => {
    const m = matchSpeaker(
      {
        email: 'ana@example.com',
        nombreNorm: normalizarTextoMatch('Ana Pérez'),
        empresaNorm: null,
      },
      speakers,
    )
    assert.equal(m.nivel, 'alta')
    assert.equal(m.motivo, 'email')
  })

  it('alta por nombre+empresa', () => {
    const m = matchSpeaker(
      {
        email: null,
        nombreNorm: normalizarTextoMatch('Luis Gómez'),
        empresaNorm: normalizarTextoMatch('Acme'),
      },
      speakers,
    )
    assert.equal(m.nivel, 'alta')
    assert.equal(m.motivo, 'nombre_empresa')
  })

  it('media por nombre solo', () => {
    const m = matchSpeaker(
      {
        email: null,
        nombreNorm: normalizarTextoMatch('Luis Gómez'),
        empresaNorm: normalizarTextoMatch('Otra'),
      },
      speakers,
    )
    assert.equal(m.nivel, 'media')
  })

  it('ambigua con homónimos', () => {
    const m = matchSpeaker(
      {
        email: null,
        nombreNorm: normalizarTextoMatch('Ana Pérez'),
        empresaNorm: null,
      },
      speakers,
    )
    assert.equal(m.nivel, 'ambigua')
  })
})

describe('parse CSV + mapeo + plan (fixture)', () => {
  const raw = readFileSync(FIXTURE, 'utf8')
  // Ensure BOM handling
  const withBom = '\uFEFF' + raw

  it('parsea CSV con BOM, multilínea y headers duplicados', () => {
    const hoja = parseCsv(withBom)
    assert.ok(hoja.filas.length >= 10)
    assert.ok(hoja.headers.includes('Nombre'))
    // Fecha last push aparece varias veces
    const fechas = hoja.headers.filter((h) =>
      /fecha last push/i.test(h),
    )
    assert.ok(fechas.length >= 3)
  })

  it('autodetecta mapeo por posición de canales', () => {
    const hoja = parseCsv(raw)
    const sample = hoja.filas
      .slice(0, 20)
      .map((f) => f.celdas.map((c) => celdaValor(c)))
    const mapeo = autodetectarMapeo(hoja.headers, sample)
    assert.equal(mapeo[0], 'nombre')
    assert.equal(mapeo[1], 'empresa')
    assert.ok(scoreMapeo(mapeo) >= 8)
    assert.ok(Object.values(mapeo).includes('canal_correo'))
    assert.ok(Object.values(mapeo).includes('canal_correo_fecha'))
    assert.ok(Object.values(mapeo).includes('canal_linkedin'))
  })

  it('construirPlan: crear/revisar/error/homónimos', () => {
    const hoja = parseCsv(raw)
    const mapeo = autodetectarMapeo(
      hoja.headers,
      hoja.filas.slice(0, 20).map((f) => f.celdas.map((c) => celdaValor(c))),
    )
    const existentes = [
      {
        id: 'sp-exist',
        nombre: 'Test QA Import 02',
        empresa: 'Org Beta',
        cargo: 'CTO',
        email: null,
        pais: 'Colombia',
      },
    ]
    const plan = construirPlan(hoja.filas, mapeo, existentes, [], {
      estadoDefault: 'PENDIENTE_CONTACTAR',
      archivoNombre: 'fase4-import-qa.csv',
      hojaNombre: 'CSV',
    })

    const sinNombre = plan.filas.find((f) => f.fila.error)
    assert.ok(sinNombre)
    assert.equal(sinNombre!.accion, 'omitir')

    const porEmail = plan.filas.find(
      (f) => f.fila.email === 'persona01@example.com',
    )
    assert.ok(porEmail)

    // Homónimos Test QA Import 01
    const hom = plan.filas.filter((f) => f.homonimoEnArchivo)
    assert.ok(hom.length >= 2)

    // Match nombre+empresa exacto → revisar (no auto-actualizar)
    const matchNe = plan.filas.find(
      (f) =>
        f.match.motivo === 'nombre_empresa' && f.match.nivel === 'alta',
    )
    assert.ok(matchNe)
    assert.equal(matchNe!.accion, 'revisar')

    const bulk = bulkActualizarNombreEmpresa(plan.filas)
    const after = bulk.find(
      (f) =>
        f.match.motivo === 'nombre_empresa' &&
        f.match.nivel === 'alta' &&
        !f.homonimoEnArchivo,
    )
    assert.equal(after!.accion, 'actualizar')

    assert.ok(plan.resumen.gruposHomonimos >= 1)
  })

  it('bulkActualizarNombreEmpresa excluye homónimos intra-archivo', () => {
    const csv = [
      'Nombre,Organización,Estado',
      'Ana Pérez,Acme,enviado',
      'Ana Pérez,Acme,enviado',
    ].join('\n')
    const hoja = parseCsv(csv)
    const mapeo = autodetectarMapeo(hoja.headers)
    const existentes = [
      {
        id: 'sp-ana',
        nombre: 'Ana Pérez',
        empresa: 'Acme',
        cargo: null,
        email: null,
        pais: null,
      },
    ]
    const plan = construirPlan(hoja.filas, mapeo, existentes, [], {
      estadoDefault: 'PENDIENTE_CONTACTAR',
      archivoNombre: 'hom.csv',
      hojaNombre: 'CSV',
    })
    assert.ok(plan.filas.every((f) => f.homonimoEnArchivo))
    assert.ok(plan.filas.every((f) => f.accion === 'revisar'))
    const bulk = bulkActualizarNombreEmpresa(plan.filas)
    assert.ok(
      bulk.every((f) => f.accion === 'revisar'),
      'homónimos no pasan a actualizar vía bulk',
    )
  })

  it('re-run idéntico → sin cambios / omitir (gestiones no bloquean)', () => {
    const csv =
      'Nombre,Organización,Estado,Correo directo,Fecha last push\n' +
      'Test QA Import 02,Org Beta,enviado,TRUE,2026-10-15\n'
    const hoja = parseCsv(csv)
    const mapeo = autodetectarMapeo(hoja.headers)
    const existentes = [
      {
        id: 'sp-exist',
        nombre: 'Test QA Import 02',
        empresa: 'Org Beta',
        cargo: 'CTO',
        email: 'ya@example.com',
        pais: 'Colombia',
      },
    ]
    const membresias = [
      {
        speaker_id: 'sp-exist',
        estado: 'CONTACTADO' as const,
        estado_motivo: null,
        responsable_texto: null,
        proximo_seguimiento_nota: null,
        notas_internas: null,
        pista_espacio: null,
        requiere_viaticos: false,
        datos_prospeccion: {
          import_excel: {
            archivo: 'rerun.csv',
            hoja: 'CSV',
            fila: 2,
            importado_at: '2026-11-01T00:00:00.000Z',
            nombre: 'Test QA Import 02',
            empresa: 'Org Beta',
            cargo: null,
            pais: null,
            contacto_raw: null,
            ubicacion_raw: null,
            estado_raw: 'enviado',
            agenda: null,
            canales: {
              correo: { marcado: true, fecha: '2026-10-15' },
              linkedin: { marcado: false, fecha: null },
              referencia: { marcado: false, fecha: null },
              institucion: { marcado: false, fecha: null },
            },
            avisos: [],
          },
        },
      },
    ]
    // Primera vez: email match → actualizar (email en hub)
    // Forzamos match por email
    existentes[0]!.email = 'ya@example.com'
    // Sin email en CSV → match nombre+empresa → revisar; usamos acción vía email
    // Añadimos email a CSV match
    const csv2 =
      'Nombre,Organización,Estado,email,Correo directo,Fecha last push\n' +
      'Test QA Import 02,Org Beta,enviado,ya@example.com,TRUE,2026-10-15\n'
    const hoja2 = parseCsv(csv2)
    const mapeo2 = autodetectarMapeo(hoja2.headers)
    const plan = construirPlan(hoja2.filas, mapeo2, existentes, membresias, {
      estadoDefault: 'PENDIENTE_CONTACTAR',
      archivoNombre: 'rerun.csv',
      hojaNombre: 'CSV',
    })
    assert.equal(plan.filas.length, 1)
    const fp = plan.filas[0]!
    assert.equal(fp.match.motivo, 'email')
    assert.ok(fp.fila.gestiones.length >= 1, 'tiene gestiones en plan')
    assert.equal(fp.sinCambios, true)
    assert.equal(fp.accion, 'omitir')
  })

  it('CSV con ;', () => {
    const csv = 'Nombre;Organización;Estado\nPersona Ficticia 99;Org Demo;enviado\n'
    const hoja = parseCsv(csv)
    assert.equal(hoja.filas.length, 1)
    assert.equal(celdaValor(hoja.filas[0]!.celdas[0]!), 'Persona Ficticia 99')
  })
})

describe('email + enmascarar', () => {
  it('email inválido → aviso', () => {
    const e = normalizarEmailImport('no-es-email')
    assert.equal(e.email, null)
    assert.ok(e.aviso)
  })
  it('enmascara', () => {
    assert.equal(enmascararEmail('juan@example.com'), 'ju••@example.com')
  })
})

describe('parse xlsx (SheetJS CDN)', () => {
  it('genera y lee un xlsx mínimo en memoria', async (t) => {
    let XLSX: {
      utils: {
        aoa_to_sheet: (aoa: unknown[][]) => unknown
        book_new: () => unknown
        book_append_sheet: (wb: unknown, ws: unknown, name: string) => void
      }
      write: (wb: unknown, opts: Record<string, unknown>) => ArrayBuffer
    }
    try {
      const mod = await import(
        /* @vite-ignore */ 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs'
      )
      XLSX = (mod as { default?: typeof XLSX }).default ?? (mod as typeof XLSX)
    } catch {
      t.skip('SheetJS CDN no disponible (sin red)')
      return
    }
    const aoa = [
      ['Nombre', 'Organización', 'Estado'],
      ['Persona Ficticia X', 'Org Demo', 'enviado'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'CRM')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const { parseXlsx } = await import('../src/lib/importSpeakers/parse')
    const arch = await parseXlsx(buf)
    assert.equal(arch.hojas.length, 1)
    assert.equal(arch.hojas[0]!.filas.length, 1)
    assert.equal(
      celdaValor(arch.hojas[0]!.filas[0]!.celdas[0]!),
      'Persona Ficticia X',
    )
  })
})
