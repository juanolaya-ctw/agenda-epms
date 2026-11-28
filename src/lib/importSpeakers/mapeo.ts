import type { CampoDestino, MapeoColumnas } from './tipos'
import { normalizarTextoMatch, parseBoolCelda, pareceLinkedinUrl } from './normalize'

/** Sinónimos de encabezado → campo destino (canales se resuelven aparte). */
const SINONIMOS: Array<{ campo: CampoDestino; keys: string[] }> = [
  { campo: 'nombre', keys: ['nombre', 'name', 'speaker', 'nombre completo'] },
  {
    campo: 'empresa',
    keys: [
      'organizacion',
      'organización',
      'empresa',
      'entidad',
      'organization',
      'org',
      'compania',
      'compañia',
    ],
  },
  {
    campo: 'cargo',
    keys: ['cargo', 'position', 'titulo', 'título', 'role', 'puesto'],
  },
  { campo: 'pais', keys: ['pais', 'país', 'country'] },
  {
    campo: 'email',
    keys: ['email', 'correo electronico', 'correo electrónico', 'e-mail', 'mail'],
  },
  { campo: 'estado', keys: ['estado', 'status'] },
  {
    campo: 'pista_espacio',
    keys: ['ubicacion', 'ubicación', 'pista', 'espacio', 'pista espacio'],
  },
  {
    campo: 'responsable_texto',
    keys: ['contacto', 'responsable', 'owner', 'contacto responsable'],
  },
  {
    campo: 'requiere_viaticos',
    keys: [
      'requiere viaticos',
      'requiere viáticos',
      'viaticos',
      'viáticos',
      'requiere viaticos ',
    ],
  },
  {
    campo: 'proximo_seguimiento_nota',
    keys: [
      'next step pending',
      'next step',
      'pending',
      'proximo paso',
      'próximo paso',
      'next step/ pending',
      'next step / pending',
    ],
  },
  { campo: 'notas_internas', keys: ['notas', 'notes', 'notas internas'] },
  { campo: 'telefono', keys: ['telefono', 'teléfono', 'phone', 'celular'] },
  {
    campo: 'linkedin_url',
    keys: ['linkedin url', 'url linkedin', 'perfil linkedin'],
  },
  { campo: 'agenda', keys: ['agenda'] },
]

const CANAL_CHECKBOX: Array<{
  campo: CampoDestino
  fechaCampo: CampoDestino
  keys: string[]
}> = [
  {
    campo: 'canal_correo',
    fechaCampo: 'canal_correo_fecha',
    keys: ['correo directo', 'correo', 'email directo', 'mail directo'],
  },
  {
    campo: 'canal_linkedin',
    fechaCampo: 'canal_linkedin_fecha',
    keys: ['linkedin', 'linked in'],
  },
  {
    campo: 'canal_referencia',
    fechaCampo: 'canal_referencia_fecha',
    keys: [
      'refencia contacto cercano',
      'referencia contacto cercano',
      'referencia',
      'refencia',
      'contacto cercano',
    ],
  },
  {
    campo: 'canal_institucion',
    fechaCampo: 'canal_institucion_fecha',
    keys: [
      'institucion empresa',
      'institucion / empresa',
      'institución / empresa',
      'institucion',
      'institución',
    ],
  },
]

const FECHA_PUSH_KEYS = [
  'fecha last push',
  'fecha last push ',
  'last push',
  'fecha push',
  'fecha',
]

function headerNorm(h: string): string {
  return normalizarTextoMatch(h) ?? ''
}

function esFechaPush(norm: string): boolean {
  return FECHA_PUSH_KEYS.some((k) => headerNorm(k) === norm) || norm === 'fecha last push'
}

function matchExact(norm: string, keys: string[]): boolean {
  return keys.some((k) => headerNorm(k) === norm)
}

/**
 * Autodetecta mapeo por encabezados.
 * Pares canal↔fecha por posición: cada «Fecha last push» se asigna al
 * checkbox de canal inmediatamente a la izquierda.
 * LinkedIn: si la columna tiene bools → canal; si URLs → linkedin_url.
 */
