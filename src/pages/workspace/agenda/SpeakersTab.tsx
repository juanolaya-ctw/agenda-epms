import { useParams } from 'react-router-dom'
import { SpeakersTable } from './speakers/SpeakersTable'

export function SpeakersTab() {
  const { id } = useParams()
  if (!id) return <div>Selecciona un evento para ver los speakers.</div>
  return <SpeakersTable eventoId={id} />
}
