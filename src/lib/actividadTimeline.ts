import type { ActividadOrigen } from '@/lib/actividadLabels'
import { isActividadOrigen } from '@/lib/actividadLabels'
import type { GestionTipo } from '@/lib/gestionTipos'

export type SpeakerCambio = {
  id: string
  speaker_id: string
  evento_id: string | null
  ambito: 'speaker' | 'evento_speakers' | 'merge'
  campo: string
  valor_anterior: unknown
  valor_nuevo: unknown
  origen: ActividadOrigen
  actor_id: string | null
  tally_envio_id: string | null
  created_at: string
}

export type GestionTimelineInput = {
  id: string
  evento_id: string
  tipo: GestionTipo
  nota: string | null
  ocurrida_at: string
  proxima_at: string | null
  creado_por: string | null
  created_at: string
  eventoNombre?: string | null
}

export type ActividadItemCambio = {
  kind: 'cambio'
  id: string
  created_at: string
  evento_id: string | null
  eventoNombre: string | null
  cambio: SpeakerCambio
}

export type ActividadItemGestion = {
  kind: 'gestion'
  id: string
  created_at: string
  evento_id: string | null
  eventoNombre: string | null
  gestion: GestionTimelineInput
}

export type ActividadItem = ActividadItemCambio | ActividadItemGestion

export type FiltroAmbitoActividad = 'este_evento' | 'todos'

/**
 * «Este evento»: cambios del evento actual + cambios de perfil (evento_id null).
 * Gestiones solo del evento actual.
 * «Todos»: sin filtrar por evento.
 */
export function filtrarPorAmbitoEvento(
  cambios: ReadonlyArray<SpeakerCambio>,
  gestiones: ReadonlyArray<GestionTimelineInput>,
  filtro: FiltroAmbitoActividad,
  eventoId: string | null,
): { cambios: SpeakerCambio[]; gestiones: GestionTimelineInput[] } {
  if (filtro === 'todos' || !eventoId) {
    return {
      cambios: [...cambios],
      gestiones: [...gestiones],
    }
  }
  return {
    cambios: cambios.filter(
      (c) => c.evento_id == null || c.evento_id === eventoId,
    ),
    gestiones: gestiones.filter((g) => g.evento_id === eventoId),
  }
}

export function filtrarCambiosPorOrigen(
  cambios: ReadonlyArray<SpeakerCambio>,
  origenes: ReadonlySet<string> | null,
): SpeakerCambio[] {
  if (!origenes || origenes.size === 0) return [...cambios]
  return cambios.filter((c) => origenes.has(c.origen))
}

/**
 * Mezcla cambios + gestiones, más reciente primero.
 * Empate: created_at igual → orden estable por id DESC.
 */
export function mergeActividadTimeline(
  cambios: ReadonlyArray<SpeakerCambio>,
  gestiones: ReadonlyArray<GestionTimelineInput>,
  nombresEvento: ReadonlyMap<string, string> = new Map(),
): ActividadItem[] {
  const items: ActividadItem[] = []
  for (const c of cambios) {
    items.push({
      kind: 'cambio',
      id: `cambio:${c.id}`,
      created_at: c.created_at,
      evento_id: c.evento_id,
      eventoNombre: c.evento_id
        ? (nombresEvento.get(c.evento_id) ?? null)
        : null,
      cambio: c,
    })
  }
  for (const g of gestiones) {
    items.push({
      kind: 'gestion',
      id: `gestion:${g.id}`,
      created_at: g.created_at,
      evento_id: g.evento_id,
      eventoNombre:
        g.eventoNombre ?? nombresEvento.get(g.evento_id) ?? null,
      gestion: g,
    })
  }
  items.sort((a, b) => {
    const ta = new Date(a.created_at).getTime()
    const tb = new Date(b.created_at).getTime()
    if (ta !== tb) return tb - ta
    return b.id.localeCompare(a.id)
  })
  return items
}

export function mensajeVacioActividad(
  items: ReadonlyArray<ActividadItem>,
): string | null {
  return items.length === 0 ? 'Sin actividad' : null
}

/**
 * Nombre del actor para la UI. Nunca email.
 * - mapa de usuarios Agenda
 * - actor_id null + origen tally → «Tally»
 * - actor_id null → «Sistema»
 * - actor_id sin nombre → «Equipo»
 */
export function nombreActorActividad(
  actorId: string | null | undefined,
  origen: string,
  nombres: Readonly<Record<string, string>>,
): string {
  if (actorId) {
    const n = nombres[actorId]?.trim()
    if (n) return n
    return 'Equipo'
  }
  if (origen === 'tally' || origen === 'Tally') return 'Tally'
  return 'Sistema'
}

export function parseOrigen(raw: string): ActividadOrigen {
  return isActividadOrigen(raw) ? raw : 'sistema'
}
