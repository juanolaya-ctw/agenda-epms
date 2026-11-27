/**
 * Fase 3 — historial / actividad (offline, sin BD ni red).
 * npm run test:fase3
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatCambioValores, formatValorActividad } from '../src/lib/actividadFormat'
import {
  labelCampoActividad,
  labelEstadoActividad,
  labelOrigenActividad,
} from '../src/lib/actividadLabels'
import {
  filtrarPorAmbitoEvento,
  mergeActividadTimeline,
  mensajeVacioActividad,
  nombreActorActividad,
  type GestionTimelineInput,
  type SpeakerCambio,
} from '../src/lib/actividadTimeline'
import {
  timestampAFechaHoraBogota,
  ymdATimestampBogota,
} from '../src/lib/bogotaDate'
import { ESTADO_LABELS } from '../src/lib/eventoSpeakerEstado'

function cambio(
  partial: Partial<SpeakerCambio> & Pick<SpeakerCambio, 'id' | 'campo'>,
): SpeakerCambio {
  return {
    speaker_id: 's1',
    evento_id: null,
    ambito: 'speaker',
    valor_anterior: null,
    valor_nuevo: null,
    origen: 'edicion_equipo',
    actor_id: null,
    tally_envio_id: null,
    created_at: '2026-11-27T20:00:00.000Z',
    ...partial,
  }
}

function gestion(
  partial: Partial<GestionTimelineInput> & Pick<GestionTimelineInput, 'id'>,
): GestionTimelineInput {
  return {
    evento_id: 'e1',
    tipo: 'correo',
    nota: null,
    ocurrida_at: ymdATimestampBogota('2026-11-27'),
    proxima_at: null,
    creado_por: null,
    created_at: '2026-11-27T19:00:00.000Z',
    ...partial,
  }
}

describe('actividad labels', () => {
  it('labels de campos y estados en español', () => {
    assert.equal(labelCampoActividad('cargo'), 'Cargo')
    assert.equal(
      labelCampoActividad('proximo_seguimiento_at'),
      'Próximo seguimiento',
    )
    assert.equal(labelCampoActividad('notas_internas'), 'Notas internas')
    assert.equal(labelCampoActividad('membresia'), 'Membresía')
    assert.equal(labelEstadoActividad('CONTACTADO'), ESTADO_LABELS.CONTACTADO)
    assert.equal(labelOrigenActividad('edicion_equipo'), 'Edición de equipo')
  })
})

describe('fecha/hora Bogotá', () => {
  it('incluye hora y no se corre de día cerca de medianoche UTC', () => {
    // 2026-11-28 02:30 UTC = 2026-11-27 21:30 Bogotá
    const s = timestampAFechaHoraBogota('2026-11-28T02:30:00.000Z')
    assert.ok(s)
    assert.match(s!, /27 nov 2026/)
    assert.match(s!, /21:30/)

    // 2026-11-28 04:15 UTC = 2026-11-27 23:15 Bogotá (aún 27)
    const s2 = timestampAFechaHoraBogota('2026-11-28T04:15:00.000Z')
    assert.ok(s2)
    assert.match(s2!, /27 nov 2026/)
    assert.match(s2!, /23:15/)
  })
})

describe('filtro este evento vs todos', () => {
  it('cargo global en ambos; estado de otro evento solo en todos', () => {
    const cambios = [
      cambio({
        id: 'c1',
        campo: 'cargo',
        evento_id: null,
        ambito: 'speaker',
        valor_nuevo: 'CEO',
      }),
      cambio({
        id: 'c2',
        campo: 'estado',
        evento_id: 'evento-b',
        ambito: 'evento_speakers',
        valor_nuevo: 'CONTACTADO',
      }),
      cambio({
        id: 'c3',
        campo: 'estado',
        evento_id: 'evento-a',
        ambito: 'evento_speakers',
        valor_nuevo: 'CONFIRMADO',
      }),
    ]
    const gestiones = [
      gestion({ id: 'g1', evento_id: 'evento-a' }),
      gestion({ id: 'g2', evento_id: 'evento-b' }),
    ]

    const este = filtrarPorAmbitoEvento(
      cambios,
      gestiones,
      'este_evento',
      'evento-a',
    )
    assert.equal(este.cambios.length, 2)
    assert.ok(este.cambios.some((c) => c.id === 'c1'))
    assert.ok(este.cambios.some((c) => c.id === 'c3'))
    assert.ok(!este.cambios.some((c) => c.id === 'c2'))
    assert.deepEqual(
      este.gestiones.map((g) => g.id),
      ['g1'],
    )

    const todos = filtrarPorAmbitoEvento(
      cambios,
      gestiones,
      'todos',
      'evento-a',
    )
    assert.equal(todos.cambios.length, 3)
    assert.equal(todos.gestiones.length, 2)
  })
})

describe('merge timeline', () => {
  it('ordena más reciente primero; empata por id', () => {
    const mismo = '2026-11-27T18:00:00.000Z'
    const items = mergeActividadTimeline(
      [
        cambio({
          id: 'c-old',
          campo: 'cargo',
          created_at: '2026-11-27T10:00:00.000Z',
        }),
        cambio({ id: 'c-tie-a', campo: 'empresa', created_at: mismo }),
      ],
      [
        gestion({ id: 'g-new', created_at: '2026-11-27T20:00:00.000Z' }),
        gestion({ id: 'g-tie-b', created_at: mismo }),
      ],
    )
    assert.equal(items[0]?.kind, 'gestion')
    assert.equal(items[0]?.id, 'gestion:g-new')
    // Empate: id DESC lexicográfico
    const tied = items.filter((i) => i.created_at === mismo)
    assert.equal(tied.length, 2)
    assert.ok(tied[0]!.id.localeCompare(tied[1]!.id) > 0)
    assert.equal(items[items.length - 1]?.id, 'cambio:c-old')
  })
})

describe('actor y vacío', () => {
  it('resuelve nombre; sistema / tally; nunca email', () => {
    const mapa = {
      u1: 'Alex Rivera',
      u2: 'secret@example.com', // si viniera email por error, igual se muestra el string del mapa;
      // el RPC nunca entrega email — el test garantiza que null no inventa uno.
    }
    assert.equal(
      nombreActorActividad('u1', 'edicion_equipo', mapa),
      'Alex Rivera',
    )
    assert.equal(nombreActorActividad('u-missing', 'edicion_equipo', mapa), 'Equipo')
    assert.equal(nombreActorActividad(null, 'sistema', mapa), 'Sistema')
    assert.equal(nombreActorActividad(null, 'tally', mapa), 'Tally')
    assert.equal(nombreActorActividad(undefined, 'edicion_equipo', {}), 'Sistema')
  })

  it('lista vacía → mensaje, no error', () => {
    assert.equal(mensajeVacioActividad([]), 'Sin actividad')
    assert.equal(
      mensajeVacioActividad(
        mergeActividadTimeline(
          [cambio({ id: 'c1', campo: 'cargo' })],
          [],
        ),
      ),
      null,
    )
  })
})

describe('format valores', () => {
  it('estado con label; bool; membresía; responsable por mapa', () => {
    assert.equal(
      formatValorActividad('CONTACTADO', 'estado'),
      ESTADO_LABELS.CONTACTADO,
    )
    assert.equal(formatValorActividad(true, 'requiere_viaticos'), 'Sí')
    assert.equal(
      formatValorActividad(
        { accion: 'asociado', estado: 'PENDIENTE_CONTACTAR' },
        'membresia',
      ),
      `Asociado · ${ESTADO_LABELS.PENDIENTE_CONTACTAR}`,
    )
    const fmt = formatCambioValores(
      'responsable_id',
      'u-old',
      'u-new',
      { 'u-new': 'Liz' },
    )
    assert.equal(fmt.nuevo, 'Liz')
    assert.equal(fmt.anterior, 'Equipo')
  })
})
