import { W, H } from './quoteLayout'
// Exporta el SVG de la vista previa a PNG 1080x1350 (Chrome; la diferencia con el generador Python se midio solo en un caso).
async function dataUri(u: string): Promise<string> {
  const b = await (await fetch(u)).blob()
  return new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(b) })
}
export async function exportarPng(svgEl: SVGSVGElement): Promise<Uint8Array> {
  await document.fonts.ready
  const clon = svgEl.cloneNode(true) as SVGSVGElement
  clon.setAttribute('width', String(W)); clon.setAttribute('height', String(H))
  for (const im of Array.from(clon.querySelectorAll('image'))) {
    const h = im.getAttribute('href'); if (h && !h.startsWith('data:')) im.setAttribute('href', await dataUri(h))
  }
  const st = clon.querySelector('style')
  if (st) { const m = /url\(([^)]+)\)/.exec(st.textContent ?? ''); if (m) st.textContent = (st.textContent ?? '').replace(m[1], await dataUri(m[1])) }
  const img = new Image()
  await new Promise<void>((ok, ko) => { img.onload = () => ok(); img.onerror = () => ko(new Error('no se pudo renderizar la pieza')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clon)) })
  const c = document.createElement('canvas'); c.width = W; c.height = H
  c.getContext('2d')!.drawImage(img, 0, 0)
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
  if (!blob) throw new Error('no se pudo exportar PNG')
  return new Uint8Array(await blob.arrayBuffer())
}
