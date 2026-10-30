import { COMILLAS, BASE1, LH, M, AX, QP, W, H, type Layout } from './quoteLayout'

const BASE = import.meta.env.BASE_URL + 'quotes-demo/'

export function QuotePieza({ L, fotoSrc }: { L: Layout; fotoSrc: string | null }) {
  const q = L.vacia ? (
    <text x={M} y={BASE1 + 3 * LH} className="ph" style={{ fontSize: QP }}>Escribe aquí la quote del speaker</text>
  ) : (
    L.lines.map((l, i) => <text key={i} x={M} y={(L.base1 + i * LH).toFixed(2)} className="q">{l}</text>)
  )
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="block h-full w-full">
      <defs>
        <style>{`@font-face{font-family:Mosvita;font-weight:700;src:url(${BASE}Mosvita-Bold.otf)}
.q,.a,.ph{font-family:Mosvita;font-weight:700;fill:#F3F4F6}.q{font-size:60px}.a{font-size:35px}.ph{opacity:.45}`}</style>
        <linearGradient id="g" x1="540" y1="287" x2="540" y2="1350" gradientUnits="userSpaceOnUse">
          <stop stopColor="#131212" stopOpacity="0" /><stop offset="1" stopColor="#131212" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="white" />
      {L.img && fotoSrc ? (
        <image x={L.img.x} y={L.img.y} width={L.img.w} height={L.img.h} preserveAspectRatio="none" href={fotoSrc} />
      ) : (
        <><rect width={W} height={H} fill="#9aa0a6" /><text x="540" y="400" textAnchor="middle" fontSize="48" fill="#fff" fontFamily="Mosvita" fontWeight="700">FOTO DEL SPEAKER</text></>
      )}
      <rect y="287" width={W} height="1063" fill="url(#g)" style={{ mixBlendMode: 'multiply' }} />
      <image x="697" y="98" width="306" height="34.95" href={BASE + 'colombiatech.png'} />
      <image x="90" y="98" width="353" height={(353 * 856) / 5788} href={BASE + 'govtech.png'} />
      <g transform={`translate(0 ${L.dy.toFixed(2)})`}><path d={COMILLAS} fill="#F3F4F6" /></g>
      {q}
      <rect x="90" y="1182.4" width="32.5" height="2.9" fill="#F3F4F6" />
      <text x={AX} y="1194" className={'a' + (L.label ? '' : ' ph')}>{L.label || 'Nombre del speaker, cargo'}</text>
      {L.bloqueos.length > 0 && !L.vacia && (
        <><rect width={W} height={H} fill="rgba(200,0,0,0.18)" /><text x="540" y="700" textAnchor="middle" fontSize="130" fill="#ff2d2d" fontFamily="Mosvita" fontWeight="700" transform="rotate(-25 540 700)">NO PUBLICAR</text></>
      )}
    </svg>
  )
}
