// Flujo de una quote (arquitectura v8): candidato PRIVADO persistido -> revision recuperable -> aprobacion en la base -> publicacion verificada.
// Limites: la base no ve los bytes; el SHA-256 lo calcula y compara el navegador de quien sube/aprueba. Nada se publica antes de que la base registre la aprobacion.
export interface QuotesRpc { rpc(fn: string, args: Record<string, unknown>): Promise<{ error: string | null }> }
export interface PrivStorage {
  upload(name: string, bytes: Uint8Array, contentType?: string): Promise<{ error: string | null; yaExiste?: boolean }>
  download(name: string): Promise<Uint8Array | null>
}
export interface PubStorage {
  upload(name: string, bytes: Uint8Array): Promise<{ error: string | null; yaExiste?: boolean }>
  publicUrl(name: string): string
  download(url: string): Promise<Uint8Array | null>
}
export interface QuoteRef { id: string; candidato_hash: string | null; candidato_path: string | null }
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
export type Res<T = object> = ({ ok: true } & T) | { ok: false; paso: string; mensaje: string }

// 1) Generar: registra hash y ruta en la base y guarda el PNG en el bucket privado.
export async function subirCandidato(repo: QuotesRpc, priv: PrivStorage, quoteId: string, bytes: Uint8Array): Promise<Res<{ hash: string }>> {
  const hash = await sha256Hex(bytes)
  const r = await repo.rpc('tq_candidato', { p_id: quoteId, p_hash: hash })
  if (r.error) return { ok: false, paso: 'registro', mensaje: 'No se pudo registrar la pieza generada. Revisa el estado de la quote.' }
  const s = await priv.upload(`candidatos/${quoteId}/${hash}.png`, bytes)
  if (s.error && !s.yaExiste) return { ok: false, paso: 'subida', mensaje: 'La pieza se registró pero no se pudo guardar el archivo. Vuelve a generarla.' }
  return { ok: true, hash }
}

// 2) Revisar (cualquier Agenda, otra sesion u otra persona): baja el candidato guardado y comprueba que es el registrado.
export async function cargarCandidato(priv: PrivStorage, q: QuoteRef): Promise<Res<{ bytes: Uint8Array }>> {
  if (!q.candidato_path || !q.candidato_hash) return { ok: false, paso: 'sin_candidato', mensaje: 'Aún no hay pieza generada.' }
  const bytes = await priv.download(q.candidato_path)
  if (!bytes) return { ok: false, paso: 'no_encontrado', mensaje: 'No se encontró el archivo de la pieza. Genérala de nuevo.' }
  if ((await sha256Hex(bytes)) !== q.candidato_hash) return { ok: false, paso: 'no_coincide', mensaje: 'El archivo guardado no coincide con el registrado. Genera la pieza de nuevo.' }
  return { ok: true, bytes }
}

// 3) Aprobar y publicar. La base aprueba primero (valida quien, que estado y que hash); solo despues se sube al bucket publico, se verifica y se confirma.
// Si algo falla despues de aprobar, la pieza queda Aprobada SIN publicar (el toolkit no la ve) y se reintenta con publicarAprobada.
export async function aprobarYPublicar(repo: QuotesRpc, priv: PrivStorage, pub: PubStorage, q: QuoteRef): Promise<Res<{ hash: string; url: string }> | { ok: false; paso: 'aprobacion'; mensaje: string }> {
  const c = await cargarCandidato(priv, q)
  if (!c.ok) return c
  const hash = q.candidato_hash as string
  const a = await repo.rpc('tq_aprobar', { p_id: q.id, p_hash: hash })
  if (a.error) return { ok: false, paso: 'aprobacion', mensaje: 'No tienes permiso para aprobar esta pieza o cambió de estado. No se publicó nada.' }
  return publicarAprobada(repo, pub, q.id, c.bytes, hash)
}
export async function publicarAprobada(repo: QuotesRpc, pub: PubStorage, quoteId: string, bytes: Uint8Array, hash: string): Promise<Res<{ hash: string; url: string }>> {
  if ((await sha256Hex(bytes)) !== hash) return { ok: false, paso: 'bytes', mensaje: 'Los bytes no coinciden con la versión aprobada. No se publicó nada.' }
  const nombre = `quotes/${hash}.png`
  const s = await pub.upload(nombre, bytes)
  if (s.error && !s.yaExiste) return { ok: false, paso: 'publicacion', mensaje: 'La pieza quedó aprobada pero no se pudo publicar. Reintenta la publicación; el toolkit aún no la muestra.' }
  const url = pub.publicUrl(nombre)
  const bajado = await pub.download(url)
  if (!bajado || (await sha256Hex(bajado)) !== hash) return { ok: false, paso: 'verificacion', mensaje: 'La pieza quedó aprobada pero el archivo publicado no coincide. El toolkit aún no la muestra; hay que revisarlo.' }
  const f = await repo.rpc('tq_confirmar_publicacion', { p_id: quoteId })
  if (f.error) return { ok: false, paso: 'confirmacion', mensaje: 'El archivo está publicado pero NO se confirmó: puede ser un fallo de red o que el speaker ya tenga otro link de pieza. El toolkit aún no la muestra; reintenta y, si se repite, revisa el link del speaker.' }
  return { ok: true, hash, url }
}
