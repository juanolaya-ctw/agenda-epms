/**
 * Fase 1 — prospección por evento. Sin BD ni red.
 * npx tsx --test scripts/fase1-prospeccion.test.ts
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  esPendienteHoy,
  esVencido,
  finDiaBogota,
  inicioDiaBogota,
  timestampAYmdBogota,
  ymdATimestampBogota,
  ymdBogota,
} from '../src/lib/bogotaDate.ts'
import { armarPayloadAltaRapida } from '../src/lib/prospeccionAlta.ts'
import { filaPasaProspeccion } from '../src/lib/prospeccionFiltros.ts'

describe('bogotaDate', () => {
  it('un YYYY-MM-DD del picker no se corre de día al guardar/leer', () => {
    const iso = ymdATimestampBogota('2026-11-28')
    assert.equal(timestampAYmdBogota(iso), '2026-11-28')
    // Mediodía Bogotá = 17:00 UTC
    assert.equal(iso, '2026-11-28T17:00:00.000Z')
  })

  it('cerca de medianoche UTC: el día civil Bogotá manda', () => {
    // 2026-11-28 02:30 UTC = 2026-11-27 21:30 Bogotá
    const cercaMedianocheUtc = new Date('2026-11-28T02:30:00.000Z')
    assert.equal(ymdBogota(cercaMedianocheUtc), '2026-11-27')

    const inicio = inicioDiaBogota(cercaMedianocheUtc)
    const fin = finDiaBogota(cercaMedianocheUtc)
    assert.equal(inicio.toISOString(), '2026-11-27T05:00:00.000Z')
    assert.equal(fin.toISOString(), '2026-11-28T04:59:59.999Z')

    // Follow-up el 27 nov (mediodía Bogotá) → pendiente hoy y NO vencido
    const follow27 = ymdATimestampBogota('2026-11-27')
    assert.equal(esPendienteHoy(follow27, cercaMedianocheUtc), true)
    assert.equal(esVencido(follow27, cercaMedianocheUtc), false)

    // Follow-up el 26 nov → vencido y también ≤ fin de hoy
    const follow26 = ymdATimestampBogota('2026-11-26')
    assert.equal(esVencido(follow26, cercaMedianocheUtc), true)
    assert.equal(esPendienteHoy(follow26, cercaMedianocheUtc), true)

    // Follow-up el 28 nov (ya mañana en Bogotá) → ni pendiente hoy ni vencido
    const follow28 = ymdATimestampBogota('2026-11-28')
    assert.equal(esPendienteHoy(follow28, cercaMedianocheUtc), false)
    assert.equal(esVencido(follow28, cercaMedianocheUtc), false)
  })
})

describe('prospeccionAlta', () => {
  it('arma snapshot y normaliza email; vacío → null', () => {
    const conEmail = armarPayloadAltaRapida({
      nombre: '  Ana Pérez  ',
      cargo: 'CRO',
      empresa: 'Acme',
      pais: 'Colombia',
      contactoLibre: 'BID / Ágata',
      email: ' Ana@Acme.CO ',
    })
    assert.deepEqual(conEmail.speakerGlobal, {
      nombre: 'Ana Pérez',
      cargo: 'CRO',
      empresa: 'Acme',
      pais: 'Colombia',
      email: 'ana@acme.co',
    })
    assert.deepEqual(conEmail.datos_prospeccion, {
      nombre: 'Ana Pérez',
      cargo: 'CRO',
      empresa: 'Acme',
      pais: 'Colombia',
      contacto_raw: 'BID / Ágata',
    })

    const sinEmail = armarPayloadAltaRapida({
      nombre: 'Prospecto QA',
      email: '   ',
    })
    assert.equal(sinEmail.speakerGlobal.email, null)
    assert.equal(sinEmail.datos_prospeccion.contacto_raw, null)
  })

  it('rechaza nombre vacío', () => {
    assert.throws(
      () => armarPayloadAltaRapida({ nombre: '  ' }),
      /nombre es obligatorio/i,
    )
  })
})

describe('prospeccionFiltros', () => {
  const base = {
    email: 'a@b.co',
    estadoEnEvento: 'CONTACTADO' as const,
    proximo_seguimiento_at: ymdATimestampBogota('2026-11-27'),
    responsable_id: 'u1',
    responsable_texto: 'Liz',
  }
  const ancla = new Date('2026-11-28T02:30:00.000Z') // día civil 27 en Bogotá

  it('combina estado + pendientes hoy + responsable (AND)', () => {
    assert.equal(
      filaPasaProspeccion(base, {
        estados: ['CONTACTADO'],
        pendientesHoy: true,
        vencidos: false,
        sinEmail: false,
        responsableKey: 'Liz',
        ahora: ancla,
      }),
      true,
    )
    assert.equal(
      filaPasaProspeccion(base, {
        estados: ['CONFIRMADO'],
        pendientesHoy: true,
        vencidos: false,
        sinEmail: false,
        responsableKey: 'Liz',
        ahora: ancla,
      }),
      false,
    )
  })

  it('sin email y vencidos filtran bien', () => {
    assert.equal(
      filaPasaProspeccion(
        { ...base, email: null },
        {
          estados: [],
          pendientesHoy: false,
          vencidos: false,
          sinEmail: true,
          responsableKey: null,
          ahora: ancla,
        },
      ),
      true,
    )
    assert.equal(
      filaPasaProspeccion(
        { ...base, proximo_seguimiento_at: ymdATimestampBogota('2026-11-26') },
        {
          estados: [],
          pendientesHoy: false,
          vencidos: true,
          sinEmail: false,
          responsableKey: null,
          ahora: ancla,
        },
      ),
      true,
    )
  })
})
