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
                <Avatar key={speaker.sesionSpeakerId} size="sm">
                  {speaker.fotoUrl && (
                    <AvatarImage src={speaker.fotoUrl} alt={speaker.nombre} />
                  )}
                  <AvatarFallback>{iniciales(speaker.nombre)}</AvatarFallback>
                </Avatar>
              ))}
              {restantes > 0 && (
                <AvatarGroupCount className="text-[10px]">
                  +{restantes}
                </AvatarGroupCount>
              )}
            </AvatarGroup>
          </div>
        </TooltipTrigger>
        <TooltipContent className="flex-col items-start gap-0.5">
          {speakers.map((speaker) => (
            <span key={speaker.sesionSpeakerId}>
              {speaker.nombre} · {speaker.rol}
            </span>
          ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
