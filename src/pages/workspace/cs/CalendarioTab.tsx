import { useParams } from 'react-router-dom'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useSesionesData } from '@/hooks/useSesionesData'
import { SesionesCalendarioView } from '@/pages/workspace/agenda/sesiones/SesionesCalendarioView'

export function CalendarioTab() {
  const { id } = useParams()
  const { workspace } = useWorkspace()
  const data = useSesionesData(id)

  const eventoRango = {
    inicio: workspace?.fechaInicio ?? '',
    fin: workspace?.fechaFin ?? '',
  }

  if (!id) return <div>Selecciona un evento para ver el calendario.</div>

  return (
    <SesionesCalendarioView
      data={data}
      eventoId={id}
      eventoRango={eventoRango}
      readOnly
    />
  )
}
