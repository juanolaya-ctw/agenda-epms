import type { Estado, FilaDB, QuotesBackend } from './backend'
import { sha256Hex } from './quotesFlow'
// BACKEND SIMULADO EN MEMORIA, datos ficticios. No es la BD ni Storage: sirve solo para recorrer la pantalla. Las reglas reales se probaron aparte contra el SQL v8 en un modelo local.
const BASE = import.meta.env.BASE_URL + 'quotes-demo/'
export function crearSimulado(usuario: 'principal' | 'otro', iniciales?: FilaDB[], elegir?: (fila: FilaDB, fileId: string) => Promise<Partial<FilaDB>>): QuotesBackend {
  const filas: FilaDB[] = iniciales ?? [
    { id: 's1', speaker: 'Persona Ficticia Uno', cargo: 'Cargo de prueba', charla: 'Charla de prueba A', quote: 'La confianza se construye con datos abiertos.', estado: 'pendiente', foto: BASE + 'foto2.jpg', face: [850, 192.5, 300, 375], enc: { zoom: 1, px: 0, py: 0 }, candidato_hash: null, candidato_path: null, publicada: false },
    { id: 's2', speaker: 'Persona Ficticia Dos', cargo: 'Directora de prueba', charla: 'Charla de prueba B', quote: 'Gobernar con tecnología es rediseñar la relación entre el Estado y las personas.', estado: 'pendiente', foto: BASE + 'foto1.jpg', face: null, enc: { zoom: 1, px: 0, py: 0 }, candidato_hash: null, candidato_path: null, publicada: false },
  ]
  const priv = new Map<string, Uint8Array>(), pub = new Map<string, Uint8Array>()
  const aprob = new Map<string, string>()
  const fallar = { valor: false }
  const f = (id: string) => filas.find((x) => x.id === id)!
  const set = (id: string, p: Partial<FilaDB>) => Object.assign(f(id), p)
  const es = (id: string, ...e: Estado[]) => e.includes(f(id).estado)
  return {
    etiqueta: usuario === 'principal' ? 'SIMULADO (como aprobador principal)' : 'SIMULADO (como persona de Agenda sin aprobación)', simulado: true, fallarPublicacion: fallar,
    async respaldo() { return { id: 'u-respaldo', nombre: 'Alexandra (simulada)' } },
    async elegirFoto(id, fileId) { if (!elegir) return 'sin selector'; if (!es(id, 'pendiente', 'generada', 'necesita_revision')) return 'estado'; set(id, { ...(await elegir(f(id), fileId)), estado: 'pendiente', motivo: undefined, candidato_hash: null, candidato_path: null, publicada: false }); aprob.delete(id); return null },
    async listar() { return filas.map((x) => ({ ...x, enc: { ...x.enc } })) },
    async guardarContenido(id, c) { set(id, { quote: c.quote, enc: c.enc, estado: 'pendiente', motivo: undefined, candidato_hash: null, candidato_path: null, publicada: false }); aprob.delete(id); return null },
    rpc: {
      async rpc(fn, a) {
        if (fn === 'tq_delegar_piezas') { if (usuario !== 'principal') return { error: 'solo el aprobador principal delega' }; const h = new Date(a.p_hasta as string); if (!(h.getTime() > Date.now())) return { error: 'la delegacion necesita una fecha limite futura' }; for (const i of a.p_ids as string[]) if (f(i).estado !== 'enviada') set(i, { delegada_hasta: h.toISOString() }); return { error: null } }
        if (fn === 'tq_retirar_delegacion') { if (usuario !== 'principal') return { error: 'solo el aprobador principal retira' }; for (const i of a.p_ids as string[]) set(i, { delegada_hasta: null }); return { error: null } }
        const id = a.p_id as string
        const err = (m: string) => ({ error: m })
        if (fn === 'tq_candidato') { if (!es(id, 'pendiente', 'generada', 'necesita_revision')) return err('estado'); set(id, { estado: 'generada', motivo: undefined, candidato_hash: a.p_hash as string, candidato_path: `candidatos/${id}/${a.p_hash}.png` }); return { error: null } }
        if (fn === 'tq_aprobar') { if (usuario !== 'principal') return err('no autorizado'); if (!es(id, 'generada') || f(id).candidato_hash !== a.p_hash) return err('hash'); set(id, { estado: 'aprobada' }); aprob.set(id, a.p_hash as string); return { error: null } }
        if (fn === 'tq_confirmar_publicacion') { if (!es(id, 'aprobada')) return err('estado'); set(id, { publicada: true }); return { error: null } }
        if (fn === 'tq_revision') { if (!es(id, 'generada', 'aprobada', 'enviada')) return err('estado'); set(id, { estado: 'necesita_revision', motivo: a.p_motivo as string, publicada: false }); return { error: null } }
        if (fn === 'tq_enviada') { if (!es(id, 'aprobada')) return err('estado'); set(id, { estado: 'enviada' }); return { error: null } }
        return err('desconocida')
      },
    },
    priv: {
      async upload(n, b) { if (priv.has(n)) return { error: 'already exists', yaExiste: true }; priv.set(n, b); return { error: null } },
      async download(n) { return priv.get(n) ?? null },
    },
    pub: {
      async upload(n, b) {
        if (fallar.valor) return { error: 'fallo simulado' }
        const h = n.replace(/^quotes\//, '').replace(/\.png$/, '')
        if (![...aprob.values()].includes(h)) return { error: 'denegado: pieza no aprobada' }
        if (pub.has(n)) return { error: 'already exists', yaExiste: true }
        pub.set(n, b); return { error: null }
      },
      publicUrl: (n) => 'sim://publico/' + n,
      async download(u) { void sha256Hex; return pub.get(u.replace('sim://publico/', '')) ?? null },
    },
  }
}
