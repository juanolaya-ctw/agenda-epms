import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-card p-8 text-card-foreground">
      <p className="text-5xl font-semibold">404</p>
      <p className="font-light text-muted-foreground">Esta página no existe.</p>
      <Link
        to="/"
        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground no-underline"
      >
        Volver al inicio
      </Link>
    </div>
  )
}
