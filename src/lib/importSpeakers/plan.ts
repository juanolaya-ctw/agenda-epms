import { ESTADO_ALTA_NUEVA, type EventoSpeakerEstado } from '@/lib/eventoSpeakerEstado'
import type { GestionTipo } from '@/lib/gestionTipos'
import { celdaValor } from './parse'
import {
  mapearEstadoExcel,
  normalizarEmailImport,
  normalizarNombre,
  normalizarTextoMatch,
  parseBoolCelda,
  textoONull,
} from './normalize'
import { construirGestionesDeCanales } from './gestiones'
import {
  contarGruposHomonimos,
  detectarHomonimosEnArchivo,
  matchSpeaker,
} from './matching'
import type {
  AccionImport,
  DiffCampo,
  FilaCruda,
  FilaNormalizada,
  FilaPlan,
  FilaRpc,
  MapeoColumnas,
  MembresiaExistente,
  OpcionesPlan,
  ResumenPlan,
  SnapshotImportExcel,
  SpeakerExistente,
} from './tipos'

function colValor(
  fila: FilaCruda,
  mapeo: MapeoColumnas,
  campo: string,
): unknown {
  for (const [idxStr, dest] of Object.entries(mapeo)) {
    if (dest === campo) {
      const c = fila.celdas[Number(idxStr)]
      return c ? celdaValor(c) : null
    }
  }
  return null
}

function hayCampo(mapeo: MapeoColumnas, campo: string): boolean {
  return Object.values(mapeo).includes(campo as never)
}

export function normalizarFila(
  fila: FilaCruda,
  mapeo: MapeoColumnas,
  opciones: { defaultEstado: EventoSpeakerEstado },
): FilaNormalizada {
  const avisos: FilaNormalizada['avisos'] = []
  const nombre = normalizarNombre(colValor(fila, mapeo, 'nombre'))
  const empresa = textoONull(colValor(fila, mapeo, 'empresa'))
  const cargo = textoONull(colValor(fila, mapeo, 'cargo'))
  const pais = textoONull(colValor(fila, mapeo, 'pais'))
  const emailInfo = normalizarEmailImport(colValor(fila, mapeo, 'email'))
  if (emailInfo.aviso) avisos.push(emailInfo.aviso)

  const sinColumnaEstado = !hayCampo(mapeo, 'estado')
  const estadoInfo = mapearEstadoExcel(colValor(fila, mapeo, 'estado'), {
    sinColumnaEstado,
    defaultEstado: opciones.defaultEstado,
  })
  if (estadoInfo.aviso) avisos.push(estadoInfo.aviso)

  let requiereViaticos = parseBoolCelda(
    colValor(fila, mapeo, 'requiere_viaticos'),
  )
  if (estadoInfo.fuerzaViaticos) requiereViaticos = true

  const pistaRaw = colValor(fila, mapeo, 'pista_espacio')
  const pistaEspacio =
    typeof pistaRaw === 'boolean' ? null : textoONull(pistaRaw)

  const canalesIn = construirGestionesDeCanales([
    {
      tipo: 'correo',
      checkboxRaw: colValor(fila, mapeo, 'canal_correo'),
      fechaRaw: colValor(fila, mapeo, 'canal_correo_fecha'),
    },
    {
      tipo: 'linkedin',
      checkboxRaw: colValor(fila, mapeo, 'canal_linkedin'),
      fechaRaw: colValor(fila, mapeo, 'canal_linkedin_fecha'),
    },
    {
      tipo: 'referencia',
      checkboxRaw: colValor(fila, mapeo, 'canal_referencia'),
      fechaRaw: colValor(fila, mapeo, 'canal_referencia_fecha'),
    },
    {
      tipo: 'institucion',
      checkboxRaw: colValor(fila, mapeo, 'canal_institucion'),
      fechaRaw: colValor(fila, mapeo, 'canal_institucion_fecha'),
    },
  ])
  avisos.push(...canalesIn.avisos)

  const agenda = parseBoolCelda(colValor(fila, mapeo, 'agenda'))
  const telefono = textoONull(colValor(fila, mapeo, 'telefono'))
  const linkedinUrl = textoONull(colValor(fila, mapeo, 'linkedin_url'))

  let error: string | null = null
  if (!nombre) {
    error = 'Fila sin nombre'
  }

  return {
    filaIdx: fila.filaIdx,
    nombre,
    nombreNorm: normalizarTextoMatch(nombre),
    empresa,
    empresaNorm: normalizarTextoMatch(empresa),
    cargo,
    pais,
    email: emailInfo.email,
    emailAprobado: emailInfo.aprobado,
    telefono,
    linkedinUrl,
    estadoHub: estadoInfo.estado,
    estadoMotivo: estadoInfo.motivo,
    estadoRaw: estadoInfo.raw,
    requiereViaticos,
    pistaEspacio,
    responsableTexto: textoONull(colValor(fila, mapeo, 'responsable_texto')),
    proximoSeguimientoNota: textoONull(
      colValor(fila, mapeo, 'proximo_seguimiento_nota'),
    ),
    notasInternas: textoONull(colValor(fila, mapeo, 'notas_internas')),
    agenda,
    gestiones: canalesIn.gestiones,
    canales: canalesIn.canales,
    avisos,
    error,
  }
}

