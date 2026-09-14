import { useState } from 'react'
import { Columns3, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { arrayMove } from './speakersColumnOrder'

export type ColumnOrderItem = { id: string; label: string }

type ColumnOrderPopoverProps = {
  columns: ColumnOrderItem[]
  onReorder: (ids: string[]) => void
}

export function ColumnOrderPopover({
  columns,
  onReorder,
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
      <PopoverContent align="start" className="w-72">
        <p className="mb-2 text-xs text-muted-foreground">
          Arrastra para reordenar las columnas.
        </p>
        <ul className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
          {columns.map((col) => (
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
                applyDrop(col.id, e.dataTransfer.getData('text/plain') || draggingId)
              }}
              onDragEnd={clearDrag}
              className={cn(
                'flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-sm select-none active:cursor-grabbing',
                draggingId === col.id && 'opacity-40',
                overId === col.id &&
                  draggingId !== col.id &&
                  'bg-muted ring-1 ring-border',
              )}
            >
              <span
                className="inline-flex size-6 shrink-0 items-center justify-center text-muted-foreground"
                aria-hidden
              >
                <GripVertical className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate">{col.label}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
