import {
  timestampAYmdBogota,
  ymdATimestampBogota,
  ymdBogota,
} from '@/lib/bogotaDate'
import {
  isGestionTipo,
  type GestionTipo,
} from '@/lib/gestionTipos'
import type { EventoSpeakerEstado } from '@/lib/eventoSpeakerEstado'

export type RegistrarGestionInput = {
  tipo: string
  /** YYYY-MM-DD civil Bogotá. Vacío → hoy Bogotá. */
  ocurridaYmd?: string | null
  nota?: string | null
  proximaYmd?: string | null
  proximaNota?: string | null
  marcarContactado?: boolean
}

export type PayloadRegistrarGestion = {
  tipo: GestionTipo
  ocurrida_at: string
  nota: string | null
  proxima_at: string | null
  proxima_nota: string | null
  marcar_contactado: boolean
}

function trimOrNull(value: string | null | undefined): string | null {
  if (value == null) return null
  const t = value.trim()
  return t ? t : null
}

/** Solo desde estos dos estados el RPC puede pasar a CONTACTADO. */
export function puedeMarcarContactado(
  estado: EventoSpeakerEstado | null | undefined,
): boolean {
  return estado === 'PENDIENTE_CONTACTAR' || estado === 'SIN_CLASIFICAR'
}

/** Checkbox marcado por defecto cuando el estado lo permite. */
export function defaultMarcarContactado(
  estado: EventoSpeakerEstado | null | undefined,
): boolean {
  return puedeMarcarContactado(estado)
}

/**
 * Arma el payload del RPC. No escribe en BD.
 * Fechas civiles Bogotá → mediodía Bogotá (sin corrimiento UTC).
 */
export function armarPayloadRegistrarGestion(
  input: RegistrarGestionInput,
  ahora: Date = new Date(),
): PayloadRegistrarGestion {
  const tipoRaw = (input.tipo ?? '').trim()
  if (!isGestionTipo(tipoRaw)) {
    throw new Error('Tipo de gestión inválido')
  }

  const ocurridaYmd = trimOrNull(input.ocurridaYmd) ?? ymdBogota(ahora)
  const proximaYmd = trimOrNull(input.proximaYmd)

  return {
    tipo: tipoRaw,
    ocurrida_at: ymdATimestampBogota(ocurridaYmd),
    nota: trimOrNull(input.nota),
    proxima_at: proximaYmd ? ymdATimestampBogota(proximaYmd) : null,
    proxima_nota: proximaYmd ? trimOrNull(input.proximaNota) : null,
    marcar_contactado: input.marcarContactado === true,
  }
}

/** Helper UI: ISO → YMD Bogotá (o vacío). */
export function gestionAtAYmd(
  iso: string | null | undefined,
): string {
  return timestampAYmdBogota(iso) ?? ''
}
