/**
 * Fase 2 — gestiones (offline, sin BD ni red).
 * npm run test:fase2
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  armarPayloadRegistrarGestion,
  defaultMarcarContactado,
  estadoLocalTrasRegistrarGestion,
  puedeMarcarContactado,
} from '../src/lib/gestionForm'
import {
  filaSinGestiones,
  ultimaGestionPorSpeaker,
} from '../src/lib/gestionResumen'
import {
  timestampAYmdBogota,
  ymdATimestampBogota,
  ymdBogota,
} from '../src/lib/bogotaDate'

describe('gestionForm fechas Bogotá', () => {
  it('hoy / ayer / mañana del picker no se corren de día', () => {
    const hoy = ymdBogota(new Date('2026-11-27T18:00:00.000Z'))
    assert.equal(hoy, '2026-11-27')

    for (const ymd of ['2026-11-26', '2026-11-27', '2026-11-28'] as const) {
      const iso = ymdATimestampBogota(ymd)
      assert.equal(timestampAYmdBogota(iso), ymd)
    }

    const payload = armarPayloadRegistrarGestion(
      { tipo: 'correo', ocurridaYmd: '2026-11-28', nota: '  hola  ' },
      new Date('2026-11-27T23:30:00.000Z'),
    )
    assert.equal(payload.tipo, 'correo')
    assert.equal(timestampAYmdBogota(payload.ocurrida_at), '2026-11-28')
    assert.equal(payload.nota, 'hola')
    assert.equal(payload.proxima_at, null)
  })

  it('ocurrida vacía → hoy Bogotá; próxima opcional', () => {
    const ancla = new Date('2026-11-27T05:00:00.000Z') // medianoche Bogotá
    const payload = armarPayloadRegistrarGestion(
      {
        tipo: 'whatsapp',
        ocurridaYmd: '  ',
        proximaYmd: '2026-11-30',
        proximaNota: 'seguir',
        marcarContactado: true,
      },
      ancla,
    )
    assert.equal(timestampAYmdBogota(payload.ocurrida_at), '2026-11-27')
    assert.equal(timestampAYmdBogota(payload.proxima_at), '2026-11-30')
    assert.equal(payload.proxima_nota, 'seguir')
    assert.equal(payload.marcar_contactado, true)
  })

  it('rechaza tipo inválido', () => {
    assert.throws(
      () => armarPayloadRegistrarGestion({ tipo: 'fax' }),
      /Tipo de gestión inválido/,
    )
  })
})

describe('marcar contactado', () => {
  it('solo desde PENDIENTE_CONTACTAR o SIN_CLASIFICAR', () => {
    assert.equal(puedeMarcarContactado('PENDIENTE_CONTACTAR'), true)
    assert.equal(puedeMarcarContactado('SIN_CLASIFICAR'), true)
    assert.equal(defaultMarcarContactado('PENDIENTE_CONTACTAR'), true)
    assert.equal(puedeMarcarContactado('CONTACTADO'), false)
    assert.equal(puedeMarcarContactado('EN_CONVERSACION'), false)
    assert.equal(puedeMarcarContactado(null), false)
    assert.equal(defaultMarcarContactado('CONFIRMADO'), false)
  })
})

describe('ultima gestion y filtro sin gestiones', () => {
  it('elige la más reciente por speaker', () => {
    const map = ultimaGestionPorSpeaker([
      {
        speaker_id: 's1',
        tipo: 'correo',
        ocurrida_at: ymdATimestampBogota('2026-11-20'),
      },
      {
        speaker_id: 's1',
        tipo: 'llamada',
        ocurrida_at: ymdATimestampBogota('2026-11-27'),
      },
      {
        speaker_id: 's2',
        tipo: 'linkedin',
        ocurrida_at: ymdATimestampBogota('2026-11-25'),
      },
    ])
    assert.equal(map.get('s1')?.tipo, 'llamada')
    assert.equal(
      timestampAYmdBogota(map.get('s1')!.ocurrida_at),
      '2026-11-27',
    )
    assert.equal(map.get('s2')?.tipo, 'linkedin')
    assert.equal(filaSinGestiones('s1', map), false)
    assert.equal(filaSinGestiones('s3', map), true)
  })

  it('desempata por created_at cuando ocurrida_at coincide', () => {
    const mismoDia = ymdATimestampBogota('2026-11-27')
    const map = ultimaGestionPorSpeaker([
      {
        speaker_id: 's1',
        tipo: 'correo',
        ocurrida_at: mismoDia,
        created_at: '2026-11-27T15:00:00.000Z',
      },
      {
        speaker_id: 's1',
        tipo: 'llamada',
        ocurrida_at: mismoDia,
        created_at: '2026-11-27T16:00:00.000Z',
      },
      {
        speaker_id: 's1',
        tipo: 'whatsapp',
        ocurrida_at: mismoDia,
        created_at: '2026-11-27T15:30:00.000Z',
      },
    ])
    assert.equal(map.get('s1')?.tipo, 'llamada')
  })
})

describe('estadoLocalTrasRegistrarGestion', () => {
  it('actualiza seguimiento y CONTACTADO cuando aplica', () => {
    const next = estadoLocalTrasRegistrarGestion(
      {
        seguimientoYmd: '2026-11-20',
        seguimientoNota: 'vieja',
        estadoEnEvento: 'PENDIENTE_CONTACTAR',
      },
      {
        proximaYmd: '2026-12-01',
        proximaNota: 'llamar',
        marcoContactado: true,
      },
    )
    assert.equal(next.seguimientoYmd, '2026-12-01')
    assert.equal(next.seguimientoNota, 'llamar')
    assert.equal(next.estadoEnEvento, 'CONTACTADO')
  })

  it('no pisa seguimiento si no hubo próxima; no baja estados avanzados', () => {
    const next = estadoLocalTrasRegistrarGestion(
      {
        seguimientoYmd: '2026-11-20',
        seguimientoNota: 'mantener',
        estadoEnEvento: 'EN_CONVERSACION',
      },
      {
        proximaYmd: null,
        proximaNota: null,
        marcoContactado: true,
      },
    )
    assert.equal(next.seguimientoYmd, '2026-11-20')
    assert.equal(next.seguimientoNota, 'mantener')
    assert.equal(next.estadoEnEvento, 'EN_CONVERSACION')
  })
})
