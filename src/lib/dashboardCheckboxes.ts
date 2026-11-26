/**
 * Conteos de los KPI de toolkit/fotos del dashboard.
 * El caller solo pasa speakers asignados a sesiones de ESTE evento y los
 * ids de propiedades_custom de ESTE evento. Un checkbox de otro evento,
 * o un speaker que no está en esas sesiones, no suma.
 */

export function esValorCheckboxMarcado(valor: unknown): boolean {
  return valor === true || valor === 'true'
}

export type ValorCheckbox = {
  speakerId: string | null
  propiedadId: string
  valor: unknown
}

export function contarCheckboxesDeEvento(
  asignados: ReadonlySet<string>,
  valores: readonly ValorCheckbox[],
  ids: { toolkit?: string; publicaron?: string; fotos?: string },
): { toolkit: number; publicaron: number; fotos: number } {
  const toolkit = new Set<string>()
  const publicaron = new Set<string>()
  const fotos = new Set<string>()
  for (const row of valores) {
    if (
      !row.speakerId ||
      !asignados.has(row.speakerId) ||
      !esValorCheckboxMarcado(row.valor)
    ) {
      continue
    }
    if (ids.toolkit && row.propiedadId === ids.toolkit) toolkit.add(row.speakerId)
    if (ids.publicaron && row.propiedadId === ids.publicaron) {
      publicaron.add(row.speakerId)
    }
    if (ids.fotos && row.propiedadId === ids.fotos) fotos.add(row.speakerId)
  }
  return {
    toolkit: toolkit.size,
    publicaron: publicaron.size,
    fotos: fotos.size,
  }
}
