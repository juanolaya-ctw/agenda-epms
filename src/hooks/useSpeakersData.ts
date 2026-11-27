import { useCallback, useEffect, useState } from 'react'
import {
  ESTADO_ALTA_NUEVA,
  buildEventoSpeakerEstadoPatch,
  type ActualizarEstadoEventoSpeakerOpts,
  type EventoSpeakerEstado,
  isEventoSpeakerEstado,
} from '@/lib/eventoSpeakerEstado'
import { isUuid } from '@/lib/isUuid'
import { planAltaSpeaker } from '@/lib/altaSpeaker'
import {
  armarPayloadAltaRapida,
  type AltaRapidaInput,
  type DatosProspeccion,
} from '@/lib/prospeccionAlta'
import {
  isValidSpeakerEmail,
  normalizeSpeakerEmail,
} from '@/lib/speakerEmail'
import { supabase } from '@/lib/supabase'

export type Speaker = {
  id: string
  nombre: string
  cargo: string | null
  empresa: string | null
  pais: string | null
  ciudad: string | null
  email: string | null
  telefono: string | null
  linkedin_url: string | null
  tipo_documento: string | null
  numero_documento: string | null
  email_secundario: string | null
  foto_url: string | null
  bio: string | null
  fuente: string | null
  /** Slug del toolkit de la membresía de ESTE evento. Null en el pool global. */
  toolkit_slug: string | null
  sesionesEnEvento: number
  /** Pipeline de invitación en el evento del workspace (si aplica). */
  estadoEnEvento: EventoSpeakerEstado | null
  /** Prospección de ESTE evento. Null en el CRM global. */
  responsable_id: string | null
  responsable_texto: string | null
  proximo_seguimiento_at: string | null
  proximo_seguimiento_nota: string | null
  requiere_viaticos: boolean | null
  viaticos_nota: string | null
  pista_espacio: string | null
  notas_internas: string | null
  datos_prospeccion: DatosProspeccion | null
  /** Nombres de eventos (membresía), para búsqueda/filtros. */
  eventosParticipados: string[]
  /** Membresía evento_speakers con id para asociar desde CRM. */
  eventosAsociados: { id: string; nombre: string }[]
}

export type MembresiaProspeccionPatch = {
  responsable_id?: string | null
  responsable_texto?: string | null
  proximo_seguimiento_at?: string | null
  proximo_seguimiento_nota?: string | null
  requiere_viaticos?: boolean | null
  viaticos_nota?: string | null
  pista_espacio?: string | null
  notas_internas?: string | null
  datos_prospeccion?: DatosProspeccion | null
}

export type UsuarioAgenda = {
  id: string
  nombre: string
  email: string
}

export type SpeakerEditable = {
  nombre: string
  cargo: string
  empresa: string
  pais: string
  ciudad: string
  email: string
  telefono: string
  linkedin_url: string
  tipo_documento: string
  numero_documento: string
  email_secundario: string
  bio: string
}

export type SpeakersData = {
  speakers: Speaker[]
  propiedades: PropiedadCustom[]
  valoresPorSpeaker: Record<string, Record<string, unknown>>
  /** Dominio del toolkit de este evento. Null en el CRM y si no está configurado. */
  toolkitBaseUrl: string | null
  loading: boolean
  error: string | null
  refetch: () => void
  actualizarSpeaker: (
    id: string,
    datos: Partial<SpeakerEditable>,
  ) => Promise<void>
}

export type ParticipacionSesion = {
  sesionId: string
  titulo: string
  dia: string
  horaInicio: string
  horaFin: string
  escenario: string
  rol: string
}

export type PropiedadCustom = {
  id: string
  nombre: string
  tipo: string // 'checklist' | 'texto' | 'select' | 'fecha' | 'checkbox'
  opciones: string[]
  orden: number | null
}

export type ChecklistItem = { label: string; checked: boolean }

function pick<T>(value: T | null | undefined): T | null {
  return value ?? null
}

// Los embeds a-uno de PostgREST llegan como objeto, pero supabase-js a veces
// los tipa como array; normalizamos.
function one<T>(rel: T | T[] | null | undefined): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null
  return rel ?? null
}

type MembresiaExtras = {
  sesionesEnEvento: number
  eventosParticipados: string[]
  eventosAsociados?: { id: string; nombre: string }[]
  estadoEnEvento?: EventoSpeakerEstado | null
  toolkitSlug?: string | null
  responsable_id?: string | null
  responsable_texto?: string | null
  proximo_seguimiento_at?: string | null
  proximo_seguimiento_nota?: string | null
  requiere_viaticos?: boolean | null
  viaticos_nota?: string | null
  pista_espacio?: string | null
  notas_internas?: string | null
  datos_prospeccion?: DatosProspeccion | null
}