function empty(v: string | null | undefined): boolean {
  return v == null || String(v).trim() === ''
}

function diffTexto(
  campo: string,
  hub: string | null | undefined,
  excel: string | null | undefined,
): DiffCampo | null {
  if (excel == null || excel === '') return null
  if (empty(hub)) {
    return {
      campo,
      hub: hub ?? null,
      excel,
      accion: 'rellenar',
    }
  }
  if ((hub ?? '') === excel) {
    return { campo, hub: hub ?? null, excel, accion: 'igual' }
  }
  return { campo, hub: hub ?? null, excel, accion: 'conservar' }
}

function accionDefault(
  match: ReturnType<typeof matchSpeaker>,
  tieneError: boolean,
): AccionImport {
  if (tieneError) return 'omitir'
  if (match.nivel === 'ninguna') return 'crear'
  if (match.nivel === 'alta' && match.motivo === 'email') return 'actualizar'
  // nombre+empresa alta, media, ambigua → revisar
  return 'revisar'
}

function buildSnapshot(
  fila: FilaNormalizada,
  opciones: OpcionesPlan,
): SnapshotImportExcel {
  return {
    archivo: opciones.archivoNombre,
    hoja: opciones.hojaNombre,
    fila: fila.filaIdx,
    importado_at: new Date().toISOString(),
    nombre: fila.nombre ?? '',
    empresa: fila.empresa,
    cargo: fila.cargo,
    pais: fila.pais,
    contacto_raw: fila.responsableTexto,
    ubicacion_raw: fila.pistaEspacio,
    estado_raw: fila.estadoRaw,
    agenda: fila.agenda,
    canales: fila.canales,
    avisos: fila.avisos,
  }
}

