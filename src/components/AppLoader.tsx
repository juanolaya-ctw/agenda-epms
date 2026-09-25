/** Pantalla de carga con logo CT (favicon) y zoom suave. */
export function AppLoader() {
  return (
    <div
      className="grid min-h-screen place-content-center bg-white"
      role="status"
      aria-label="Cargando"
    >
      <img
        src="/favicon.png"
        alt=""
        width={48}
        height={48}
        className="size-12 rounded-lg animate-logo-zoom"
        decoding="async"
      />
    </div>
  )
}
