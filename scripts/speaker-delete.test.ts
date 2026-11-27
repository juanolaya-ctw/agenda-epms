/**
 * Deletes de membresía / limpieza — pruebas offline (sin BD ni red).
 * npm run test  (incluye este archivo)
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertDeleteOk,
  interpretMembershipDelete,
  membershipDeleteErrorMessage,
} from '../src/lib/speakerDelete'

describe('interpretMembershipDelete', () => {
  it('error de Supabase (p. ej. permission denied) → reason error', () => {
    const result = interpretMembershipDelete({
      error: { message: 'permission denied for table evento_speakers' },
      data: null,
    })
    assert.equal(result.ok, false)
    if (result.ok) throw new Error('expected failure')
    assert.equal(result.reason, 'error')
    assert.match(result.message, /permission denied/)
    assert.match(
      membershipDeleteErrorMessage(result),
      /permission denied for table evento_speakers/,
    )
  })

  it('0 filas borradas sin error → reason sin_filas', () => {
    const result = interpretMembershipDelete({
      error: null,
      data: [],
    })
    assert.equal(result.ok, false)
    if (result.ok) throw new Error('expected failure')
    assert.equal(result.reason, 'sin_filas')
    assert.match(membershipDeleteErrorMessage(result), /0 filas/)
  })

  it('data null sin error → también sin_filas', () => {
    const result = interpretMembershipDelete({
      error: null,
      data: null,
    })
    assert.equal(result.ok, false)
    if (result.ok) throw new Error('expected failure')
    assert.equal(result.reason, 'sin_filas')
  })

  it('≥1 fila → ok con deleted', () => {
    const result = interpretMembershipDelete({
      error: null,
      data: [{ speaker_id: 'a' }],
    })
    assert.deepEqual(result, { ok: true, deleted: 1 })
  })
})

describe('assertDeleteOk', () => {
  it('no lanza si error es null', () => {
    assert.doesNotThrow(() => assertDeleteOk('evento_speakers', null))
  })

  it('lanza con label + mensaje si hay error', () => {
    assert.throws(
      () =>
        assertDeleteOk('sesion_speakers', {
          message: 'permission denied for table sesion_speakers',
        }),
      /sesion_speakers: permission denied/,
    )
  })
})