function buildDiffs(
  fila: FilaNormalizada,
  speaker: SpeakerExistente | null,
  memb: MembresiaExistente | null,
  sobrescribirEstado: boolean,
): DiffCampo[] {
  const diffs: DiffCampo[] = []
  if (speaker) {
    for (const d of [
      diffTexto('cargo', speaker.cargo, fila.cargo),
      diffTexto('empresa', speaker.empresa, fila.empresa),
      diffTexto('pais', speaker.pais, fila.pais),
    ]) {
      if (d) diffs.push(d)
    }
    if (fila.email && fila.emailAprobado) {
      if (empty(speaker.email)) {
        diffs.push({
          campo: 'email',
          hub: speaker.email,
          excel: fila.email,
          accion: 'rellenar',
        })
      } else if (speaker.email === fila.email) {
        diffs.push({
          campo: 'email',
          hub: speaker.email,
          excel: fila.email,
          accion: 'igual',
        })
      } else {
        diffs.push({
          campo: 'email',
          hub: speaker.email,
          excel: fila.email,
          accion: 'conservar',
        })
      }
    }
  } else {
    // crear
    if (fila.cargo)
      diffs.push({
        campo: 'cargo',
        hub: null,
        excel: fila.cargo,
        accion: 'rellenar',
      })
    if (fila.empresa)
      diffs.push({
        campo: 'empresa',
        hub: null,
        excel: fila.empresa,
        accion: 'rellenar',
      })
    if (fila.pais)
      diffs.push({
        campo: 'pais',
        hub: null,
        excel: fila.pais,
        accion: 'rellenar',
      })
    if (fila.email)
      diffs.push({
        campo: 'email',
        hub: null,
        excel: fila.email,
        accion: 'rellenar',
      })
  }

  // Membresía estado
  const hubEstado = memb?.estado ?? null
  if (!memb) {
    diffs.push({
      campo: 'estado',
      hub: null,
      excel: fila.estadoHub,
      accion: 'rellenar',
    })
  } else if (
    sobrescribirEstado ||
    hubEstado === 'SIN_CLASIFICAR' ||
    hubEstado === 'PENDIENTE_CONTACTAR'
  ) {
    diffs.push({
      campo: 'estado',
      hub: hubEstado,
      excel: fila.estadoHub,
      accion:
        hubEstado === fila.estadoHub
          ? 'igual'
          : sobrescribirEstado
            ? 'sobrescribir'
            : 'rellenar',
    })
  } else if (hubEstado !== fila.estadoHub) {
    diffs.push({
      campo: 'estado',
      hub: hubEstado,
      excel: fila.estadoHub,
      accion: 'conservar',
    })
  }

  for (const [campo, hub, excel] of [
    ['responsable_texto', memb?.responsable_texto, fila.responsableTexto],
    [
      'proximo_seguimiento_nota',
      memb?.proximo_seguimiento_nota,
      fila.proximoSeguimientoNota,
    ],
    ['notas_internas', memb?.notas_internas, fila.notasInternas],
    ['pista_espacio', memb?.pista_espacio, fila.pistaEspacio],
    ['estado_motivo', memb?.estado_motivo, fila.estadoMotivo],
  ] as const) {
    const d = diffTexto(campo, hub, excel)
    if (d) diffs.push(d)
  }

  if (fila.requiereViaticos != null) {
    const hubV = memb?.requiere_viaticos
    // Solo rellenar si hub es NULL; false del hub se conserva
    if (hubV == null) {
      diffs.push({
        campo: 'requiere_viaticos',
        hub: null,
        excel: String(fila.requiereViaticos),
        accion: 'rellenar',
      })
    } else if (hubV !== fila.requiereViaticos) {
      diffs.push({
        campo: 'requiere_viaticos',
        hub: String(hubV),
        excel: String(fila.requiereViaticos),
        accion: 'conservar',
      })
    } else {
      diffs.push({
        campo: 'requiere_viaticos',
        hub: String(hubV),
        excel: String(fila.requiereViaticos),
        accion: 'igual',
      })
    }
  }

  return diffs
}

/** Contenido estable del snapshot (sin timestamps ni avisos volátiles). */
export function snapshotComparable(
  snap: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!snap || typeof snap !== 'object') return null
  const { importado_at: _i, avisos: _a, ...rest } = snap
  return rest
}

/**
 * Re-run idéntico: membresía ya tiene import_excel de esta fila con el mismo
 * snapshot estable (sin importado_at/avisos) y hay un único speaker candidato.
 * Aplica también a matches por nombre (que de otro modo quedarían en «revisar»).
 * Varios candidatos o snapshot distinto → no aplica (sigue en revisar).
 */
