import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { SesionSpeaker } from '@/hooks/useSesionesData'

function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join('')
}

function SpeakerAvatar({
  speaker,
  compact = false,
}: {
  speaker: SesionSpeaker
  compact?: boolean
}) {
  return (
    <Avatar size="sm" className={compact ? '!size-4' : undefined}>
      {speaker.fotoUrl && (
        <AvatarImage src={speaker.fotoUrl} alt={speaker.nombre} />
      )}
      <AvatarFallback className={compact ? 'text-[8px]' : undefined}>
        {iniciales(speaker.nombre)}
      </AvatarFallback>
    </Avatar>
  )
}

function SpeakersTooltipContent({ speakers }: { speakers: SesionSpeaker[] }) {
  return (
    <TooltipContent className="flex-col items-start gap-0.5">
      {speakers.map((speaker) => (
        <span key={speaker.sesionSpeakerId}>
          {speaker.nombre} · {speaker.rol}
        </span>
      ))}
    </TooltipContent>
  )
}

type SpeakersAvatarStackProps = {
  speakers: SesionSpeaker[]
  className?: string
  emptyLabel?: boolean
}

export function SpeakersAvatarStack({
  speakers,
  className,
  emptyLabel = true,
}: SpeakersAvatarStackProps) {
  if (speakers.length === 0) {
    return emptyLabel ? (
      <span className={cn('text-xs text-muted-foreground', className)}>
        Sin asignar
      </span>
    ) : null
  }

  const visibles = speakers.slice(0, 3)
  const restantes = speakers.length - visibles.length

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn('inline-flex w-fit', className)}
            aria-label={`${speakers.length} speakers asignados`}
          >
            <AvatarGroup>
              {visibles.map((speaker) => (
                <SpeakerAvatar
                  key={speaker.sesionSpeakerId}
                  speaker={speaker}
                />
              ))}
              {restantes > 0 && (
                <AvatarGroupCount className="text-[10px]">
                  +{restantes}
                </AvatarGroupCount>
              )}
            </AvatarGroup>
          </div>
        </TooltipTrigger>
        <SpeakersTooltipContent speakers={speakers} />
      </Tooltip>
    </TooltipProvider>
  )
}

export function SpeakersNames({
  speakers,
  className,
}: {
  speakers: SesionSpeaker[]
  className?: string
}) {
  if (speakers.length === 0) {
    return (
      <span className={cn('text-xs text-muted-foreground', className)}>
        Sin asignar
      </span>
    )
  }

  const visibles = speakers.length <= 2 ? speakers : speakers.slice(0, 1)
  const restantes = speakers.length - visibles.length

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-1 whitespace-nowrap text-xs',
        className,
      )}
    >
      {visibles.map((speaker, index) => (
        <div
          key={speaker.sesionSpeakerId}
          className="flex min-w-0 items-center gap-1.5"
        >
          {index > 0 && <span>,</span>}
          <SpeakerAvatar speaker={speaker} />
          <span className="max-w-44 truncate">{speaker.nombre}</span>
        </div>
      ))}
      {restantes > 0 && (
        <>
          <span>,</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help text-muted-foreground underline decoration-dotted underline-offset-2">
                  +{restantes} más
                </span>
              </TooltipTrigger>
              <SpeakersTooltipContent speakers={speakers} />
            </Tooltip>
          </TooltipProvider>
        </>
      )}
    </div>
  )
}

export function SpeakerPrimaryName({
  speakers,
  className,
}: {
  speakers: SesionSpeaker[]
  className?: string
}) {
  const primero = speakers[0]
  if (!primero) return null
  const restantes = speakers.length - 1

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'flex min-w-0 items-center gap-1 text-[10px]',
              className,
            )}
          >
            <SpeakerAvatar speaker={primero} compact />
            <span className="truncate">
              {primero.nombre}
              {restantes > 0 && ` +${restantes} más`}
            </span>
          </div>
        </TooltipTrigger>
        <SpeakersTooltipContent speakers={speakers} />
      </Tooltip>
    </TooltipProvider>
  )
}
