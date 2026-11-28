import type { GestionTipo } from '@/lib/gestionTipos'
import { EMAIL_RE } from '@/lib/speakerEmail'
import type { AvisoImport, CanalSnapshot, GestionPlan } from './tipos'
import {
  avisoFechaSospechosa,
  parseBoolCelda,
  parseFechaYmd,
} from './normalize'

export type CanalInput = {
  tipo: GestionTipo
  checkboxRaw: unknown
  fechaRaw: unknown
}

export type CanalesResultado = {
  gestiones: GestionPlan[]
  canales: {
    correo: CanalSnapshot
    linkedin: CanalSnapshot
    referencia: CanalSnapshot
    institucion: CanalSnapshot
  }
  avisos: AvisoImport[]
}

const CANAL_KEYS = [
  'correo',
  'linkedin',
  'referencia',
  'institucion',
] as const

export function importClave(
  eventoId: string,
  speakerId: string,
  tipo: string,
  fechaYmd: string,
): string {
  return `${eventoId}:${speakerId}:${tipo}:${fechaYmd}`
}

/**
 * Reglas:
 * - checkbox true + fecha → gestión
 * - fecha sin checkbox → gestión + aviso
 * - checkbox sin fecha → no gestión + aviso (ocurrida_at obligatorio)
 * - email pegado en checkbox → marcado=false, aviso
 */
export function construirGestionesDeCanales(
  inputs: CanalInput[],
): CanalesResultado {
  const canales: CanalesResultado['canales'] = {
    correo: { marcado: false, fecha: null },
    linkedin: { marcado: false, fecha: null },
    referencia: { marcado: false, fecha: null },
    institucion: { marcado: false, fecha: null },
  }
  const gestiones: GestionPlan[] = []
  const avisos: AvisoImport[] = []

  for (const input of inputs) {
    if (!CANAL_KEYS.includes(input.tipo as (typeof CANAL_KEYS)[number])) {
      continue
    }
    const tipo = input.tipo as (typeof CANAL_KEYS)[number]
    const bool = parseBoolCelda(input.checkboxRaw)
    const fecha = parseFechaYmd(input.fechaRaw)

    // Email / texto raro en checkbox — no se usa como email salvo aprobación UI
    if (
      bool == null &&
      input.checkboxRaw != null &&
      String(input.checkboxRaw).trim() !== '' &&
      typeof input.checkboxRaw !== 'boolean'
    ) {
      const raw = String(input.checkboxRaw).trim()
      if (EMAIL_RE.test(raw.toLowerCase())) {
        avisos.push({
          codigo: 'email_detectado_en_otra_columna',
          mensaje: `Canal ${tipo}: email detectado en otra columna («${raw.slice(0, 40)}»); no se usa como email salvo que lo apruebes en esa fila`,
        })
      } else {
        avisos.push({
          codigo: 'canal_checkbox_raro',
          mensaje: `Canal ${tipo}: valor de checkbox no booleano («${raw.slice(0, 40)}»); se ignora el marcado`,
        })
      }
    }

    const marcado = bool === true
    canales[tipo] = { marcado, fecha }

    if (fecha) {
      const sospechosa = avisoFechaSospechosa(fecha)
      if (sospechosa) avisos.push(sospechosa)
      // fecha con o sin checkbox marcado → se crea la gestión
      if (!marcado) {
        avisos.push({
          codigo: 'fecha_sin_checkbox',
          mensaje: `Canal ${tipo}: hay fecha ${fecha} sin checkbox; se crea la gestión igual`,
        })
      }
      gestiones.push({ tipo, fecha })
    } else if (marcado && !fecha) {
      avisos.push({
        codigo: 'checkbox_sin_fecha',
        mensaje: `Canal ${tipo}: checkbox marcado sin fecha; no se crea gestión`,
      })
    }
  }

  return { gestiones, canales, avisos }
}
