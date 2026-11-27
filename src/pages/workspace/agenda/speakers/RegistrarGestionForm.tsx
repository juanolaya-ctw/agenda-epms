import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { registrarGestion } from '@/hooks/useGestionesData'
import { ymdBogota } from '@/lib/bogotaDate'
import {
  defaultMarcarContactado,
  puedeMarcarContactado,
  type ResultadoRegistroGestion,
} from '@/lib/gestionForm'
import {
  GESTION_TIPOS,
  GESTION_TIPO_LABELS,
  type GestionTipo,
} from '@/lib/gestionTipos'
import type { EventoSpeakerEstado } from '@/lib/eventoSpeakerEstado'

type RegistrarGestionFormProps = {
  eventoId: string
  speakerId: string
  estadoEnEvento: EventoSpeakerEstado | null
  onRegistered: (resultado: ResultadoRegistroGestion) => void
  /** Compacto para diálogo rápido. */
  compact?: boolean
}

export function RegistrarGestionForm({
  eventoId,
  speakerId,
  estadoEnEvento,
  onRegistered,
  compact = false,
}: RegistrarGestionFormProps) {
  const puedeMarcar = puedeMarcarContactado(estadoEnEvento)
  const [tipo, setTipo] = useState<GestionTipo>('correo')
  const [ocurridaYmd, setOcurridaYmd] = useState(() => ymdBogota())
  const [nota, setNota] = useState('')
  const [proximaYmd, setProximaYmd] = useState('')
  const [proximaNota, setProximaNota] = useState('')
  const [marcarContactado, setMarcarContactado] = useState(() =>
    defaultMarcarContactado(estadoEnEvento),
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setMarcarContactado(defaultMarcarContactado(estadoEnEvento))
  }, [estadoEnEvento, speakerId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const resultado: ResultadoRegistroGestion = {
        proximaYmd: proximaYmd.trim() || null,
        proximaNota: proximaNota.trim() || null,
        marcoContactado: puedeMarcar && marcarContactado,
      }
      await registrarGestion(eventoId, speakerId, {
        tipo,
        ocurridaYmd,
        nota,
        proximaYmd: resultado.proximaYmd,
        proximaNota: resultado.proximaNota,
        marcarContactado: resultado.marcoContactado,
      })
      toast.success('Gestión registrada')
      setNota('')
      setProximaYmd('')
      setProximaNota('')
      setOcurridaYmd(ymdBogota())
      setTipo('correo')
      onRegistered(resultado)
    } catch (err) {
      toast.error(
        `No se pudo registrar: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className={compact ? 'flex flex-col gap-2.5' : 'flex flex-col gap-3'}
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Tipo</Label>
          <Select
            value={tipo}
            onValueChange={(v) => setTipo(v as GestionTipo)}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GESTION_TIPOS.map((t) => (
                <SelectItem key={t} value={t}>
                  {GESTION_TIPO_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Fecha</Label>
          <Input
            type="date"
            className="h-8"
            value={ocurridaYmd}
            onChange={(e) => setOcurridaYmd(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Nota</Label>
        <Textarea
          rows={compact ? 2 : 3}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Qué se habló / siguiente paso…"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Próximo follow-up</Label>
          <Input
            type="date"
            className="h-8"
            value={proximaYmd}
            onChange={(e) => setProximaYmd(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Nota del follow-up</Label>
          <Input
            className="h-8"
            value={proximaNota}
            onChange={(e) => setProximaNota(e.target.value)}
            disabled={!proximaYmd}
            placeholder="Opcional"
          />
        </div>
      </div>
      {puedeMarcar && (
        <label className="flex items-center gap-2 text-xs font-medium">
          <Checkbox
            checked={marcarContactado}
            onCheckedChange={(c) => setMarcarContactado(c === true)}
          />
          Marcar como Contactado
        </label>
      )}
      <Button type="submit" size="sm" className="w-fit" disabled={saving}>
        {saving ? 'Guardando…' : 'Registrar gestión'}
      </Button>
    </form>
  )
}
