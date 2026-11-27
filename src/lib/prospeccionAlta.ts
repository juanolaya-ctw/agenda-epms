import { normalizeSpeakerEmail } from '@/lib/speakerEmail'

export type AltaRapidaInput = {
  nombre: string
  cargo?: string
  empresa?: string
  pais?: string
  contactoLibre?: string
  email?: string
}

export type DatosProspeccion = {
  nombre: string
  empresa: string | null
  cargo: string | null
  pais: string | null
  contacto_raw: string | null
}

export type PayloadAltaRapida = {
  speakerGlobal: {
    nombre: string
    cargo: string | null
    empresa: string | null
    pais: string | null
    email: string | null
  }
  datos_prospeccion: DatosProspeccion
}

function trimOrNull(value: string | null | undefined): string | null {
  if (value == null) return null
  const t = value.trim()
  return t ? t : null
}

/**
 * Arma el payload de alta rápida. No escribe en BD.
 * Nombre obligatorio. Email vacío → null (no inventa correo).
 */
export function armarPayloadAltaRapida(
  input: AltaRapidaInput,
): PayloadAltaRapida {
  const nombre = input.nombre.trim()
  if (!nombre) throw new Error('El nombre es obligatorio')

  const cargo = trimOrNull(input.cargo)
  const empresa = trimOrNull(input.empresa)
  const pais = trimOrNull(input.pais)
  const contacto_raw = trimOrNull(input.contactoLibre)
  const email = normalizeSpeakerEmail(input.email)

  return {
    speakerGlobal: { nombre, cargo, empresa, pais, email },
    datos_prospeccion: {
      nombre,
      empresa,
      cargo,
      pais,
      contacto_raw,
    },
  }
}
