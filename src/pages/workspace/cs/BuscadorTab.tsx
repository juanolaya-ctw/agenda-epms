import { Navigate, useParams } from 'react-router-dom'
import { isUuid } from '@/lib/isUuid'
import { SpeakersTable } from '@/pages/workspace/agenda/speakers/SpeakersTable'

export function BuscadorTab() {
  const { id } = useParams()
  if (!id) return <div>Selecciona un evento para ver los speakers.</div>
  if (!isUuid(id)) return <Navigate to="/home" replace />
  return <SpeakersTable eventoId={id} readOnly />
}
