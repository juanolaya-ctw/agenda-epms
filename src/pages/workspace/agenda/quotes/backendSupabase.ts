import { quotePerteneceAlEvento } from '@/lib/quoteEvento'
import { supabase } from '@/lib/supabase'
import type { Estado, FilaDB, QuotesBackend } from './backend'
import { supabasePrivado, supabasePublico, supabaseRpc, supabaseRpcDatos } from './supabaseAdapters'
import { ingresarQuoteReal } from './ingresoRpc'
import { mapearFotos } from './fotoSupabase'
import type { IngresoQuote } from './ingreso'

// Lectura real de epms.toolkit_quotes (+ speakers y sesiones), acotada al evento del workspace.
// foto_ref: URL completa, o ruta 'fotos/<speaker>/<sha256>.jpg|png' en el bucket PRIVADO toolkit-candidatos.
async function resolverFoto(ref: string | null): Promise<string> {
  if (!ref) return ''
  if (!ref.startsWith('fotos/')) return ref
  const { data, error } = await supabase.storage.from('toolkit-candidatos').download(ref)
  return error || !data ? '' : URL.createObjectURL(data)
}

const EMAIL_RESPALDO = 'alex@colombiatechweek.co'

const SELECT_BASE =
  'id,quote_texto,quote_propuesta,plantilla_version,foto_ref,encuadre,estado,motivo_revision,candidato_hash,candidato_path,publicada_confirmada_en,delegada_hasta,speakers(nombre,cargo,empresa),sesiones!inner(titulo,slot:slots!inner(dia,escenario:escenarios!inner(evento_id)))'

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null
  return rel ?? null
}

function eventoDeQuote(r: {
  sesiones?:
    | {
        titulo?: string
        slot?:
          | { dia?: string; escenario?: { evento_id?: string } | { evento_id?: string }[] | null }
          | { dia?: string; escenario?: { evento_id?: string } | { evento_id?: string }[] | null }[]
          | null
      }
    | {
        titulo?: string
        slot?:
          | { dia?: string; escenario?: { evento_id?: string } | { evento_id?: string }[] | null }
          | { dia?: string; escenario?: { evento_id?: string } | { evento_id?: string }[] | null }[]
          | null
      }[]
    | null
}): { eventoId: string | null; titulo: string; dia: string | null } {
  const ses = one(r.sesiones)
  const slot = one(ses?.slot)
  const esc = one(slot?.escenario)
  return {
    eventoId: esc?.evento_id ?? null,
    titulo: ses?.titulo ?? '',
    dia: slot?.dia ?? null,
  }
}

export function crearBackendSupabase(eventoId: string): QuotesBackend {
  async function pertenece(id: string): Promise<string | null> {
    if (!eventoId) return 'No hay evento para esta quote'
    const { data, error } = await supabase
      .from('toolkit_quotes')
      .select('id, sesiones!inner(slot:slots!inner(escenario:escenarios!inner(evento_id)))')
      .eq('id', id)
      .eq('sesiones.slot.escenario.evento_id', eventoId)
      .maybeSingle()
    if (error) return error.message
    if (!data) return 'La quote no pertenece a este evento'
    return null
  }

  async function sesionDelEvento(sesionId: string): Promise<boolean> {
    if (!eventoId) return false
    const { data, error } = await supabase
      .from('sesiones')
      .select('id, slot:slots!inner(escenario:escenarios!inner(evento_id))')
      .eq('id', sesionId)
      .eq('slot.escenario.evento_id', eventoId)
      .maybeSingle()
    return !error && !!data
  }

  return {
    etiqueta: 'Supabase real',
    simulado: false,
    async listar() {
      if (!eventoId) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any[] | null, error: { message: string } | null
      ;({ data, error } = await supabase
        .from('toolkit_quotes')
        .select(SELECT_BASE + ',toolkit_quotes_fotos(file_id,folder_id,nombre),toolkit_quotes_fotos_selecciones(id,file_id,elegida_por,motivo)')
        .eq('sesiones.slot.escenario.evento_id', eventoId)
        .order('created_at') as unknown as { data: any[] | null; error: { message: string } | null })
      if (error && /relationship|toolkit_quotes_fotos/i.test(error.message)) {
        ;({ data, error } = await supabase
          .from('toolkit_quotes')
          .select(SELECT_BASE)
          .eq('sesiones.slot.escenario.evento_id', eventoId)
          .order('created_at') as unknown as { data: any[] | null; error: { message: string } | null })
      }
      if (error) throw new Error(error.message)
      const filas = (data ?? []).filter((r) =>
        quotePerteneceAlEvento(eventoDeQuote(r).eventoId, eventoId),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return Promise.all(filas.map(async (r: any): Promise<FilaDB> => {
        const sesion = eventoDeQuote(r)
        return {
        id: r.id,
        speaker: r.speakers?.nombre ?? '',
        cargo: [r.speakers?.cargo, r.speakers?.empresa].filter(Boolean).join(', '),
        charla: sesion.titulo,
        dia: sesion.dia,
        quote: r.quote_texto,
        propuesta: r.quote_propuesta ?? null,
        plantilla: r.plantilla_version ?? null,
        estado: r.estado as Estado,
        motivo: r.motivo_revision ?? undefined,
        foto: await resolverFoto(r.foto_ref),
        face: null,
        enc: r.encuadre,
        candidato_hash: r.candidato_hash,
        candidato_path: r.candidato_path,
        publicada: !!r.publicada_confirmada_en,
        delegada_hasta: r.delegada_hasta ?? null,
        ...mapearFotos(r.toolkit_quotes_fotos, r.toolkit_quotes_fotos_selecciones),
        }
      }))
    },
    async guardarContenido(id, c) {
      const ajena = await pertenece(id)
      if (ajena) return ajena
      const { error } = await supabase.from('toolkit_quotes').update({ quote_texto: c.quote, encuadre: c.enc }).eq('id', id)
      return error ? error.message : null
    },
    ingresar: async (ing: IngresoQuote, fotoRef) => {
      if (!(await sesionDelEvento(ing.sesion_id))) {
        return { ok: false, paso: 'evento', mensaje: 'La sesión no pertenece a este evento' }
      }
      return ingresarQuoteReal(supabaseRpcDatos, ing, fotoRef)
    },
    async elegirFoto(id, fileId) {
      const ajena = await pertenece(id)
      if (ajena) return ajena
      const r = await supabaseRpc.rpc('tq_elegir_foto', { p_quote: id, p_file_id: fileId, p_elegida_por: 'persona', p_motivo: 'Cambio manual desde la pantalla' })
      return r.error
    },
    async respaldo() {
      const { data } = await supabase.from('usuarios').select('id,nombre').eq('email', EMAIL_RESPALDO).maybeSingle()
      return data ? { id: data.id as string, nombre: (data.nombre as string) ?? 'Alexandra' } : null
    },
    rpc: {
      async rpc(fn, args) {
        const ids: string[] = []
        if (typeof args.p_id === 'string') ids.push(args.p_id)
        if (Array.isArray(args.p_ids)) {
          for (const id of args.p_ids) if (typeof id === 'string') ids.push(id)
        }
        for (const id of ids) {
          const ajena = await pertenece(id)
          if (ajena) return { error: ajena }
        }
        return supabaseRpc.rpc(fn, args)
      },
    },
    priv: supabasePrivado,
    pub: supabasePublico,
  }
}
