// Maquetacion de la pieza de quote. Misma logica del generador local (paridad verificada en prototipo HTML). Datos de prueba solamente.
export const W = 1080, H = 1350, M = 90, BOX = 825, QP = 60, AP = 35, LH = QP * 1.357, BASE1 = 811, CT = 603, LOGOB = 150.3, FO = 0.25, AX = 130
export const COMILLAS = "M158.378 701.628V666.336C158.378 650.581 162.684 636.821 171.297 625.057C179.91 613.083 193.144 605.731 211 603V626.003C200.707 627.263 193.879 630.624 190.518 636.086C187.157 641.548 185.477 648.795 185.477 657.828L166.885 654.047H210.37V701.628H158.378ZM90 701.628V666.336C90 650.581 94.3064 636.821 102.919 625.057C111.532 613.083 124.766 605.731 142.622 603V626.003C132.329 627.263 125.502 630.624 122.141 636.086C118.78 641.548 117.099 648.795 117.099 657.828L98.5078 654.047H141.992V701.628H90Z"
export type Encuadre = { zoom: number; px: number; py: number }
export type Foto = { src: string; w: number; h: number; face?: [number, number, number, number] | null }
export type Layout = { lines: string[]; base1: number; dy: number; label: string; img: { x: number; y: number; w: number; h: number } | null; avisos: string[]; bloqueos: string[]; vacia: boolean }
let ctx: CanvasRenderingContext2D | null = null
function tw(t: string, px: number) {
  ctx ??= document.createElement('canvas').getContext('2d')!
  ctx.font = `700 ${px}px Mosvita`
  return ctx.measureText(t).width
}
function wrap(t: string) {
  const out: string[] = []; let cur = ''
  for (const w of t.split(/\s+/).filter(Boolean)) {
    const x = (cur + ' ' + w).trim()
    if (tw(x, QP) <= BOX) cur = x
    else { if (cur) out.push(cur); cur = w }
  }
  if (cur) out.push(cur)
  return out
}
export function layout(quote: string, autor: string, cargo: string, foto: Foto | null, enc: Encuadre): Layout {
  const bloqueos: string[] = [], avisos: string[] = []
  const lines = wrap(quote.trim()), n = lines.length
  const base1 = BASE1 + 3 * LH - (Math.max(n, 1) - 1) * LH, dy = base1 - BASE1, comTop = CT + dy
  if (n && comTop < LOGOB + 40) bloqueos.push(`la quote es demasiado larga (${n} líneas) y choca con los logos`)
  const label = autor.trim() + (cargo.trim() ? ', ' + cargo.trim() : '')
  if (tw(label, AP) > W - AX - M) bloqueos.push('nombre y cargo no caben en una línea')
  let img: Layout['img'] = null
  if (foto) {
    const k = Math.max(W / foto.w, H / foto.h) * enc.zoom, nw = foto.w * k, nh = foto.h * k
    let cx = nw / 2, top = Math.max((nh - H) / 2, 0), face: number[] | null = null
    let fx = 0, fy = 0, fw = 0, fh = 0
    if (foto.face) { [fx, fy, fw, fh] = foto.face.map((v) => v * k); cx = fx + fw / 2 }
    let left = Math.min(Math.max(cx - W / 2, 0), nw - W)
    if (foto.face && nh > H) top = Math.min(Math.max(fy - 0.12 * H, 0), nh - H)
    left = Math.min(Math.max(left - enc.px, 0), nw - W); top = Math.min(Math.max(top - enc.py, 0), Math.max(nh - H, 0))
    if (Math.min(foto.w, foto.h) < 900) avisos.push(`La foto es de baja resolución (${foto.w}x${foto.h}).`)
    if (foto.face) {
      face = [fx - left, fy - top, fx - left + fw, fy - top + fh]
      if (face[0] < 0 || face[2] > W || face[1] < 0) bloqueos.push('el rostro queda cortado')
      if (n && comTop < face[3] - FO * (face[3] - face[1])) bloqueos.push('el texto tapa el rostro')
    } else avisos.push('Revisa a ojo que el rostro quede completo y sin texto encima.')
    img = { x: -left, y: -top, w: nw, h: nh }
  }
  return { lines, base1, dy, label, img, avisos, bloqueos, vacia: n === 0 }
}
