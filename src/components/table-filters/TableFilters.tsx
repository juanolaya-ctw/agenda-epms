import { useState } from 'react'
import { Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type FiltroTipo = 'texto' | 'select' | 'boolean' | 'fecha'

export type FiltroColumna = {
  /** key del campo tal como lo resuelve el `getVal` de la tabla */
  campo: string
  etiqueta: string
  tipo: FiltroTipo
  /** valores para tipo 'select' */
  opciones?: string[]
}

export type FiltroOperador =
  | 'igual'
  | 'contiene'
  | 'vacio'
  | 'no_vacio'
  | 'antes'
  | 'despues'

export type FiltroActivo = {
  campo: string
  operador: FiltroOperador
  valor?: string | boolean
}

const OPERADORES_POR_TIPO: Record<
  FiltroTipo,
  { value: FiltroOperador; label: string }[]
> = {
  texto: [
    { value: 'contiene', label: 'contiene' },
    { value: 'igual', label: 'es igual a' },
    { value: 'vacio', label: 'está vacío' },
    { value: 'no_vacio', label: 'tiene dato' },
  ],
  select: [
    { value: 'igual', label: 'es' },
    { value: 'vacio', label: 'está vacío' },
    { value: 'no_vacio', label: 'tiene dato' },
  ],
  boolean: [{ value: 'igual', label: 'es' }],
  fecha: [
    { value: 'igual', label: 'es' },
    { value: 'antes', label: 'antes de' },
    { value: 'despues', label: 'después de' },
    { value: 'vacio', label: 'está vacío' },
    { value: 'no_vacio', label: 'tiene dato' },
  ],
}

const SIN_VALOR: FiltroOperador[] = ['vacio', 'no_vacio']

// ─── Aplicación en memoria ─────────────────────────────────────────────────
function esVacio(raw: unknown): boolean {
  return (
    raw === null ||
    raw === undefined ||
    raw === '' ||
    raw === false ||
    (Array.isArray(raw) && raw.length === 0)
  )
}

function coerceBool(raw: unknown): boolean {
  return raw === true || raw === 'true'
}

/** true si la fila cumple TODOS los filtros (AND). */
export function filaPasaFiltros(
  getVal: (campo: string) => unknown,
  filtros: FiltroActivo[],
): boolean {
  return filtros.every((f) => {
    const raw = getVal(f.campo)
    switch (f.operador) {
      case 'vacio':
        return esVacio(raw)
      case 'no_vacio':
        return !esVacio(raw)
      case 'igual':
        if (typeof f.valor === 'boolean') return coerceBool(raw) === f.valor
        return (
          String(raw ?? '').toLowerCase() ===
          String(f.valor ?? '').toLowerCase()
        )
      case 'contiene':
        return String(raw ?? '')
          .toLowerCase()
          .includes(String(f.valor ?? '').toLowerCase())
      case 'antes':
        return typeof raw === 'string' && raw !== '' && raw < String(f.valor ?? '')
      case 'despues':
        return typeof raw === 'string' && raw !== '' && raw > String(f.valor ?? '')
      default:
        return true
    }
  })
}

// ─── Presentación de un filtro activo ──────────────────────────────────────
function describeFiltro(
  filtro: FiltroActivo,
  columnas: FiltroColumna[],
): string {
  const col = columnas.find((c) => c.campo === filtro.campo)
  const etiqueta = col?.etiqueta ?? filtro.campo
  if (filtro.operador === 'vacio') return `${etiqueta}: vacío`
  if (filtro.operador === 'no_vacio') return `${etiqueta}: con dato`
  if (typeof filtro.valor === 'boolean') {
    return `${etiqueta}: ${filtro.valor ? 'Sí' : 'No'}`
  }
  const op =
    filtro.operador === 'contiene'
      ? '~'
      : filtro.operador === 'antes'
        ? '<'
        : filtro.operador === 'despues'
          ? '>'
          : '='
  return `${etiqueta} ${op} ${filtro.valor}`
}

// ─── Componente ───────────────────────────────────────────────────────────
type TableFiltersProps = {
  columnas: FiltroColumna[]
  filtros: FiltroActivo[]
  onChange: (filtros: FiltroActivo[]) => void
}

export function TableFilters({
  columnas,
  filtros,
  onChange,
}: TableFiltersProps) {
  const [campo, setCampo] = useState('')
  const [operador, setOperador] = useState<FiltroOperador>('igual')
  const [valor, setValor] = useState('')

  const colSel = columnas.find((c) => c.campo === campo)
  const operadores = colSel ? OPERADORES_POR_TIPO[colSel.tipo] : []
  const necesitaValor = colSel != null && !SIN_VALOR.includes(operador)

  function resetForm() {
    setCampo('')
    setOperador('igual')
    setValor('')
  }

  function elegirCampo(nextCampo: string) {
    setCampo(nextCampo)
    const col = columnas.find((c) => c.campo === nextCampo)
    setOperador(col ? OPERADORES_POR_TIPO[col.tipo][0].value : 'igual')
    setValor('')
  }

  function agregar() {
    if (!colSel) return
    const sinValor = SIN_VALOR.includes(operador)
    if (!sinValor && colSel.tipo !== 'boolean' && valor === '') return

    const nuevo: FiltroActivo = { campo, operador }
    if (!sinValor) {
      nuevo.valor =
        colSel.tipo === 'boolean' ? (valor || 'true') === 'true' : valor
    }
    onChange([...filtros, nuevo])
    resetForm()
  }

  function quitar(index: number) {
    onChange(filtros.filter((_, i) => i !== index))
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <Filter className="size-3.5" />
          Filtros
          {filtros.length > 0 && (
            <span className="ml-0.5 rounded-full bg-foreground px-1.5 text-[10px] font-semibold text-background">
              {filtros.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <div className="flex flex-col gap-3">
          {filtros.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Sin filtros. Se combinan con Y (todos deben cumplirse).
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {filtros.map((f, i) => (
                <span
                  key={`${f.campo}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                >
                  {describeFiltro(f, columnas)}
                  <button
                    type="button"
                    aria-label="Quitar filtro"
                    onClick={() => quitar(i)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div
            className={cn(
              'flex flex-col gap-2 border-t border-border pt-3',
              filtros.length === 0 && 'border-t-0 pt-0',
            )}
          >
            <Select value={campo} onValueChange={elegirCampo}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="+ Agregar filtro" />
              </SelectTrigger>
              <SelectContent>
                {columnas.map((c) => (
                  <SelectItem key={c.campo} value={c.campo}>
                    {c.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {colSel && (
              <>
                <Select
                  value={operador}
                  onValueChange={(v) => setOperador(v as FiltroOperador)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {operadores.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {necesitaValor && colSel.tipo === 'boolean' && (
                  <Select value={valor || 'true'} onValueChange={setValor}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Sí</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                )}

                {necesitaValor && colSel.tipo === 'select' && (
                  <Select value={valor} onValueChange={setValor}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Elegir valor…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(colSel.opciones ?? []).map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {necesitaValor && colSel.tipo === 'texto' && (
                  <Input
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    placeholder="Valor…"
                    className="h-8 text-xs"
                  />
                )}

                {necesitaValor && colSel.tipo === 'fecha' && (
                  <Input
                    type="date"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    className="h-8 text-xs"
                  />
                )}

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={resetForm}
                  >
                    Cancelar
                  </Button>
                  <Button type="button" size="sm" onClick={agregar}>
                    Agregar
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