export function autodetectarMapeo(
  headers: string[],
  sampleRows?: unknown[][],
): MapeoColumnas {
  const mapeo: MapeoColumnas = {}
  const usados = new Set<CampoDestino>()

  // 1) Canales + fechas por posición
  for (let i = 0; i < headers.length; i++) {
    const norm = headerNorm(headers[i] ?? '')
    if (!norm) {
      mapeo[i] = 'ignorar'
      continue
    }

    if (esFechaPush(norm)) {
      // Buscar canal a la izquierda
      let assigned = false
      for (let j = i - 1; j >= 0; j--) {
        const prev = mapeo[j]
        if (
          prev === 'canal_correo' ||
          prev === 'canal_linkedin' ||
          prev === 'canal_referencia' ||
          prev === 'canal_institucion'
        ) {
          const fechaCampo = (
            {
              canal_correo: 'canal_correo_fecha',
              canal_linkedin: 'canal_linkedin_fecha',
              canal_referencia: 'canal_referencia_fecha',
              canal_institucion: 'canal_institucion_fecha',
            } as const
          )[prev]
          if (!usados.has(fechaCampo)) {
            mapeo[i] = fechaCampo
            usados.add(fechaCampo)
            assigned = true
          }
          break
        }
        if (prev && prev !== 'ignorar') break
      }
      if (!assigned) mapeo[i] = 'ignorar'
      continue
    }

    let canalHit: (typeof CANAL_CHECKBOX)[number] | null = null
    for (const c of CANAL_CHECKBOX) {
      if (matchExact(norm, c.keys) && !usados.has(c.campo)) {
        canalHit = c
        break
      }
    }
    if (canalHit) {
      // LinkedIn especial: mirar muestras
      if (canalHit.campo === 'canal_linkedin' && sampleRows) {
        const vals = sampleRows
          .map((r) => r[i])
          .filter((v) => v != null && String(v).trim() !== '')
        const bools = vals.filter((v) => parseBoolCelda(v) != null).length
        const urls = vals.filter((v) => pareceLinkedinUrl(v)).length
        if (urls > bools && urls > 0 && !usados.has('linkedin_url')) {
          mapeo[i] = 'linkedin_url'
          usados.add('linkedin_url')
          continue
        }
      }
      mapeo[i] = canalHit.campo
      usados.add(canalHit.campo)
      continue
    }
  }

  // 2) Campos normales
  for (let i = 0; i < headers.length; i++) {
    if (mapeo[i]) continue
    const norm = headerNorm(headers[i] ?? '')
    if (!norm) {
      mapeo[i] = 'ignorar'
      continue
    }
    let hit: CampoDestino | null = null
    for (const s of SINONIMOS) {
      if (matchExact(norm, s.keys) && !usados.has(s.campo)) {
        hit = s.campo
        break
      }
    }
    // «requiere viaticos» con espacio trailing ya cubierto por normalizarTextoMatch
    if (!hit) {
      // fuzzy contains for next step
      if (
        (norm.includes('next step') || norm.includes('proximo paso')) &&
        !usados.has('proximo_seguimiento_nota')
      ) {
        hit = 'proximo_seguimiento_nota'
      } else if (
        norm.includes('requiere') &&
        norm.includes('viatic') &&
        !usados.has('requiere_viaticos')
      ) {
        hit = 'requiere_viaticos'
      }
    }
    if (hit) {
      mapeo[i] = hit
      usados.add(hit)
    } else {
      mapeo[i] = 'ignorar'
    }
  }

  return mapeo
}

/** Cuántos encabezados se reconocen (para elegir hoja). */
export function scoreMapeo(mapeo: MapeoColumnas): number {
  return Object.values(mapeo).filter((c) => c !== 'ignorar').length
}

export const CAMPOS_DESTINO_LABELS: Record<CampoDestino, string> = {
  nombre: 'Nombre',
  empresa: 'Empresa / Organización',
  cargo: 'Cargo',
  pais: 'País',
  email: 'Email',
  estado: 'Estado',
  pista_espacio: 'Pista / Espacio',
  responsable_texto: 'Responsable (texto)',
  requiere_viaticos: 'Requiere viáticos',
  proximo_seguimiento_nota: 'Next step / pending',
  notas_internas: 'Notas',
  telefono: 'Teléfono',
  linkedin_url: 'LinkedIn URL',
  agenda: 'Agenda (snapshot)',
  canal_correo: 'Canal: Correo',
  canal_correo_fecha: 'Fecha correo',
  canal_linkedin: 'Canal: LinkedIn',
  canal_linkedin_fecha: 'Fecha LinkedIn',
  canal_referencia: 'Canal: Referencia',
  canal_referencia_fecha: 'Fecha referencia',
  canal_institucion: 'Canal: Institución',
  canal_institucion_fecha: 'Fecha institución',
  ignorar: '(Ignorar)',
}

export const CAMPOS_DESTINO_OPTIONS: CampoDestino[] = [
  'ignorar',
  'nombre',
  'empresa',
  'cargo',
  'pais',
  'email',
  'estado',
  'pista_espacio',
  'responsable_texto',
  'requiere_viaticos',
  'proximo_seguimiento_nota',
  'notas_internas',
  'telefono',
  'linkedin_url',
  'agenda',
  'canal_correo',
  'canal_correo_fecha',
  'canal_linkedin',
  'canal_linkedin_fecha',
  'canal_referencia',
  'canal_referencia_fecha',
  'canal_institucion',
  'canal_institucion_fecha',
]
