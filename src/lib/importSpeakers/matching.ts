import { normalizeSpeakerEmail } from '@/lib/speakerEmail'
import { normalizarTextoMatch } from './normalize'
import type {
  MatchCandidato,
  MatchResultado,
  SpeakerExistente,
} from './tipos'

function toCandidato(s: SpeakerExistente): MatchCandidato {
  return {
    id: s.id,
    nombre: s.nombre,
    empresa: s.empresa,
    cargo: s.cargo,
    email: s.email,
  }
}

/**
 * Matching contra speakers existentes.
 * - email igual → alta
 * - nombre_norm + empresa_norm, un candidato → alta (motivo nombre_empresa)
 * - nombre_norm, un candidato, distinta/sin empresa → media
 * - varios → ambigua
 * - ninguno → ninguna
 */
export function matchSpeaker(
  fila: {
    email: string | null
    nombreNorm: string | null
    empresaNorm: string | null
  },
  speakers: SpeakerExistente[],
): MatchResultado {
  if (fila.email) {
    const email = normalizeSpeakerEmail(fila.email)
    if (email) {
      const hits = speakers.filter(
        (s) => normalizeSpeakerEmail(s.email) === email,
      )
      if (hits.length === 1) {
        return {
          nivel: 'alta',
          motivo: 'email',
          candidatos: hits.map(toCandidato),
        }
      }
      if (hits.length > 1) {
        return {
          nivel: 'ambigua',
          motivo: 'multiple',
          candidatos: hits.map(toCandidato),
        }
      }
    }
  }

  if (!fila.nombreNorm) {
    return { nivel: 'ninguna', motivo: 'ninguno', candidatos: [] }
  }

  const porNombre = speakers.filter(
    (s) => normalizarTextoMatch(s.nombre) === fila.nombreNorm,
  )

  if (porNombre.length === 0) {
    return { nivel: 'ninguna', motivo: 'ninguno', candidatos: [] }
  }

  const porNombreEmpresa = porNombre.filter((s) => {
    const emp = normalizarTextoMatch(s.empresa)
    if (fila.empresaNorm == null && emp == null) return true
    return emp === fila.empresaNorm
  })

  if (porNombreEmpresa.length === 1) {
    return {
      nivel: 'alta',
      motivo: 'nombre_empresa',
      candidatos: porNombreEmpresa.map(toCandidato),
    }
  }

  if (porNombreEmpresa.length > 1) {
    return {
      nivel: 'ambigua',
      motivo: 'multiple',
      candidatos: porNombreEmpresa.map(toCandidato),
    }
  }

  // nombre match but empresa differs / missing on one side
  if (porNombre.length === 1) {
    return {
      nivel: 'media',
      motivo: 'nombre',
      candidatos: porNombre.map(toCandidato),
    }
  }

  return {
    nivel: 'ambigua',
    motivo: 'multiple',
    candidatos: porNombre.map(toCandidato),
  }
}

/** Índices de filas (en el array de normalizadas) que comparten nombre_norm. */
export function detectarHomonimosEnArchivo(
  filas: Array<{ nombreNorm: string | null }>,
): Set<number> {
  const groups = new Map<string, number[]>()
  filas.forEach((f, i) => {
    if (!f.nombreNorm) return
    const list = groups.get(f.nombreNorm) ?? []
    list.push(i)
    groups.set(f.nombreNorm, list)
  })
  const marked = new Set<number>()
  for (const idxs of groups.values()) {
    if (idxs.length > 1) {
      for (const i of idxs) marked.add(i)
    }
  }
  return marked
}

export function contarGruposHomonimos(
  filas: Array<{ nombreNorm: string | null }>,
): number {
  const groups = new Map<string, number>()
  for (const f of filas) {
    if (!f.nombreNorm) continue
    groups.set(f.nombreNorm, (groups.get(f.nombreNorm) ?? 0) + 1)
  }
  let n = 0
  for (const c of groups.values()) if (c > 1) n++
  return n
}
