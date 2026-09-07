import { Navbar } from '@/components/layout/Navbar'

export function CrmGlobal() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-6xl px-8 py-10">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-secondary">
          CRM
        </p>
        <h1 className="text-3xl font-semibold">Directorio de speakers</h1>
        <p className="mt-1 font-light text-muted-foreground">
          Pool global de speakers — todos los eventos
        </p>
        <div className="mt-8 rounded-xl border border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Sin contenido todavía — placeholder.
          </p>
        </div>
      </main>
    </div>
  )
}
