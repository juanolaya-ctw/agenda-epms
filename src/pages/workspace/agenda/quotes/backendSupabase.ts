import { supabase } from '@/lib/supabase'
import type { Estado, FilaDB, QuotesBackend } from './backend'
import { supabasePrivado, supabasePublico, supabaseRpc, supabaseRpcDatos } from './supabaseAdapters'
import { ingresarQuoteReal } from './ingresoRpc'
import { mapearFotos } from './fotoSupabase'
// Lectura real de epms.toolkit_quotes (+ speakers y sesiones). No verificado contra la BD real: columnas de speakers (nombre, cargo, empresa) vienen del codigo del repo.
// foto_ref: URL completa, o ruta 'fotos/<speaker>/<sha256>.jpg|png' en el bucket PRIVADO toolkit-candidatos (se baja con la sesion de Agenda).
async function resolverFoto(ref: string | null): Promise<string> {
  if (!ref) return ''
  if (!ref.startsWith('fotos/')) return ref
  const { data, error } = await supabase.storage.from('toolkit-candidatos').download(ref)
  return error || !data ? '' : URL.createObjectURL(data)
}
// Correo del aprobador de respaldo sembrado en v8 (toolkit_quotes_aprobadores). La base valida que sea respaldo; esto solo busca su id.
const EMAIL_RESPALDO = 'alex@colombiatechweek.co'
export const backendSupabase: QuotesBackend = {
  etiqueta: 'Supabase real', simulado: false,
  async listar() {
    const base = 'id,quote_texto,quote_propuesta,foto_ref,encuadre,estado,motivo_revision,candidato_hash,candidato_path,publicada_confirmada_en,delegada_hasta,speakers(nombre,cargo,empresa),sesiones(titulo)'
    // Con v10 aplicado trae las fotos ofrecidas y su seleccion; sin v10 (tablas inexistentes) sigue funcionando con la foto actual.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any[] | null, error: { message: string } | null
    ;({ data, error } = await supabase.from('toolkit_quotes').select(base + ',toolkit_quotes_fotos(file_id,folder_id,nombre),toolkit_quotes_fotos_selecciones(id,file_id,elegida_por,motivo)').order('created_at') as unknown as { data: any[] | null; error: { message: string } | null })
    if (error && /relationship|toolkit_quotes_fotos/i.test(error.message)) ({ data, error } = (await supabase.from('toolkit_quotes').select(base).order('created_at')) as unknown as { data: any[] | null; error: { message: string } | null })
    if (error) throw new Error(error.message)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return Promise.all((data as any[]).map(async (r): Promise<FilaDB> => ({
      id: r.id, speaker: r.speakers?.nombre ?? '', cargo: [r.speakers?.cargo, r.speakers?.empresa].filter(Boolean).join(', '),
      charla: r.sesiones?.titulo ?? '', quote: r.quote_texto, propuesta: r.quote_propuesta ?? null, estado: r.estado as Estado, motivo: r.motivo_revision ?? undefined,
      foto: await resolverFoto(r.foto_ref), face: null, enc: r.encuadre, candidato_hash: r.candidato_hash, candidato_path: r.candidato_path, publicada: !!r.publicada_confirmada_en, delegada_hasta: r.delegada_hasta ?? null, ...mapearFotos(r.toolkit_quotes_fotos, r.toolkit_quotes_fotos_selecciones),
    })))
  },
  async guardarContenido(id, c) {
    const { error } = await supabase.from('toolkit_quotes').update({ quote_texto: c.quote, encuadre: c.enc }).eq('id', id)
    return error ? error.message : null
  },
  ingresar: (ing, fotoRef) => ingresarQuoteReal(supabaseRpcDatos, ing, fotoRef),
  // Cambio de foto por una persona: elige entre las ofrecidas (v10). La base registra el usuario; el original de Drive no se toca.
  async elegirFoto(id, fileId) {
    const r = await supabaseRpc.rpc('tq_elegir_foto', { p_quote: id, p_file_id: fileId, p_elegida_por: 'persona', p_motivo: 'Cambio manual desde la pantalla' })
    return r.error
  },
  async respaldo() {
    const { data } = await supabase.from('usuarios').select('id,nombre').eq('email', EMAIL_RESPALDO).maybeSingle()
    return data ? { id: data.id as string, nombre: (data.nombre as string) ?? 'Alexandra' } : null
  },
  rpc: supabaseRpc, priv: supabasePrivado, pub: supabasePublico,
}
