import { useState } from 'react'
import { Columns3, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { arrayMove, SPEAKERS_ALWAYS_VISIBLE } from './speakersColumnOrder'

export type ColumnOrderItem = { id: string; label: string }

type ColumnOrderPopoverProps = {
  columns: ColumnOrderItem[]
  hiddenIds: Set<string>
  onReorder: (ids: string[]) => void
  onToggleHidden: (id: string, hidden: boolean) => void
}

export function ColumnOrderPopover({
  columns,
  hiddenIds,
  onReorder,
  onToggleHidden,
}: ColumnOrderPopoverProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  function clearDrag() {
    setDraggingId(null)
    setOverId(null)
  }

  function applyDrop(targetId: string, fromId: string | null) {
    if (!fromId || fromId === targetId) {
      clearDrag()
      return
    }
    const ids = columns.map((c) => c.id)
    const from = ids.indexOf(fromId)
    const to = ids.indexOf(targetId)
    if (from >= 0 && to >= 0) onReorder(arrayMove(ids, from, to))
    clearDrag()
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <Columns3 className="size-3.5" />
          Columnas
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <p className="mb-2 text-xs text-muted-foreground">
          Arrastra para reordenar. Marca para mostrar u ocultar.
        </p>
        <ul className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
          {columns.map((col) => {
            const locked = SPEAKERS_ALWAYS_VISIBLE.has(col.id)
            const visible = locked || !hiddenIds.has(col.id)
            return (
              <li
                key={col.id}
                draggable
                onDragStart={(e) => {
                  setDraggingId(col.id)
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', col.id)
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (overId !== col.id) setOverId(col.id)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  applyDrop(
                    col.id,
                    e.dataTransfer.getData('text/plain') || draggingId,
                  )
                }}
                onDragEnd={clearDrag}
                className={cn(
                  'flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-sm select-none active:cursor-grabbing',
                  draggingId === col.id && 'opacity-40',
                  overId === col.id &&
                    draggingId !== col.id &&
                    'bg-muted ring-1 ring-border',
                  !visible && 'opacity-60',
                )}
              >
                <span
                  className="inline-flex size-6 shrink-0 items-center justify-center text-muted-foreground"
                  aria-hidden
                >
                  <GripVertical className="size-3.5" />
                </span>
                <Checkbox
                  checked={visible}
                  disabled={locked}
                  aria-label={
                    locked
                      ? `${col.label} (siempre visible)`
                      : visible
                        ? `Ocultar ${col.label}`
                        : `Mostrar ${col.label}`
                  }
                  onCheckedChange={(checked) => {
                    if (locked) return
                    onToggleHidden(col.id, checked !== true)
                  }}
                />
                <span className="min-w-0 flex-1 truncate">{col.label}</span>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
