import { useMemo, useState } from 'react'
import { Pencil, UserPlus } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useSpeakersData, type Speaker } from '@/hooks/useSpeakersData'
import { SpeakerPerfilDialog } from './SpeakerPerfilDialog'
import { FuenteBadge, iniciales } from './speakerUtils'

type SpeakersTableProps = { eventoId: string }

export function SpeakersTable({ eventoId }: SpeakersTableProps) {
  const { speakers, loading, error, refetch } = useSpeakersData(eventoId)
  const [busqueda, setBusqueda] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [modo, setModo] = useState<'create' | 'edit'>('create')
  const [activo, setActivo] = useState<Speaker | null>(null)

  const filtrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase()
    if (!term) return speakers
    return speakers.filter((sp) =>
      [sp.nombre, sp.cargo, sp.empresa, sp.email]
        .filter(Boolean)
        .some((campo) => campo!.toLowerCase().includes(term)),
    )
  }, [speakers, busqueda])

  function abrirCrear() {
    setModo('create')
    setActivo(null)
    setDialogOpen(true)
  }

  function abrirEditar(speaker: Speaker) {
    setModo('edit')
    setActivo(speaker)
    setDialogOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, cargo, empresa o email…"
          className="h-8 w-72"
        />
        <Button onClick={abrirCrear}>
          <UserPlus /> Agregar speaker
        </Button>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {!loading && speakers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No hay speakers registrados aún.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Foto</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>País</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Sesiones</TableHead>
                <TableHead>Fuente</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((__, c) => (
                      <TableCell key={c}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}

              {!loading && filtrados.length === 0 && speakers.length > 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Ningún speaker coincide con la búsqueda.
                  </TableCell>
                </TableRow>
              )}

              {!loading &&
                filtrados.map((sp) => (
                  <TableRow key={sp.id}>
                    <TableCell>
                      <Avatar size="sm">
                        {sp.foto_url && (
                          <AvatarImage src={sp.foto_url} alt={sp.nombre} />
                        )}
                        <AvatarFallback>{iniciales(sp.nombre)}</AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => abrirEditar(sp)}
                        className="font-semibold hover:underline"
                      >
                        {sp.nombre || 'Sin nombre'}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {sp.cargo ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {sp.empresa ?? '—'}
                    </TableCell>
                    <TableCell>{sp.pais ?? '—'}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {sp.email ?? '—'}
                    </TableCell>
                    <TableCell>
                      {sp.sesionesEnEvento > 0 ? (
                        <Badge variant="secondary">
                          {sp.sesionesEnEvento} sesión
                          {sp.sesionesEnEvento === 1 ? '' : 'es'}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Sin sesiones
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <FuenteBadge fuente={sp.fuente} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar ${sp.nombre}`}
                        onClick={() => abrirEditar(sp)}
                      >
                        <Pencil />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      )}

      <SpeakerPerfilDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={modo}
        speaker={activo}
        eventoId={eventoId}
        onSaved={refetch}
      />
    </div>
  )
}