function mapSpeakerRow(
  r: Record<string, unknown>,
  extras: MembresiaExtras,
): Speaker {
  const eventosAsociados = extras.eventosAsociados ?? []
  return {
    id: r.id as string,
    nombre: (r.nombre as string | null) ?? '',
    cargo: pick(r.cargo as string | null),
    empresa: pick(r.empresa as string | null),
    pais: pick(r.pais as string | null),
    ciudad: pick(r.ciudad as string | null),
    email: pick(r.email as string | null),
    telefono: pick(r.telefono as string | null),
    linkedin_url: pick(r.linkedin_url as string | null),
    tipo_documento: pick(r.tipo_documento as string | null),
    numero_documento: pick(r.numero_documento as string | null),
    email_secundario: pick(r.email_secundario as string | null),
    foto_url: pick(r.foto_url as string | null),
    bio: pick(r.bio as string | null),
    fuente: pick(r.fuente as string | null),
    toolkit_slug: pick(extras.toolkitSlug),
    sesionesEnEvento: extras.sesionesEnEvento,
    estadoEnEvento: extras.estadoEnEvento ?? null,
    responsable_id: pick(extras.responsable_id),
    responsable_texto: pick(extras.responsable_texto),
    proximo_seguimiento_at: pick(extras.proximo_seguimiento_at),
    proximo_seguimiento_nota: pick(extras.proximo_seguimiento_nota),
    requiere_viaticos:
      extras.requiere_viaticos === undefined
        ? null
        : extras.requiere_viaticos,
    viaticos_nota: pick(extras.viaticos_nota),
    pista_espacio: pick(extras.pista_espacio),
    notas_internas: pick(extras.notas_internas),
    datos_prospeccion: extras.datos_prospeccion ?? null,
    eventosParticipados:
      extras.eventosParticipados.length > 0
        ? extras.eventosParticipados
        : eventosAsociados.map((e) => e.nombre),
    eventosAsociados,
  }
}

type EventoSpeakerEmbed = {
  evento_id?: string
  estado?: string
  toolkit_slug?: string | null
  responsable_id?: string | null
  responsable_texto?: string | null
  proximo_seguimiento_at?: string | null
  proximo_seguimiento_nota?: string | null
  requiere_viaticos?: boolean | null
  viaticos_nota?: string | null
  pista_espacio?: string | null
  notas_internas?: string | null
  datos_prospeccion?: DatosProspeccion | null
}

function membresiaExtrasFromEmbed(
  memb: EventoSpeakerEmbed | undefined,
): Pick<
  MembresiaExtras,
  | 'estadoEnEvento'
  | 'toolkitSlug'
  | 'responsable_id'
  | 'responsable_texto'
  | 'proximo_seguimiento_at'
  | 'proximo_seguimiento_nota'
  | 'requiere_viaticos'
  | 'viaticos_nota'
  | 'pista_espacio'
  | 'notas_internas'
  | 'datos_prospeccion'
> {
  const estadoRaw = memb?.estado
  const estadoEnEvento =
    typeof estadoRaw === 'string' && isEventoSpeakerEstado(estadoRaw)
      ? estadoRaw
      : null
  const toolkitSlug =
    typeof memb?.toolkit_slug === 'string' && memb.toolkit_slug.trim()
      ? memb.toolkit_slug
      : null
  return {
    estadoEnEvento,
    toolkitSlug,
    responsable_id: memb?.responsable_id ?? null,
    responsable_texto: memb?.responsable_texto ?? null,
    proximo_seguimiento_at: memb?.proximo_seguimiento_at ?? null,
    proximo_seguimiento_nota: memb?.proximo_seguimiento_nota ?? null,
    requiere_viaticos: memb?.requiere_viaticos ?? null,
    viaticos_nota: memb?.viaticos_nota ?? null,
    pista_espacio: memb?.pista_espacio ?? null,
    notas_internas: memb?.notas_internas ?? null,
    datos_prospeccion: memb?.datos_prospeccion ?? null,
  }
}

function normalizeEditableEmail(
  datos: Partial<SpeakerEditable>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...datos }
  if (!('email' in datos)) return payload
  const normalized = normalizeSpeakerEmail(datos.email)
  if (!isValidSpeakerEmail(normalized)) {
    throw new Error('Email inválido')
  }
  payload.email = normalized
  return payload
}

type LoadResult = {
  speakers: Speaker[]
  propiedades: PropiedadCustom[]
  valoresPorSpeaker: Record<string, Record<string, unknown>>
  toolkitBaseUrl: string | null
  error: string | null
}

