import { supabase } from '@/lib/supabase'
import type { PrivStorage, PubStorage, QuotesRpc } from './quotesFlow'
import type { ClienteRpcDatos } from './ingresoRpc'
const dup = (m: string) => /already exists|Duplicate/i.test(m)
export const supabaseRpc: QuotesRpc = {
  async rpc(fn, args) { const { error } = await supabase.schema('epms').rpc(fn, args); return { error: error ? error.message : null } },
}
export const supabasePrivado: PrivStorage = {
  async upload(name, bytes, contentType = 'image/png') {
    const { error } = await supabase.storage.from('toolkit-candidatos').upload(name, bytes, { contentType, upsert: false })
    return { error: error ? error.message : null, yaExiste: !!error && dup(error.message) }
  },
  async download(name) { const { data, error } = await supabase.storage.from('toolkit-candidatos').download(name); return error || !data ? null : new Uint8Array(await data.arrayBuffer()) },
}
export const supabasePublico: PubStorage = {
  async upload(name, bytes) {
    const { error } = await supabase.storage.from('toolkit-piezas').upload(name, bytes, { contentType: 'image/png', upsert: false })
    return { error: error ? error.message : null, yaExiste: !!error && dup(error.message) }
  },
  publicUrl(name) { return supabase.storage.from('toolkit-piezas').getPublicUrl(name).data.publicUrl },
  async download(url) { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null },
}
export const supabaseRpcDatos: ClienteRpcDatos = {
  async rpcDatos(fn, args) { const { data, error } = await supabase.schema('epms').rpc(fn, args); return { data, error: error ? error.message : null } },
}
