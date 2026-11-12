/**
 * Bloque 1 — pruebas offline (sin BD ni red).
 * npx tsx --test scripts/crm-bloque1-unit.test.ts
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ESTADO_ALTA_NUEVA,
  ESTADO_LEGACY,
  buildEventoSpeakerEstadoPatch,
  isEventoSpeakerEstado,
} from '../src/lib/eventoSpeakerEstado'
import {
  isValidSpeakerEmail,
  normalizeSpeakerEmail,
} from '../src/lib/speakerEmail'

describe('bloque1 email', () => {
  it('vacío / espacios → NULL lógico', () => {
    assert.equal(normalizeSpeakerEmail(''), null)
    assert.equal(normalizeSpeakerEmail('  '), null)
  })
  it('normaliza y valida si hay valor', () => {
    assert.equal(normalizeSpeakerEmail(' A@B.Co '), 'a@b.co')
    assert.equal(isValidSpeakerEmail(null), true)
    assert.equal(isValidSpeakerEmail('a@b.co'), true)
    assert.equal(isValidSpeakerEmail('x'), false)
  })
})

describe('bloque1 estado', () => {
  it('legacy vs alta nueva', () => {
    assert.equal(ESTADO_LEGACY, 'SIN_CLASIFICAR')
    assert.equal(ESTADO_ALTA_NUEVA, 'PENDIENTE_CONTACTAR')
    assert.ok(isEventoSpeakerEstado('CONFIRMADO'))
  })

  it('patch conserva estado_motivo si no se pide', () => {
    const patch = buildEventoSpeakerEstadoPatch('CONTACTADO')
    assert.deepEqual(patch, { estado: 'CONTACTADO' })
    assert.equal('estado_motivo' in patch, false)

    const patchOptsVacios = buildEventoSpeakerEstadoPatch('CONTACTADO', {})
    assert.equal('estado_motivo' in patchOptsVacios, false)
  })

  it('patch borra o setea estado_motivo solo si es explícito', () => {
    assert.deepEqual(
      buildEventoSpeakerEstadoPatch('DESCARTADO', { estadoMotivo: null }),
      { estado: 'DESCARTADO', estado_motivo: null },
    )
    assert.deepEqual(
      buildEventoSpeakerEstadoPatch('DESCARTADO', {
        estadoMotivo: 'fuera de alcance',
      }),
      { estado: 'DESCARTADO', estado_motivo: 'fuera de alcance' },
    )
  })
})
