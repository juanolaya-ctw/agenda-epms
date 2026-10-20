import {
  estadoEsPublico,
  httpUrlOrNull,
  textOrNull,
  type EventoPublico,
  type RawSesion,
  type SpeakerPublico,
} from './public.ts'

function one(value: unknown): unknown {
  if (Array.isArray(value)) return value[0]
  return value
}

function horaOrdenable(inicio: string, fin: string): boolean {
  return inicio < fin
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function eventoFrom(value: unknown): EventoPublico | null {
  const row = record(value)
  if (!row) return null
  const id = textOrNull(row.id)
  const nombre = textOrNull(row.nombre)
  if (!id || !nombre) return null
  if (row.activo === false) return null
  return {
    id,
    nombre,
    fecha_inicio: textOrNull(row.fecha_inicio),
    fecha_fin: textOrNull(row.fecha_fin),
  }
}

function speakerFrom(value: unknown, rol: unknown): SpeakerPublico | null {
  const row = record(value)
  if (!row) return null
  const id = textOrNull(row.id)
  const nombre = textOrNull(row.nombre)
  if (!id || !nombre) return null
  return {
    id,
    nombre,
    rol: textOrNull(rol)?.toLowerCase() ?? 'panelista',
    cargo: textOrNull(row.cargo),
    empresa: textOrNull(row.empresa),
    foto_url: httpUrlOrNull(row.foto_url),
    bio: textOrNull(row.bio),
  }
}

/** Fila embebida de PostgREST (sesiones → slot → escenario → evento). */
export function rawFromEmbed(value: unknown): RawSesion | null {
  const row = record(value)
  if (!row || !estadoEsPublico(row.estado)) return null
  const id = textOrNull(row.id)
  const titulo = textOrNull(row.titulo)
  const slot = record(one(row.slot))
  const escenarioRow = record(one(slot?.escenario))
  const evento = eventoFrom(one(escenarioRow?.evento))
  const fecha = textOrNull(slot?.dia)
  const horaInicio = textOrNull(slot?.hora_inicio)
  const horaFin = textOrNull(slot?.hora_fin)
  const escenarioId = textOrNull(escenarioRow?.id)
  const escenarioNombre = textOrNull(escenarioRow?.nombre)
  if (
    !id ||
    !titulo ||
    !fecha ||
    !horaInicio ||
    !horaFin ||
    !horaOrdenable(horaInicio, horaFin) ||
    !escenarioId ||
    !escenarioNombre ||
    !evento
  ) {
    return null
  }
  const speakers = Array.isArray(row.sesion_speakers)
    ? row.sesion_speakers
        .map((rel) => {
          const link = record(rel)
          if (!link) return null
          return speakerFrom(one(link.speaker), link.rol)
        })
        .filter((speaker): speaker is SpeakerPublico => speaker !== null)
    : []
  return {
    id,
    titulo,
    descripcion: textOrNull(row.descripcion),
    formato: textOrNull(row.formato),
    track: textOrNull(row.track),
    idioma: textOrNull(row.idioma),
    fecha,
    horaInicio,
    horaFin,
    evento,
    escenario: {
      id: escenarioId,
      nombre: escenarioNombre,
      color: textOrNull(escenarioRow?.color),
    },
    speakers,
  }
}

/** Objeto devuelto por epms.agenda_publica (solo columnas públicas). */
export function rawFromRpc(value: unknown): RawSesion | null {
  const row = record(value)
  if (!row) return null
  const id = textOrNull(row.id)
  const titulo = textOrNull(row.titulo)
  const fecha = textOrNull(row.fecha)
  const horaInicio = textOrNull(row.hora_inicio)
  const horaFin = textOrNull(row.hora_fin)
  const evento = eventoFrom(row.evento)
  const escenarioRow = record(row.escenario)
  const escenarioId = textOrNull(escenarioRow?.id)
  const escenarioNombre = textOrNull(escenarioRow?.nombre)
  if (
    !id ||
    !titulo ||
    !fecha ||
    !horaInicio ||
    !horaFin ||
    !horaOrdenable(horaInicio, horaFin) ||
    !evento ||
    !escenarioId ||
    !escenarioNombre
  ) {
    return null
  }
  const speakers = Array.isArray(row.speakers)
    ? row.speakers
        .map((item) => {
          const speaker = record(item)
          if (!speaker) return null
          return speakerFrom(speaker, speaker.rol)
        })
        .filter((speaker): speaker is SpeakerPublico => speaker !== null)
    : []
  return {
    id,
    titulo,
    descripcion: textOrNull(row.descripcion),
    formato: textOrNull(row.formato),
    track: textOrNull(row.track),
    idioma: textOrNull(row.idioma),
    fecha,
    horaInicio,
    horaFin,
    evento,
    escenario: {
      id: escenarioId,
      nombre: escenarioNombre,
      color: textOrNull(escenarioRow?.color),
    },
    speakers,
  }
}
