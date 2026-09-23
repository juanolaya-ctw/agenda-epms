import { useParams } from 'react-router-dom'
import { SpeakersTable } from '@/pages/workspace/agenda/speakers/SpeakersTable'

export function BuscadorTab() {
  const { id } = useParams()
  if (!id) return <div>Selecciona un evento para ver los speakers.</div>
  return <SpeakersTable eventoId={id} readOnly />
}