// #6 (propiedades) → #7 (valores) siguen encadenadas entre sí (valores
// necesita los ids de propiedades), pero ya no dependen de la query de
// speakers, así que corren en paralelo con ella (Promise.all).
async function loadPropiedadesYValores(eventoId: string): Promise<{
  propiedades: PropiedadCustom[]
  valoresPorSpeaker: Record<string, Record<string, unknown>>
  error: string | null
}> {
  const props = await propiedadesSpeaker(eventoId)
  if (props.error) {
    return { propiedades: [], valoresPorSpeaker: {}, error: props.error }
  }

  const valoresPorSpeaker: Record<string, Record<string, unknown>> = {}
  if (props.data.length > 0) {
    const vpRes = await supabase
      .from('valores_propiedades')
      .select('speaker_id, propiedad_id, valor')
      .in(
        'propiedad_id',
        props.data.map((p) => p.id),
      )
    if (!vpRes.error) {
      for (const r of vpRes.data ?? []) {
        const sid = r.speaker_id as string | null
        if (!sid) continue
        if (!valoresPorSpeaker[sid]) valoresPorSpeaker[sid] = {}
        valoresPorSpeaker[sid][r.propiedad_id as string] = r.valor
      }
    }
  }

  return { propiedades: props.data, valoresPorSpeaker, error: null }
}

type EscenarioEventoIdEmbed = { evento_id: string }
type SlotEscEmbed = {
  escenario: EscenarioEventoIdEmbed | EscenarioEventoIdEmbed[] | null
}
type SesionSlotEmbed = { slot: SlotEscEmbed | SlotEscEmbed[] | null }
type SesionSpeakerTablaRel = {
  sesion: SesionSlotEmbed | SesionSlotEmbed[] | null
}
type SpeakerTablaRow = Record<string, unknown> & {
  id: string
  sesion_speakers?: SesionSpeakerTablaRel[] | null
}

// Columnas de la ficha global. El toolkit y las piezas NO están aquí:
// viven en evento_speakers y se leen solo para el evento del workspace.
const SPEAKER_COLS =
  'id, foto_url, nombre, cargo, empresa, pais, email, fuente, ' +
  'telefono, linkedin_url, ciudad, tipo_documento, numero_documento, email_secundario'

// Speakers asociados a ESTE evento (membresía evento_speakers).
// sesion_speakers sin !inner: cuentan sesiones pero no excluyen a nadie.
// El directorio global sigue en loadSpeakersGlobal / CRM.
const EVENTO_SPEAKERS_EMBED_COLS =
  'evento_id, estado, toolkit_slug, ' +
  'responsable_id, responsable_texto, proximo_seguimiento_at, proximo_seguimiento_nota, ' +
  'requiere_viaticos, viaticos_nota, pista_espacio, notas_internas, datos_prospeccion'

const SPEAKERS_TABLA_SELECT = `
  ${SPEAKER_COLS},
  evento_speakers!inner ( ${EVENTO_SPEAKERS_EMBED_COLS} ),
  sesion_speakers (
    sesion:sesiones (
      slot:slots (
        escenario:escenarios ( evento_id )
      )
    )
  )
`

async function loadSpeakers(eventoId: string): Promise<LoadResult> {
  if (!isUuid(eventoId)) {
    return {
      speakers: [],
      propiedades: [],
      valoresPorSpeaker: {},
      toolkitBaseUrl: null,
      error: 'El workspace no tiene un id de evento válido (UUID).',
    }
  }

  const [spRes, pv, baseRes] = await Promise.all([
    supabase
      .from('speakers')
      .select(SPEAKERS_TABLA_SELECT)
      .eq('evento_speakers.evento_id', eventoId)
      .order('nombre'),
    loadPropiedadesYValores(eventoId),
    supabase
      .from('eventos')
      .select('toolkit_base_url')
      .eq('id', eventoId)
      .maybeSingle(),
  ])

  const toolkitBaseUrl =
    (baseRes.data?.toolkit_base_url as string | null | undefined) ?? null

  if (spRes.error) {
    return {
      speakers: [],
      propiedades: pv.propiedades,
      valoresPorSpeaker: pv.valoresPorSpeaker,
      toolkitBaseUrl,
      error: spRes.error.message,
    }
  }

  const speakers: Speaker[] = ((spRes.data ?? []) as SpeakerTablaRow[]).map(
    (r) => {
      const rels = Array.isArray(r.sesion_speakers) ? r.sesion_speakers : []
      let sesionesEnEvento = 0
      for (const rel of rels) {
        const sesion = one(rel.sesion)
        const slot = one(sesion?.slot)
        const escenario = one(slot?.escenario)
        if (escenario?.evento_id === eventoId) sesionesEnEvento += 1
      }
      const membRaw = (r as { evento_speakers?: unknown }).evento_speakers
      const membList = Array.isArray(membRaw)
        ? membRaw
        : membRaw
          ? [membRaw]
          : []
      const memb = membList.find(
        (m) =>
          m &&
          typeof m === 'object' &&
          (m as { evento_id?: string }).evento_id === eventoId,
      ) as EventoSpeakerEmbed | undefined
      return mapSpeakerRow(r as unknown as Record<string, unknown>, {
        sesionesEnEvento,
        eventosParticipados: [],
        ...membresiaExtrasFromEmbed(memb),
      })
    },
  )

  return {
    speakers,
    propiedades: pv.propiedades,
    valoresPorSpeaker: pv.valoresPorSpeaker,
    toolkitBaseUrl,
    error: pv.error ?? baseRes.error?.message ?? null,
  }
}

