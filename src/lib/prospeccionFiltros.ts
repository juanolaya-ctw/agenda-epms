import { esPendienteHoy, esVencido } from '@/lib/bogotaDate'
import type { EventoSpeakerEstado } from '@/lib/eventoSpeakerEstado'

export type FilaProspeccionFiltro = {
  email: string | null
  estadoEnEvento: EventoSpeakerEstado | null
  proximo_seguimiento_at: string | null
  responsable_id: string | null
  responsable_texto: string | null
}

export type CriteriosProspeccion = {
  /** Vacío = todos los estados. */
  estados: ReadonlySet<EventoSpeakerEstado> | readonly EventoSpeakerEstado[]
  pendientesHoy: boolean
  vencidos: boolean
  sinEmail: boolean
  /** null/'' = sin filtro de responsable. */
  responsableKey: string | null
  ahora?: Date
}

function setDeEstados(
  estados: CriteriosProspeccion['estados'],
): Set<EventoSpeakerEstado> {
  return estados instanceof Set ? estados : new Set(estados)
}

/** Label estable para filtrar/mostrar responsable. */
export function claveResponsable(fila: {
  responsable_id: string | null
  responsable_texto: string | null
}): string | null {
  const texto = fila.responsable_texto?.trim()
  if (texto) return texto
  if (fila.responsable_id) return fila.responsable_id
  return null
}

/**
 * AND de todos los criterios activos.
 * Pendientes hoy y vencidos pueden activarse juntos (vencidos ⊂ pendientes hoy
 * si ambos usan la misma ancla; el caller puede hacerlos exclusivos en UI).
 */
export function filaPasaProspeccion(
  fila: FilaProspeccionFiltro,
  criterios: CriteriosProspeccion,
): boolean {
  const ahora = criterios.ahora ?? new Date()
  const estados = setDeEstados(criterios.estados)

  if (estados.size > 0) {
    if (!fila.estadoEnEvento || !estados.has(fila.estadoEnEvento)) return false
  }
  if (criterios.pendientesHoy && !esPendienteHoy(fila.proximo_seguimiento_at, ahora)) {
    return false
  }
  if (criterios.vencidos && !esVencido(fila.proximo_seguimiento_at, ahora)) {
    return false
  }
  if (criterios.sinEmail) {
    const email = fila.email?.trim() ?? ''
    if (email) return false
  }
  const key = criterios.responsableKey?.trim() || null
  if (key) {
    if (claveResponsable(fila) !== key) return false
  }
  return true
}
