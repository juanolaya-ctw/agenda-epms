// Foto de la charla: Drive (originales intactos) -> reducida -> bucket privado fotos/<speaker>/<sha256>.jpg. El original nunca se modifica ni se recorta.
export interface FotoDrive { file_id: string; folder_id: string; nombre: string; url: string }
export interface FotoSel { file_id: string; folder_id: string; nombre: string; elegida_por: 'instinct' | 'persona'; motivo: string }
export interface FotoLista { bytes: Uint8Array; sha256: string; w: number; h: number; ow: number; oh: number; original_sha256: string; original_bytes: number }
const hex = async (b: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b as BufferSource))).map((x) => x.toString(16).padStart(2, '0')).join('')
export async function reducirFoto(url: string, max = 2000): Promise<FotoLista> {
  const orig = new Uint8Array(await (await fetch(url)).arrayBuffer())
  const bmp = await createImageBitmap(new Blob([orig as BlobPart]))
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k)
  const c = document.createElement('canvas'); c.width = w; c.height = h
  c.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.92))
  if (!blob) throw new Error('no se pudo reducir la foto')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return { bytes, sha256: await hex(bytes), w, h, ow: bmp.width, oh: bmp.height, original_sha256: await hex(orig), original_bytes: orig.length }
}