type EventoIdNombreEmbed = { id: string; nombre: string | null }
type EventoSpeakerRel = {
  evento: EventoIdNombreEmbed | EventoIdNombreEmbed[] | null
}
type EscenarioEventoEmbed = {
  evento: { nombre: string | null } | { nombre: string | null }[] | null
}
type SlotEventoEmbed = {
  escenario: EscenarioEventoEmbed | EscenarioEventoEmbed[] | null
}
type SesionEventoEmbed = { slot: SlotEventoEmbed | SlotEventoEmbed[] | null }
type SesionSpeakerEventoRel = {
  sesion: SesionEventoEmbed | SesionEventoEmbed[] | null
}
type SpeakerGlobalRow = Record<string, unknown> & {
  id: string
  evento_speakers?: EventoSpeakerRel[] | null
  sesion_speakers?: SesionSpeakerEventoRel[] | null
}

const SPEAKERS_GLOBAL_SELECT = `
  ${SPEAKER_COLS},
  evento_speakers (
    evento:eventos ( id, nombre )
  ),
  sesion_speakers (
    sesion:sesiones (
      slot:slots (
        escenario:escenarios (
          evento:eventos ( nombre )
        )
      )
    )
  )
`

// Speakers globales + membresía (evento_speakers) + conteo de sesiones.
async function loadSpeakersGlobal(): Promise<LoadResult> {
  const empty = {
    propiedades: [] as PropiedadCustom[],
    valoresPorSpeaker: {},
    toolkitBaseUrl: null as string | null,
  }
  const { data, error } = await supabase
    .from('speakers')
    .select(SPEAKERS_GLOBAL_SELECT)
    .order('nombre')

  if (error) return { speakers: [], ...empty, error: error.message }

  const speakers: Speaker[] = ((data ?? []) as SpeakerGlobalRow[]).map((r) => {
    const memb = Array.isArray(r.evento_speakers) ? r.evento_speakers : []
    const byId = new Map<string, string>()
    for (const rel of memb) {
      const evento = one(rel.evento)
      if (evento?.id) byId.set(evento.id, evento.nombre ?? '')
    }
    // Fallback: eventos solo vía sesión (datos previos al backfill).
    const rels = Array.isArray(r.sesion_speakers) ? r.sesion_speakers : []
    for (const rel of rels) {
      const sesion = one(rel.sesion)
      const slot = one(sesion?.slot)
      const escenario = one(slot?.escenario)
      const evento = one(escenario?.evento)
      const nombre = evento?.nombre
      if (nombre && ![...byId.values()].includes(nombre)) {
        byId.set(`nombre:${nombre}`, nombre)
      }
    }
    const eventosAsociados = [...byId.entries()]
      .filter(([id]) => isUuid(id))
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
    const nombres = [
      ...new Set([
        ...eventosAsociados.map((e) => e.nombre),
        ...[...byId.values()].filter(Boolean),
      ]),
    ].sort()

    return mapSpeakerRow(r as unknown as Record<string, unknown>, {
      sesionesEnEvento: rels.length,
      eventosParticipados: nombres,
      eventosAsociados,
    })
  })

  return { speakers, ...empty, error: null }
}

