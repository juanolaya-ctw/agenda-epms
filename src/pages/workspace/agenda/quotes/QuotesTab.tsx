import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { layout, type Foto } from './quoteLayout'
import { QuotePieza } from './QuotePieza'
import type { Estado, FilaDB, QuotesBackend } from './backend'
import { backendSupabase } from './backendSupabase'
import { crearSimulado } from './backendSimulado'
import { exportarPng } from './exportarPng'
import { aprobarYPublicar, cargarCandidato, publicarAprobada, subirCandidato } from './quotesFlow'
type Fila = FilaDB

const ESTADO_LABEL: Record<Estado, string> = { pendiente: 'Incompleta (falta generar)', generada: 'Pendiente de revisión (QA)', aprobada: 'Aprobada', necesita_revision: 'Necesita revisión', enviada: 'Enviada' }
// misma convencion de color que ESTADO_CLASS en RequestsTab
const ESTADO_CLASS: Record<Estado, string> = {
  pendiente: 'border-transparent bg-yellow-100 text-yellow-900',
  generada: 'border-transparent bg-blue-100 text-blue-900',
  aprobada: 'border-transparent bg-green-100 text-green-900',
  necesita_revision: 'border-transparent bg-red-100 text-red-900',
  enviada: 'border-transparent bg-violet-100 text-violet-900',
}
function elegirBackend(): QuotesBackend {
  const m = new URLSearchParams(window.location.search).get('modo')
  return m === 'simulado' ? crearSimulado('principal') : m === 'simulado-otro' ? crearSimulado('otro') : backendSupabase
}
export function QuotesTab({ backend }: { backend?: QuotesBackend }) {
  const be = useMemo(() => backend ?? elegirBackend(), [backend])
  // Modo lectura por defecto contra la base real: solo muestra. Escribir exige VITE_QUOTES_ESCRITURA=si en el .env.local
  const soloLectura = be === backendSupabase && import.meta.env.VITE_QUOTES_ESCRITURA !== 'si'
  // Sesión de prueba con escritura real: solo foto, Generar pieza y Usar esta versión. El resto exige VITE_QUOTES_CIERRE=si
  const bloqueoPrueba = be === backendSupabase && import.meta.env.VITE_QUOTES_CIERRE !== 'si'
  // Aprobacion acotada: habilita SOLO "Aprobar esta version" y "Reintentar publicacion" sin abrir edicion, revision, delegacion ni "Marcar enviada". Exige VITE_QUOTES_APROBACION=si
  const aprobacionHabilitada = be === backendSupabase && import.meta.env.VITE_QUOTES_APROBACION === 'si'
  const guardAprobacion = (): boolean => {
    if (bloqueoPrueba && !aprobacionHabilitada) {
      setMsg({ tipo: 'error', texto: 'Bloqueado en esta sesion de prueba: aprobar/publicar sigue deshabilitado.' })
      return true
    }
    return false
  }
  const guardCierre = (): boolean => {
    if (bloqueoPrueba) {
      setMsg({ tipo: 'error', texto: 'Bloqueado en esta sesión de prueba: solo foto, Generar pieza y Usar esta versión.' })
      return true
    }
    return false
  }
  const [filas, setFilas] = useState<Fila[]>([])
  const [selId, setSelId] = useState('')
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [guardado, setGuardado] = useState<string | null>(null)
  const [, setFontsOk] = useState(false)
  const svgBox = useRef<HTMLDivElement>(null)
  const recargar = async (sel?: string) => {
    try { const r = await be.listar(); setFilas(r); setSelId((s) => sel ?? (r.some((x) => x.id === s) ? s : r.find((x) => x.id === new URLSearchParams(window.location.search).get('quote'))?.id ?? r[0]?.id ?? '')) }
    catch (e) { setMsg({ tipo: 'error', texto: 'No se pudieron cargar las quotes: ' + (e as Error).message }) }
  }
  useEffect(() => { void recargar() }, [be]) // eslint-disable-line
  useEffect(() => { document.fonts.load('700 60px Mosvita').then(() => setFontsOk(true)) }, [])
  const fila = filas.find((f) => f.id === selId) ?? ({ id: '', speaker: '', cargo: '', charla: '', quote: '', estado: 'pendiente', foto: '', face: null, enc: { zoom: 1, px: 0, py: 0 }, candidato_hash: null, candidato_path: null, publicada: false } as Fila)
  // revision recuperable: el candidato guardado (privado) se baja y se verifica; no se regenera
  useEffect(() => {
    let url: string | null = null; let vivo = true
    setGuardado(null)
    if (fila.id && (fila.estado === 'generada' || fila.estado === 'aprobada' || fila.estado === 'enviada') && fila.candidato_path) {
      void cargarCandidato(be.priv, fila).then((r) => {
        if (!vivo) return
        if (r.ok) { url = URL.createObjectURL(new Blob([r.bytes as BlobPart], { type: 'image/png' })); setGuardado(url) }
        else setMsg({ tipo: 'error', texto: r.mensaje })
      })
    }
    return () => { vivo = false; if (url) URL.revokeObjectURL(url) }
  }, [fila.id, fila.estado, fila.candidato_hash]) // eslint-disable-line
  const [dims, setDims] = useState<Record<string, { w: number; h: number }>>({})
  useEffect(() => {
    if (!fila.foto || dims[fila.foto]) return
    const i = new Image(); i.onload = () => setDims((d) => ({ ...d, [fila.foto]: { w: i.naturalWidth, h: i.naturalHeight } })); i.src = fila.foto
  }, [fila.foto, dims])
  const d = dims[fila.foto]
  const foto: Foto | null = d ? { src: fila.foto, w: d.w, h: d.h, face: fila.face } : null
  const L = useMemo(() => layout(fila.quote, fila.speaker, fila.cargo, foto, fila.enc), [fila.quote, fila.speaker, fila.cargo, fila.enc, fila.face, d]) // eslint-disable-line
  const editable = !soloLectura && (fila.estado === 'pendiente' || fila.estado === 'generada' || fila.estado === 'necesita_revision')
  const local = (p: Partial<Fila>) => setFilas((fs) => fs.map((f) => (f.id === selId ? { ...f, ...p } : f)))
  // editar invalida candidato, aprobacion y publicacion (el trigger de la base hace lo mismo); se guarda al soltar/salir del campo
  const editar = (p: Partial<Fila>) => { if (bloqueoPrueba) return; local({ ...p, estado: 'pendiente', motivo: undefined, candidato_hash: null, candidato_path: null, publicada: false }) }
  const guardar = async () => {
    if (soloLectura) return
    const e = await be.guardarContenido(fila.id, { quote: fila.quote, enc: fila.enc })
    if (e) setMsg({ tipo: 'error', texto: 'No se pudo guardar el cambio: ' + e }); else setMsg(null)
  }
  const correr = async (fn: () => Promise<void>) => { if (soloLectura) { setMsg({ tipo: 'error', texto: 'Modo solo lectura: no se escribe en la base.' }); return }; setOcupado(true); setMsg(null); try { await fn() } catch (e) { setMsg({ tipo: 'error', texto: (e as Error).message }) } finally { setOcupado(false) } }
  const generar = () => correr(async () => {
    await guardar()
    const svg = svgBox.current?.querySelector('svg'); if (!svg) throw new Error('No hay vista previa para exportar')
    const bytes = await exportarPng(svg as SVGSVGElement)
    const r = await subirCandidato(be.rpc, be.priv, fila.id, bytes)
    setMsg(r.ok ? { tipo: 'ok', texto: 'Pieza generada y guardada para revisión.' } : { tipo: 'error', texto: `[${r.paso}] ${r.mensaje}` })
    await recargar(fila.id)
  })
  const aprobar = () => correr(async () => {
    if (guardAprobacion()) return
    const r = await aprobarYPublicar(be.rpc, be.priv, be.pub, fila)
    setMsg(r.ok ? { tipo: 'ok', texto: 'Aprobada y publicada para el toolkit (verificada).' } : { tipo: 'error', texto: `[${r.paso}] ${r.mensaje}` })
    await recargar(fila.id)
  })
  const reintentar = () => correr(async () => {
    if (guardAprobacion()) return
    const c = await cargarCandidato(be.priv, fila); if (!c.ok) { setMsg({ tipo: 'error', texto: c.mensaje }); return }
    const r = await publicarAprobada(be.rpc, be.pub, fila.id, c.bytes, fila.candidato_hash as string)
    setMsg(r.ok ? { tipo: 'ok', texto: 'Publicada y verificada.' } : { tipo: 'error', texto: `[${r.paso}] ${r.mensaje}` })
    await recargar(fila.id)
  })
  const revision = () => correr(async () => {
    if (guardCierre()) return
    const r = await be.rpc.rpc('tq_revision', { p_id: fila.id, p_motivo: 'Revisar foto o texto' })
    setMsg(r.error ? { tipo: 'error', texto: 'No se pudo pedir revisión: ' + r.error } : null); await recargar(fila.id)
  })
  const [hasta, setHasta] = useState('')
  const delegada = !!fila.delegada_hasta && new Date(fila.delegada_hasta).getTime() > Date.now()
  // Delegacion por pieza y con plazo: no es una ventana global. La base valida que quien delega sea el principal y que el destino sea el respaldo.
  const delegar = () => correr(async () => {
    if (guardCierre()) return
    const r0 = await be.respaldo(); if (!r0) throw new Error('No se encontró al aprobador de respaldo.')
    if (!hasta) throw new Error('Elige hasta cuándo vale la delegación.')
    const r = await be.rpc.rpc('tq_delegar_piezas', { p_ids: [fila.id], p_usuario: r0.id, p_hasta: new Date(hasta).toISOString() })
    setMsg(r.error ? { tipo: 'error', texto: 'No se pudo delegar: ' + r.error } : { tipo: 'ok', texto: `Pieza delegada a ${r0.nombre} hasta ${new Date(hasta).toLocaleString()}.` }); await recargar(fila.id)
  })
  const retirarDelegacion = () => correr(async () => {
    if (guardCierre()) return
    const r = await be.rpc.rpc('tq_retirar_delegacion', { p_ids: [fila.id] })
    setMsg(r.error ? { tipo: 'error', texto: 'No se pudo retirar: ' + r.error } : { tipo: 'ok', texto: 'Delegación retirada.' }); await recargar(fila.id)
  })
  const enviada = () => correr(async () => {
    if (guardCierre()) return
    const r = await be.rpc.rpc('tq_enviada', { p_id: fila.id })
    setMsg(r.error ? { tipo: 'error', texto: 'No se pudo marcar enviada: ' + r.error } : null); await recargar(fila.id)
  })
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">Quotes</h1>
        <Badge variant="outline">{be.etiqueta}</Badge>{be.fallarPublicacion && <label className="flex items-center gap-1 text-xs"><input type="checkbox" onChange={(e) => { be.fallarPublicacion!.valor = e.target.checked }} />Simular fallo de publicación</label>}
      </div>
      {soloLectura && <p className="rounded-lg bg-yellow-50 p-2 text-sm text-yellow-900">Modo solo lectura: los botones de generar, aprobar, publicar y enviar están desactivados.</p>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)_minmax(0,432px)]">
        <div className="rounded-xl border">
          <Table>
            <TableHeader><TableRow><TableHead>Speaker</TableHead><TableHead>Charla</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
            <TableBody>
              {filas.map((f) => (
                <TableRow key={f.id} data-state={f.id === selId ? 'selected' : undefined} className="cursor-pointer" onClick={() => setSelId(f.id)}>
                  <TableCell className="font-medium">{f.speaker}</TableCell>
                  <TableCell className="text-muted-foreground">{f.charla}</TableCell>
                  <TableCell><Badge className={ESTADO_CLASS[f.estado]}>{ESTADO_LABEL[f.estado]}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="space-y-3 rounded-xl border p-4">
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Editar quote</h2><Badge className={ESTADO_CLASS[fila.estado]}>{ESTADO_LABEL[fila.estado]}</Badge></div>
          {fila.motivo && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-900">Motivo: {fila.motivo}</p>}
          {fila.propuesta && editable && fila.propuesta.trim() !== fila.quote.trim() && <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-2 text-sm"><p>Llegó una versión distinta de la frase: «{fila.propuesta}»</p><Button size="sm" variant="outline" disabled={ocupado || soloLectura} onClick={() => correr(async () => { const e = await be.guardarContenido(fila.id, { quote: fila.propuesta as string, enc: fila.enc }); if (e) { setMsg({ tipo: 'error', texto: 'No se pudo usar la versión nueva: ' + e }); return } setMsg({ tipo: 'ok', texto: 'Versión nueva guardada. Hay que generar la pieza otra vez.' }); await recargar(fila.id) })}>Usar esta versión</Button></div>}
          {fila.ingreso && <div className="rounded-lg border bg-muted p-2 text-xs"><p><b>Original recibido:</b> {fila.ingreso.original}</p><p><b>Origen:</b> {fila.ingreso.origen.autor} · {fila.ingreso.origen.canal} · {fila.ingreso.origen.recibido_en} · {fila.ingreso.origen.mensaje_id}</p></div>}
          {fila.fotos && fila.fotos.length > 0 && <div className="space-y-1.5 rounded-lg border p-2 text-sm"><Label htmlFor="fd">Foto de la charla (Drive)</Label>
            <select id="fd" className="w-full rounded border p-1" disabled={!editable} value={fila.foto_sel?.file_id ?? ''} onChange={(e) => { if (soloLectura) return; const v = e.target.value; void correr(async () => { const er = await (be.elegirFoto?.(fila.id, v) ?? Promise.resolve('Este modo no permite cambiar la foto')); if (er) setMsg({ tipo: 'error', texto: 'No se pudo cambiar la foto: ' + er }); else setMsg({ tipo: 'ok', texto: 'Foto cambiada. Hay que generar la pieza otra vez.' }); await recargar(fila.id) }) }}>{fila.fotos.map((p) => <option key={p.file_id} value={p.file_id}>{p.nombre}</option>)}</select>
            {fila.foto_sel && <p className="text-xs text-muted-foreground">Elegida por {fila.foto_sel.elegida_por === 'instinct' ? 'Instinct' : 'una persona'}: {fila.foto_sel.motivo}. Original en Drive sin cambios (archivo {fila.foto_sel.file_id}, carpeta {fila.foto_sel.folder_id}).</p>}</div>}
          <div className="space-y-1.5"><Label htmlFor="q">Quote</Label><Textarea id="q" rows={4} disabled={!editable || bloqueoPrueba} value={fila.quote} placeholder="Escribe aquí la quote del speaker" onChange={(e) => editar({ quote: e.target.value })} onBlur={() => { if (!bloqueoPrueba) void guardar() }} /></div>
          <div className="space-y-1.5"><Label htmlFor="a">Nombre</Label><Input id="a" disabled value={fila.speaker} /></div>
          <div className="space-y-1.5"><Label htmlFor="c">Cargo, empresa</Label><Input id="c" disabled value={fila.cargo} /></div>
          <div className="space-y-1.5"><Label htmlFor="z">Encuadre: zoom {fila.enc.zoom.toFixed(2)} (arrastra la foto)</Label>
            <input id="z" type="range" min={1} max={2.5} step={0.01} disabled={!editable || bloqueoPrueba} value={fila.enc.zoom} className="w-full accent-[var(--secondary)]" onChange={(e) => editar({ enc: { ...fila.enc, zoom: +e.target.value } })} onPointerUp={() => { if (!bloqueoPrueba) void guardar() }} />
            <Button variant="outline" size="sm" disabled={!editable || bloqueoPrueba} onClick={() => editar({ enc: { zoom: 1, px: 0, py: 0 } })}>Restablecer encuadre</Button></div>
          <p className={'rounded-lg p-2 text-sm ' + (L.bloqueos.length ? 'bg-red-50 text-red-900' : 'bg-muted')}>
            {L.vacia ? 'Escribe la quote: la vista previa se actualiza al teclear.' : L.bloqueos.length ? 'Necesita revisión: ' + L.bloqueos.join(', ') + '.' : `Cabe en la plantilla (${L.lines.length} ${L.lines.length === 1 ? 'línea' : 'líneas'}). ${L.avisos.join(' ')}`}
          </p>
          <div className="flex flex-wrap gap-2">
            {(fila.estado === 'pendiente' || fila.estado === 'necesita_revision') && <Button disabled={ocupado || soloLectura || !!L.bloqueos.length || L.vacia || !d} onClick={generar}>Generar pieza</Button>}
            {fila.estado === 'generada' && <Button disabled={ocupado || soloLectura || (bloqueoPrueba && !aprobacionHabilitada) || !guardado} onClick={aprobar}>Aprobar esta versión</Button>}
            {fila.estado === 'aprobada' && !fila.publicada && <Button disabled={ocupado || soloLectura || (bloqueoPrueba && !aprobacionHabilitada)} onClick={reintentar}>Reintentar publicación</Button>}
            <Button variant="outline" disabled={ocupado || soloLectura || bloqueoPrueba || (fila.estado !== 'generada' && fila.estado !== 'aprobada')} onClick={revision}>Necesita revisión</Button>
            <Button variant="secondary" disabled={ocupado || soloLectura || bloqueoPrueba || fila.estado !== 'aprobada' || !fila.publicada} onClick={enviada}>Marcar enviada</Button>
          </div>
          {fila.id && fila.estado !== 'enviada' && (
            <div className="space-y-2 rounded-lg border p-2 text-sm">
              {delegada ? <p>Delegada a Alexandra hasta {new Date(fila.delegada_hasta as string).toLocaleString()}. Ella puede aprobar esta pieza hasta esa fecha; tú sigues pudiendo aprobar.</p> : <p>Delegar esta pieza a Alexandra como respaldo (solo esta pieza, con plazo).</p>}
              <div className="flex flex-wrap items-center gap-2">
                {!delegada && <Input type="datetime-local" className="w-56" value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Delegación vale hasta" />}
                {!delegada && <Button variant="outline" size="sm" disabled={ocupado || soloLectura || bloqueoPrueba || !hasta} onClick={delegar}>Delegar a Alexandra</Button>}
                {delegada && <Button variant="outline" size="sm" disabled={ocupado || soloLectura || bloqueoPrueba} onClick={retirarDelegacion}>Retirar delegación</Button>}
              </div>
            </div>
          )}
          {msg && <p role="status" className={'rounded-lg p-2 text-sm ' + (msg.tipo === 'error' ? 'bg-red-50 text-red-900' : 'bg-green-50 text-green-900')}>{msg.texto}</p>}
          {fila.estado === 'aprobada' && <p className="text-xs">{fila.publicada ? 'Publicada y verificada: el toolkit la muestra.' : 'Aprobada SIN publicar: el toolkit aún no la muestra.'}</p>}
          <p className="text-xs text-muted-foreground">Vista previa del navegador: no es el archivo que se aprueba. Al generar se guarda el PNG exportado; revisar y aprobar usan ese archivo guardado.</p>
        </div>
        <div className="aspect-[4/5] w-full max-w-[432px] touch-none select-none overflow-hidden rounded-lg shadow-lg" style={{ cursor: editable && !bloqueoPrueba ? 'grab' : 'default' }}
          onPointerDown={(e) => { if (!editable || bloqueoPrueba) return; drag.current = { x: e.clientX, y: e.clientY, px: fila.enc.px, py: fila.enc.py }; e.currentTarget.setPointerCapture(e.pointerId) }}
          onPointerMove={(e) => { const g = drag.current; if (!g) return; const sc = 1080 / e.currentTarget.getBoundingClientRect().width; editar({ enc: { ...fila.enc, px: g.px + (e.clientX - g.x) * sc, py: g.py + (e.clientY - g.y) * sc } }) }}
          onPointerUp={() => { drag.current = null }}>
          <div ref={svgBox} className={guardado ? 'hidden' : 'h-full w-full'}><QuotePieza L={L} fotoSrc={d ? fila.foto : null} /></div>
          {guardado && <img src={guardado} alt="Pieza guardada" className="h-full w-full" />}
        </div>
      </div>
    </div>
  )
}
