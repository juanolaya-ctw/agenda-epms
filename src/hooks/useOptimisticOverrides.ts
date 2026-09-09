import { useState } from 'react'
import { toast } from 'sonner'

/**
 * Overrides optimistas por celda para edición inline: se muestra el valor
 * nuevo al instante y se revierte si el guardado falla. Sin refetch por celda.
 * Key externa = id de fila; key interna = nombre de campo.
 */
export function useOptimisticOverrides<K extends string>() {
  const [overrides, setOverrides] = useState<
    Record<string, Partial<Record<K, unknown>>>
  >({})

  function get(rowId: string, key: K, fallback: unknown): unknown {
    const row = overrides[rowId]
    if (row && key in row) return row[key]
    return fallback
  }

  function set(rowId: string, key: K, value: unknown) {
    setOverrides((prev) => ({
      ...prev,
      [rowId]: { ...prev[rowId], [key]: value },
    }))
  }

  /** Aplica el override, ejecuta `save`, y revierte + toast si falla. Re-lanza
   *  el error para que el llamador (p. ej. InlineText) cierre la edición. */
  async function commit(
    rowId: string,
    key: K,
    nextValue: unknown,
    prevValue: unknown,
    save: () => Promise<void>,
  ): Promise<void> {
    set(rowId, key, nextValue)
    try {
      await save()
    } catch (err) {
      set(rowId, key, prevValue)
      toast.error(
        `No se pudo guardar: ${err instanceof Error ? err.message : String(err)}`,
      )
      throw err
    }
  }

  return { get, commit }
}