export async function actualizarSpeaker(
  id: string,
  datos: Partial<SpeakerEditable>,
): Promise<void> {
  const payload = normalizeEditableEmail(datos)
  const { error } = await supabase.from('speakers').update(payload).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function crearSpeaker(
  datos: Partial<SpeakerEditable>,
): Promise<string> {
  const payload = normalizeEditableEmail(datos)
  const { data, error } = await supabase
    .from('speakers')
    .insert({ ...payload, fuente: 'admin_manual' })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function speakerPorEmail(
  email: string,
): Promise<Speaker | null> {
  const normalized = normalizeSpeakerEmail(email)
  if (!normalized || !isValidSpeakerEmail(normalized)) return null
  // El match lo hace la base: lower(btrim(email)), el mismo índice único.
  const { data: id, error } = await supabase.rpc('buscar_speaker_por_email', {
    p_email: email,
  })
  if (error) throw new Error(error.message)
  if (typeof id !== 'string' || !id) return null
  const row = await supabase
    .from('speakers')
    .select(SPEAKER_COLS)
    .eq('id', id)
    .maybeSingle()
  if (row.error) throw new Error(row.error.message)
  if (!row.data) return null
  return mapSpeakerRow(row.data as unknown as Record<string, unknown>, {
    sesionesEnEvento: 0,
    eventosParticipados: [],
  })
}

/** Asocia un speaker del pool global a un evento. Idempotente. */
export async function asociarSpeakerAEvento(
  eventoId: string,
  speakerId: string,
  estado: EventoSpeakerEstado = ESTADO_ALTA_NUEVA,
): Promise<{ created: boolean }> {
  if (!isUuid(eventoId) || !isUuid(speakerId)) {
    throw new Error('eventoId y speakerId deben ser UUID')
  }
  const { data: existing, error: existError } = await supabase
    .from('evento_speakers')
    .select('speaker_id')
    .eq('evento_id', eventoId)
    .eq('speaker_id', speakerId)
    .maybeSingle()
  if (existError) throw new Error(existError.message)
  if (existing) return { created: false }

  const { error } = await supabase.from('evento_speakers').insert({
    evento_id: eventoId,
    speaker_id: speakerId,
    estado,
  })
  if (error) throw new Error(error.message)
  return { created: true }
}

/**
 * Actualiza SOLO campos de prospección de la membresía.
 * No toca estado ni estado_motivo (eso va por actualizarEstadoEventoSpeaker).
 */
export async function actualizarMembresiaEventoSpeaker(
  eventoId: string,
  speakerId: string,
  patch: MembresiaProspeccionPatch,
): Promise<void> {
  if (!isUuid(eventoId) || !isUuid(speakerId)) {
    throw new Error('eventoId y speakerId deben ser UUID')
  }
  const payload: Record<string, unknown> = {
    ...patch,
    updated_at: new Date().toISOString(),
  }
  delete payload.estado
  delete payload.estado_motivo
  const { data, error } = await supabase
    .from('evento_speakers')
    .update(payload)
    .eq('evento_id', eventoId)
    .eq('speaker_id', speakerId)
    .select('speaker_id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    throw new Error('Sin membresía en este evento')
  }
}

export async function listarUsuariosAgenda(): Promise<UsuarioAgenda[]> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, email')
    .eq('area', 'Agenda')
    .order('nombre')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    id: row.id as string,
    nombre: (row.nombre as string | null) ?? '',
    email: (row.email as string | null) ?? '',
  }))
}

export type AltaRapidaResultado =
  | { created: true; speakerId: string }
  | { associated: true; speakerId: string; createdMembership: boolean }

