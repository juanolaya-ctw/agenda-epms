/** Una quote se edita en el workspace solo si su sesión es de ese evento. */
export function quotePerteneceAlEvento(
  eventoIdDeLaSesion: string | null | undefined,
  eventoIdWorkspace: string | null | undefined,
): boolean {
  if (!eventoIdWorkspace || !eventoIdDeLaSesion) return false
  return eventoIdDeLaSesion === eventoIdWorkspace
}