export function esReRunSinCambios(args: {
  candidatoUnico: boolean
  memb: MembresiaExistente | null
  fila: FilaNormalizada
  opciones: OpcionesPlan
}): boolean {
  if (args.fila.error) return false
  if (!args.candidatoUnico) return false
  if (!args.memb) return false
  const prev = args.memb.datos_prospeccion?.import_excel as
    | Record<string, unknown>
    | undefined
  if (!prev || prev.fila !== args.fila.filaIdx) return false
  const nuevo = snapshotComparable(
    buildSnapshot(args.fila, args.opciones) as unknown as Record<
      string,
      unknown
    >,
  )
  const anterior = snapshotComparable(prev)
  return JSON.stringify(nuevo) === JSON.stringify(anterior)
}

export type PlanCompleto = {
  filas: FilaPlan[]
  resumen: ResumenPlan
}

export function construirPlan(
  filasCrudas: FilaCruda[],
  mapeo: MapeoColumnas,
  speakersExistentes: SpeakerExistente[],
  membresiasEvento: MembresiaExistente[],
  opciones: OpcionesPlan,
): PlanCompleto {
  const defaultEstado = opciones.estadoDefault ?? ESTADO_ALTA_NUEVA
  const normalizadas = filasCrudas.map((f) =>
    normalizarFila(f, mapeo, { defaultEstado }),
  )
  const homonimos = detectarHomonimosEnArchivo(normalizadas)
  const membBySpeaker = new Map(
    membresiasEvento.map((m) => [m.speaker_id, m] as const),
  )

  const firstHomonimoIdx = new Map<string, number>()
  normalizadas.forEach((f, i) => {
    if (!f.nombreNorm) return
    if (!firstHomonimoIdx.has(f.nombreNorm)) firstHomonimoIdx.set(f.nombreNorm, i)
  })

  const filasPlan: FilaPlan[] = normalizadas.map((fila, i) => {
    const match = matchSpeaker(
      {
        email: fila.email,
        nombreNorm: fila.nombreNorm,
        empresaNorm: fila.empresaNorm,
      },
      speakersExistentes,
    )
    let accion = accionDefault(match, !!fila.error)
    const esHomonimo = homonimos.has(i)
    if (esHomonimo && !fila.error) {
      const first = firstHomonimoIdx.get(fila.nombreNorm!) ?? i
      if (i !== first) accion = 'revisar'
    }

    const candidatoUnico = match.candidatos.length === 1
    const resolvedSpeakerId = candidatoUnico
      ? match.candidatos[0]!.id
      : accion === 'actualizar' && match.nivel === 'alta' && match.motivo === 'email'
        ? match.candidatos[0]?.id ?? null
        : null

    const speaker =
      resolvedSpeakerId != null
        ? speakersExistentes.find((s) => s.id === resolvedSpeakerId) ?? null
        : null
    const memb = resolvedSpeakerId
      ? membBySpeaker.get(resolvedSpeakerId) ?? null
      : null
    const sobrescribirEstado = false
    const diffs = buildDiffs(fila, speaker, memb, sobrescribirEstado)

    // Re-run idéntico (también por nombre): omitir si snapshot coincide
    const sinCambios = esReRunSinCambios({
      candidatoUnico,
      memb,
      fila,
      opciones,
    })
    let accionFinal = accion
    if (sinCambios) {
      accionFinal = 'omitir'
    }

    return {
      fila,
      match,
      accion: accionFinal,
      speakerId: resolvedSpeakerId,
      sobrescribirEstado,
      diffs,
      gestionesACrear: fila.gestiones,
      sinCambios,
      homonimoEnArchivo: esHomonimo,
    }
  })

  return { filas: filasPlan, resumen: resumirPlan(filasPlan, membBySpeaker) }
}

