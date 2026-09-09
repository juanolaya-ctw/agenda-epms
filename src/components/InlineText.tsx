import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type InlineTextProps = {
  value: string
  onSave: (next: string) => Promise<void>
  placeholder?: string
  /** Si devuelve false, la celda se marca en rojo y no guarda. */
  validate?: (v: string) => boolean
  type?: 'text' | 'date'
  displayClassName?: string
}

/** Celda editable inline estilo hoja de cálculo: clic → input, Enter/blur
 *  guarda, Escape cancela. */
export function InlineText({
  value,
  onSave,
  placeholder = '—',
  validate,
  type = 'text',
  displayClassName,
}: InlineTextProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [ok, setOk] = useState(false)

  const invalid = editing && validate ? !validate(draft.trim()) : false

  function start() {
    setDraft(value)
    setEditing(true)
  }

  function cancel() {
    setDraft(value)
    setEditing(false)
  }

  async function commit() {
    if (!editing || saving) return
    const next = draft.trim()
    if (next === value.trim()) {
      setEditing(false)
      return
    }
    if (validate && !validate(next)) return // sigue en edición, en rojo
    setSaving(true)
    try {
      await onSave(next)
      setOk(true)
      setTimeout(() => setOk(false), 1200)
    } catch {
      // el padre revierte el valor mostrado y hace toast
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={start}
        className={cn(
          'flex w-full items-center gap-1 rounded px-1 py-0.5 text-left transition-colors hover:cursor-pointer hover:bg-muted/40',
          displayClassName,
        )}
      >
        <span className="truncate">{value || placeholder}</span>
        {ok && <Check className="size-3 shrink-0 text-status-approved" />}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        type={type}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void commit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
          }
        }}
        disabled={saving}
        aria-invalid={invalid}
        className={cn(
          'h-7 text-xs',
          invalid &&
            'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30',
        )}
      />
      {saving && (
        <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
      )}
    </div>
  )
}
