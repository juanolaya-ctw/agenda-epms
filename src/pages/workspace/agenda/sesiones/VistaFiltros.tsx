import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { OpcionCatalogo, Sesion } from '@/hooks/useSesionesData'
import { formatDiaLargo } from './format'

const TODOS = '__todos__'

type VistaFiltrosProps = {
  escenarios: OpcionCatalogo[]
  dias: string[]
  escenarioId: string | null
  dia: string | null
  onEscenarioChange: (id: string | null) => void
  onDiaChange: (dia: string | null) => void
}

export function VistaFiltros({
  escenarios,
  dias,
  escenarioId,
  dia,
  onEscenarioChange,
  onDiaChange,
}: VistaFiltrosProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={escenarioId ?? TODOS}
        onValueChange={(value) =>
          onEscenarioChange(value === TODOS ? null : value)
        }
      >
        <SelectTrigger className="h-8 w-[180px] text-xs" aria-label="Escenario">
          <SelectValue placeholder="Escenario" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todos los escenarios</SelectItem>
          {escenarios.map((escenario) => (
            <SelectItem key={escenario.id} value={escenario.id}>
              {escenario.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={dia ?? TODOS}
        onValueChange={(value) => onDiaChange(value === TODOS ? null : value)}
      >
        <SelectTrigger className="h-8 w-[180px] text-xs" aria-label="Día">
          <SelectValue placeholder="Día" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todos los días</SelectItem>
          {dias.map((d) => (
            <SelectItem key={d} value={d}>
              {formatDiaLargo(d)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function filtrarSesionesVista(
  sesiones: Sesion[],
  escenarioId: string | null,
  dia: string | null,
): Sesion[] {
  return sesiones.filter((sesion) => {
    if (escenarioId && sesion.escenarioId !== escenarioId) return false
    if (dia && sesion.dia !== dia) return false
    return true
  })
}