export function resumirPlan(
  filas: FilaPlan[],
  membBySpeaker?: Map<string, MembresiaExistente>,
): ResumenPlan {
  const resumen: ResumenPlan = {
    crear: 0,
    actualizar: 0,
    omitir: 0,
    revisar: 0,
    errores: 0,
    membresiasNuevas: 0,
    membresiasActualizar: 0,
    porEstado: {},
    gestionesPorCanal: {},
    avisosPorTipo: {},
    gruposHomonimos: contarGruposHomonimos(filas.map((f) => f.fila)),
  }
  for (const fp of filas) {
    if (fp.fila.error) resumen.errores++
    if (fp.accion === 'crear') resumen.crear++
    else if (fp.accion === 'actualizar') resumen.actualizar++
    else if (fp.accion === 'omitir') resumen.omitir++
    else if (fp.accion === 'revisar') resumen.revisar++

    const est = fp.fila.estadoHub
    resumen.porEstado[est] = (resumen.porEstado[est] ?? 0) + 1

    for (const g of fp.gestionesACrear) {
      resumen.gestionesPorCanal[g.tipo] =
        (resumen.gestionesPorCanal[g.tipo] ?? 0) + 1
    }
    for (const a of fp.fila.avisos) {
      resumen.avisosPorTipo[a.codigo] =
        (resumen.avisosPorTipo[a.codigo] ?? 0) + 1
    }

    if (fp.accion === 'crear' || fp.accion === 'actualizar') {
      const sid = fp.speakerId
      const tiene = sid ? membBySpeaker?.has(sid) : false
      if (fp.accion === 'crear' || !tiene) resumen.membresiasNuevas++
      else resumen.membresiasActualizar++
    }
  }
  return resumen
}

/**
 * Acción masiva: actualizar todos los alta nombre+empresa en revisar.
 * Excluye homónimos intra-archivo (evitar dos filas → mismo speaker_id).
 */
export function bulkActualizarNombreEmpresa(filas: FilaPlan[]): FilaPlan[] {
  const seenSpeaker = new Set<string>()
  return filas.map((fp) => {
    if (
      fp.accion === 'revisar' &&
      fp.match.nivel === 'alta' &&
      fp.match.motivo === 'nombre_empresa' &&
      fp.match.candidatos.length === 1 &&
      !fp.fila.error &&
      !fp.homonimoEnArchivo
    ) {
      const sid = fp.match.candidatos[0]!.id
      if (seenSpeaker.has(sid)) return fp
      seenSpeaker.add(sid)
      return {
        ...fp,
        accion: 'actualizar' as const,
        speakerId: sid,
      }
    }
    return fp
  })
}

export function filaPlanARpc(
  fp: FilaPlan,
  opciones: OpcionesPlan,
): FilaRpc | null {
  if (fp.accion === 'revisar' || fp.accion === 'omitir') {
    if (fp.accion === 'omitir') {
      return { fila_idx: fp.fila.filaIdx, accion: 'omitir' }
    }
    return null
  }
  if (fp.fila.error) return null

  const snapshot = buildSnapshot(fp.fila, opciones)
  const base: FilaRpc = {
    fila_idx: fp.fila.filaIdx,
    accion: fp.accion,
    speaker_id: fp.accion === 'actualizar' ? fp.speakerId : null,
    nombre: fp.fila.nombre,
    empresa: fp.fila.empresa,
    cargo: fp.fila.cargo,
    pais: fp.fila.pais,
    email: fp.fila.email,
    email_aprobado: fp.fila.emailAprobado,
    estado: fp.fila.estadoHub,
    estado_motivo: fp.fila.estadoMotivo,
    sobrescribir_estado: fp.sobrescribirEstado,
    requiere_viaticos: fp.fila.requiereViaticos,
    responsable_texto: fp.fila.responsableTexto,
    proximo_seguimiento_nota: fp.fila.proximoSeguimientoNota,
    notas_internas: fp.fila.notasInternas,
    pista_espacio: fp.fila.pistaEspacio,
    datos_prospeccion: snapshot,
    gestiones: fp.gestionesACrear.map((g) => ({
      tipo: g.tipo as GestionTipo,
      fecha: g.fecha,
    })),
  }
  return base
}

export function enmascararEmail(email: string | null): string {
  if (!email) return '—'
  const [user, domain] = email.split('@')
  if (!domain) return '•••'
  const u = user ?? ''
  const visible = u.slice(0, 2)
  return `${visible}${'•'.repeat(Math.max(1, u.length - 2))}@${domain}`
}