/** Alta rápida: persona global + membresía PENDIENTE_CONTACTAR + snapshot. */
export async function altaRapidaProspecto(
  eventoId: string,
  input: AltaRapidaInput,
): Promise<AltaRapidaResultado> {
  if (!isUuid(eventoId)) throw new Error('eventoId debe ser UUID')
  const payload = armarPayloadAltaRapida(input)
  const email = payload.speakerGlobal.email

  if (email) {
    const existente = await speakerPorEmail(email)
    const plan = planAltaSpeaker({
      existenteId: existente?.id ?? null,
      asociarAlEvento: true,
    })
    if (existente && plan.tipo === 'asociar_existente') {
      const { created } = await asociarSpeakerAEvento(eventoId, existente.id)
      await actualizarMembresiaEventoSpeaker(eventoId, existente.id, {
        datos_prospeccion: payload.datos_prospeccion,
      })
      return {
        associated: true,
        speakerId: existente.id,
        createdMembership: created,
      }
    }
  }

  let speakerId: string
  try {
    speakerId = await crearSpeaker({
      nombre: payload.speakerGlobal.nombre,
      cargo: payload.speakerGlobal.cargo ?? '',
      empresa: payload.speakerGlobal.empresa ?? '',
      pais: payload.speakerGlobal.pais ?? '',
      email: payload.speakerGlobal.email ?? '',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!email || !/duplicate|unique|already exists|speakers_email/i.test(msg)) {
      throw err
    }
    const existente = await speakerPorEmail(email)
    if (!existente) throw err
    const { created } = await asociarSpeakerAEvento(eventoId, existente.id)
    await actualizarMembresiaEventoSpeaker(eventoId, existente.id, {
      datos_prospeccion: payload.datos_prospeccion,
    })
    return {
      associated: true,
      speakerId: existente.id,
      createdMembership: created,
    }
  }

  await asociarSpeakerAEvento(eventoId, speakerId)
  await actualizarMembresiaEventoSpeaker(eventoId, speakerId, {
    datos_prospeccion: payload.datos_prospeccion,
  })
  return { created: true, speakerId }
}

export type ActualizarEstadoResultado =
  | { ok: true }
  | { ok: false; reason: 'sin_membresia' }

export async function actualizarEstadoEventoSpeaker(
  eventoId: string,
  speakerId: string,
  estado: EventoSpeakerEstado,
  opts?: ActualizarEstadoEventoSpeakerOpts,
): Promise<ActualizarEstadoResultado> {
  if (!isUuid(eventoId) || !isUuid(speakerId)) {
    throw new Error('eventoId y speakerId deben ser UUID')
  }
  const patch = {
    ...buildEventoSpeakerEstadoPatch(estado, opts),
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('evento_speakers')
    .update(patch)
    .eq('evento_id', eventoId)
    .eq('speaker_id', speakerId)
    .select('speaker_id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    return { ok: false, reason: 'sin_membresia' }
  }
  return { ok: true }
}

export type DesasociarResultado =
  | { ok: true }
  | { ok: false; reason: 'tiene_sesiones'; sesiones: number }

/**
 * Quita la membresía. Conserva valores_propiedades e interacciones.
 * Bloquea si hay sesiones asignadas en el evento (no las borra).
 */
export async function desasociarSpeakerDeEvento(
  eventoId: string,
  speakerId: string,
): Promise<DesasociarResultado> {
  if (!isUuid(eventoId) || !isUuid(speakerId)) {
    throw new Error('eventoId y speakerId deben ser UUID')
  }

  const sesiones = await contarSesionesEnEvento(eventoId, speakerId)
  if (sesiones > 0) {
    return { ok: false, reason: 'tiene_sesiones', sesiones }
  }

  const { error } = await supabase
    .from('evento_speakers')
    .delete()
    .eq('evento_id', eventoId)
    .eq('speaker_id', speakerId)
  if (error) throw new Error(error.message)
  return { ok: true }
}

async function contarSesionesEnEvento(
  eventoId: string,
  speakerId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('sesion_speakers')
    .select(
      `
      id,
      sesion:sesiones!inner (
        slot:slots!inner (
          escenario:escenarios!inner ( evento_id )
        )
      )
    `,
    )
    .eq('speaker_id', speakerId)
    .eq('sesion.slot.escenario.evento_id', eventoId)

  if (error) throw new Error(error.message)
  return (data ?? []).length
}

/**
 * Soft-scope: quita al speaker solo de este evento.
 * Borra sesion_speakers del evento, valores_propiedades de props del evento
 * y la membresía evento_speakers. No toca el perfil global ni otros eventos.
 */
export async function quitarSpeakerDeEvento(
  eventoId: string,
  speakerId: string,
): Promise<void> {
  if (!isUuid(eventoId) || !isUuid(speakerId)) {
    throw new Error('eventoId y speakerId deben ser UUID')
  }

  const { data: ssRows, error: ssErr } = await supabase
    .from('sesion_speakers')
    .select(
      `
      id,
      sesion:sesiones!inner (
        slot:slots!inner (
          escenario:escenarios!inner ( evento_id )
        )
      )
    `,
    )
    .eq('speaker_id', speakerId)
    .eq('sesion.slot.escenario.evento_id', eventoId)

  if (ssErr) throw new Error(ssErr.message)

  const ssIds = (ssRows ?? []).map((row) => row.id as string)
  if (ssIds.length > 0) {
    const { error } = await supabase
      .from('sesion_speakers')
      .delete()
      .in('id', ssIds)
    if (error) throw new Error(error.message)
  }

  const { data: props, error: propsErr } = await supabase
    .from('propiedades_custom')
    .select('id')
    .eq('evento_id', eventoId)
  if (propsErr) throw new Error(propsErr.message)

  const propIds = (props ?? []).map((row) => row.id as string)
  if (propIds.length > 0) {
    const { error } = await supabase
      .from('valores_propiedades')
      .delete()
      .eq('speaker_id', speakerId)
      .in('propiedad_id', propIds)
    if (error) throw new Error(error.message)
  }

  const { error: membErr } = await supabase
    .from('evento_speakers')
    .delete()
    .eq('evento_id', eventoId)
    .eq('speaker_id', speakerId)
  if (membErr) throw new Error(membErr.message)
}

export type SpeakerBusqueda = Speaker & {
  yaAsociadoAlEvento: boolean
  alertaSimilarNombre?: boolean
}

/** Búsqueda en pool global por nombre, email o empresa. */
export async function buscarSpeakersGlobales(
  query: string,
  opts?: { eventoId?: string; limit?: number },
): Promise<SpeakerBusqueda[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const safe = q.replace(/[%_,]/g, ' ').trim()
  if (safe.length < 2) return []
  const pattern = `%${safe}%`
  const limit = opts?.limit ?? 20
  const { data, error } = await supabase
    .from('speakers')
    .select(SPEAKER_COLS)
    .or(
      `nombre.ilike."${pattern}",email.ilike."${pattern}",empresa.ilike."${pattern}"`,
    )
    .order('nombre')
    .limit(limit)

  if (error) throw new Error(error.message)

  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map(
    (row) =>
      mapSpeakerRow(row, {
        sesionesEnEvento: 0,
        eventosParticipados: [],
      }),
  )

  let asociados = new Set<string>()
  if (opts?.eventoId && isUuid(opts.eventoId) && rows.length > 0) {
    const { data: memb } = await supabase
      .from('evento_speakers')
      .select('speaker_id')
      .eq('evento_id', opts.eventoId)
      .in(
        'speaker_id',
        rows.map((r) => r.id),
      )
    asociados = new Set((memb ?? []).map((m) => m.speaker_id as string))
  }

  const qLower = safe.toLowerCase()
  return rows.map((sp) => {
    const nombreHit = sp.nombre.toLowerCase().includes(qLower)
    const orgHit = (sp.empresa ?? '').toLowerCase().includes(qLower)
    const emailExact =
      sp.email != null && sp.email.toLowerCase() === qLower
    return {
      ...sp,
      yaAsociadoAlEvento: asociados.has(sp.id),
      alertaSimilarNombre: !emailExact && (nombreHit || orgHit),
    }
  })
}

export async function eliminarSpeaker(id: string): Promise<void> {
  // Limpieza explícita de referencias antes del DELETE, por si alguna FK no
  // tiene ON DELETE CASCADE en la BD real.
  await supabase.from('evento_speakers').delete().eq('speaker_id', id)
  await supabase.from('sesion_speakers').delete().eq('speaker_id', id)
  await supabase.from('valores_propiedades').delete().eq('speaker_id', id)
  const { error } = await supabase.from('speakers').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

type EscenarioNombreEmbed = { nombre: string | null; evento_id: string }
type SlotPartEmbed = {
  dia: string | null
  hora_inicio: string | null
  hora_fin: string | null
  escenario: EscenarioNombreEmbed | EscenarioNombreEmbed[] | null
}
type SesionPartEmbed = {
  id: string
  titulo: string | null
  slot: SlotPartEmbed | SlotPartEmbed[] | null
}
type SesionSpeakerPartRow = {
  rol: string | null
  sesion: SesionPartEmbed | SesionPartEmbed[] | null
}

const SESIONES_DE_SPEAKER_SELECT = `
  rol,
  sesion:sesiones!inner (
    id, titulo,
    slot:slots!inner (
      dia, hora_inicio, hora_fin,
      escenario:escenarios!inner ( nombre, evento_id )
    )
  )
`

// Una sola query embebida filtrada por evento en el servidor, en vez de la
// cascada sesion_speakers → sesiones → slots → escenarios.
export async function sesionesDeSpeaker(
  speakerId: string,
  eventoId: string,
): Promise<{ data: ParticipacionSesion[]; error: string | null }> {
  const { data, error } = await supabase
    .from('sesion_speakers')
    .select(SESIONES_DE_SPEAKER_SELECT)
    .eq('speaker_id', speakerId)
    .eq('sesion.slot.escenario.evento_id', eventoId)

  if (error) return { data: [], error: error.message }

  const parts: ParticipacionSesion[] = ((data ?? []) as SesionSpeakerPartRow[])
    .map((row) => {
      const sesion = one(row.sesion)
      const slot = one(sesion?.slot)
      const escenario = one(slot?.escenario)
      return {
        sesionId: sesion?.id ?? '',
        titulo: sesion?.titulo ?? '',
        dia: slot?.dia ?? '',
        horaInicio: (slot?.hora_inicio ?? '').slice(0, 5),
        horaFin: (slot?.hora_fin ?? '').slice(0, 5),
        escenario: escenario?.nombre ?? '',
        rol: row.rol ?? '',
      }
    })
  return { data: parts, error: null }
}

export async function propiedadesSpeaker(
  eventoId: string,
): Promise<{ data: PropiedadCustom[]; error: string | null }> {
  const res = await supabase
    .from('propiedades_custom')
    .select('*')
    .eq('entidad', 'speaker')
    .eq('evento_id', eventoId)
    .order('orden')
  if (res.error) return { data: [], error: res.error.message }
  return {
    data: (res.data ?? []).map((r) => ({
      id: r.id as string,
      nombre: (r.nombre as string | null) ?? '',
      tipo: (r.tipo as string | null) ?? 'texto',
      opciones: Array.isArray(r.opciones) ? (r.opciones as string[]) : [],
      orden: (r.orden as number | null) ?? null,
    })),
    error: null,
  }
}

export async function valoresSpeaker(
  speakerId: string,
  propiedadIds: string[],
): Promise<{ data: Record<string, unknown>; error: string | null }> {
  if (propiedadIds.length === 0) return { data: {}, error: null }
  const res = await supabase
    .from('valores_propiedades')
    .select('propiedad_id, valor')
    .eq('speaker_id', speakerId)
    .in('propiedad_id', propiedadIds)
  if (res.error) return { data: {}, error: res.error.message }
  const map: Record<string, unknown> = {}
  for (const r of res.data ?? []) map[r.propiedad_id as string] = r.valor
  return { data: map, error: null }
}

export async function guardarValorPropiedad(
  speakerId: string,
  propiedadId: string,
  valor: unknown,
): Promise<void> {
  const existing = await supabase
    .from('valores_propiedades')
    .select('id')
    .eq('speaker_id', speakerId)
    .eq('propiedad_id', propiedadId)
    .maybeSingle()
  if (existing.error) throw new Error(existing.error.message)

  if (existing.data) {
    const { error } = await supabase
      .from('valores_propiedades')
      .update({ valor })
      .eq('id', existing.data.id as string)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('valores_propiedades')
      .insert({ speaker_id: speakerId, propiedad_id: propiedadId, valor })
    if (error) throw new Error(error.message)
  }
}

export async function crearPropiedad(
  eventoId: string,
  nombre: string,
  tipo: string,
): Promise<void> {
  const { error } = await supabase.from('propiedades_custom').insert({
    evento_id: eventoId,
    entidad: 'speaker',
    nombre,
    tipo,
  })
  if (error) throw new Error(error.message)
}

export async function actualizarPropiedad(
  id: string,
  patch: { nombre?: string; tipo?: string },
): Promise<void> {
  const { error } = await supabase
    .from('propiedades_custom')
    .update(patch)
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function contarValoresPropiedad(id: string): Promise<number> {
  const { count, error } = await supabase
    .from('valores_propiedades')
    .select('id', { count: 'exact', head: true })
    .eq('propiedad_id', id)
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function eliminarPropiedad(id: string): Promise<void> {
  // Los valores dependen de la propiedad (FK); se borran primero.
  await supabase.from('valores_propiedades').delete().eq('propiedad_id', id)
  const { error } = await supabase
    .from('propiedades_custom')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
}

type State = {
  speakers: Speaker[]
  propiedades: PropiedadCustom[]
  valoresPorSpeaker: Record<string, Record<string, unknown>>
  toolkitBaseUrl: string | null
  loading: boolean
  error: string | null
}

const EMPTY_STATE: Omit<State, 'loading'> = {
  speakers: [],
  propiedades: [],
  valoresPorSpeaker: {},
  toolkitBaseUrl: null,
  error: null,
}

export function useSpeakersData(
  eventoId: string | null | undefined,
  options?: { global?: boolean },
): SpeakersData {
  const global = options?.global === true
  const [tick, setTick] = useState(0)
  const [state, setState] = useState<State>({
    ...EMPTY_STATE,
    loading: global || Boolean(eventoId),
  })

  const refetch = useCallback(() => setTick((v) => v + 1), [])

  useEffect(() => {
    if (!global && !eventoId) {
      setState({ ...EMPTY_STATE, loading: false })
      return
    }
    if (!global && !isUuid(eventoId)) {
      setState({
        ...EMPTY_STATE,
        loading: false,
        error: 'El workspace no tiene un id de evento válido (UUID).',
      })
      return
    }
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: null }))
    const loader = global
      ? loadSpeakersGlobal()
      : loadSpeakers(eventoId as string)
    loader.then((next) => {
      if (!cancelled) setState({ ...next, loading: false })
    })
    return () => {
      cancelled = true
    }
  }, [eventoId, global, tick])

  const actualizar = useCallback(
    async (id: string, datos: Partial<SpeakerEditable>) => {
      await actualizarSpeaker(id, datos)
      setTick((v) => v + 1)
    },
    [],
  )

  return { ...state, refetch, actualizarSpeaker: actualizar }
}
