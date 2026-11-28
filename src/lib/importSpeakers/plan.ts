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
    if (hubV == null || hubV === false) {
      diffs.push({
        campo: 'requiere_viaticos',
        hub: hubV == null ? null : String(hubV),
        excel: String(fila.requiereViaticos),
        accion: hubV === fila.requiereViaticos ? 'igual' : 'rellenar',
      })
    } else if (hubV !== fila.requiereViaticos) {
      diffs.push({
        campo: 'requiere_viaticos',
        hub: String(hubV),
        excel: String(fila.requiereViaticos),
        accion: 'conservar',
      })
    }
  }

  return diffs
}

function sinCambiosReales(
  accion: AccionImport,
  diffs: DiffCampo[],
  gestiones: FilaNormalizada['gestiones'],
  memb: MembresiaExistente | null,
  filaIdx: number,
): boolean {
  if (accion === 'omitir' || accion === 'revisar') return false
  if (accion === 'crear') return false
  const cambios = diffs.some(
    (d) => d.accion === 'rellenar' || d.accion === 'sobrescribir',
  )
  if (cambios) return false
  if (gestiones.length > 0) return false
  if (!memb) return false
  const prev = memb.datos_prospeccion?.import_excel as
    | { fila?: number }
    | undefined
  if (!prev || prev.fila !== filaIdx) return false
  return true
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

    const speakerId =
      accion === 'actualizar' && match.candidatos.length === 1
        ? match.candidatos[0]!.id
        : match.nivel === 'alta' && match.motivo === 'email'
          ? match.candidatos[0]?.id ?? null
          : null

    const speaker =
      speakerId != null
        ? speakersExistentes.find((s) => s.id === speakerId) ?? null
        : null
    const memb = speakerId ? membBySpeaker.get(speakerId) ?? null : null
    const sobrescribirEstado = false
    const resolvedSpeakerId =
      accion === 'actualizar'
        ? speakerId
        : match.candidatos.length === 1
          ? match.candidatos[0]!.id
          : null
    const diffs = buildDiffs(fila, speaker, memb, sobrescribirEstado)
    let accionFinal = accion
    const sinCambios = sinCambiosReales(
      accion,
      diffs,
      fila.gestiones,
      memb,
      fila.filaIdx,
    )
    // Re-run idéntico: omitir por defecto
    if (sinCambios && (accion === 'actualizar' || accion === 'crear')) {
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

/** Aplica acción masiva: actualizar todos los alta nombre+empresa en revisar. */
export function bulkActualizarNombreEmpresa(filas: FilaPlan[]): FilaPlan[] {
  return filas.map((fp) => {
    if (
      fp.accion === 'revisar' &&
      fp.match.nivel === 'alta' &&
      fp.match.motivo === 'nombre_empresa' &&
      fp.match.candidatos.length === 1 &&
      !fp.fila.error
    ) {
      return {
        ...fp,
        accion: 'actualizar' as const,
        speakerId: fp.match.candidatos[0]!.id,
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
