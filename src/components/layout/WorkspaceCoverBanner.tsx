import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useWorkspace } from '@/contexts/WorkspaceContext'

type WorkspaceCoverBannerProps = {
  eventoId: string
}

export function WorkspaceCoverBanner({ eventoId }: WorkspaceCoverBannerProps) {
  const { workspace, updateWorkspace } = useWorkspace()
  const [coverUrl, setCoverUrl] = useState<string | undefined>(
    workspace && workspace.id === eventoId ? workspace.coverUrl : undefined,
  )
  const [subiendo, setSubiendo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (workspace && workspace.id === eventoId) setCoverUrl(workspace.coverUrl)
  }, [workspace, eventoId])

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const ext =
      file.name.split('.').pop()?.toLowerCase() ||
      file.type.split('/')[1] ||
      'jpg'
    const filename = `covers/evento-${eventoId}-${Date.now()}.${ext}`

    setSubiendo(true)
    try {
      const { error: uploadError } = await supabase.storage
        .from('speaker-fotos')
        .upload(filename, file, {
          contentType: file.type,
          upsert: true,
        })
      if (uploadError) throw new Error(uploadError.message)

      const { data } = supabase.storage
        .from('speaker-fotos')
        .getPublicUrl(filename)

      const { error: updateError } = await supabase
        .from('eventos')
        .update({ cover_url: data.publicUrl })
        .eq('id', eventoId)
      if (updateError) throw new Error(updateError.message)

      setCoverUrl(data.publicUrl)
      updateWorkspace(eventoId, { coverUrl: data.publicUrl })
      toast.success('Cover actualizado')
    } catch (err) {
      toast.error(
        `No se pudo cambiar el cover: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div className="group relative h-[200px] w-full overflow-hidden">
      {coverUrl ? (
        <img src={coverUrl} alt="" className="size-full object-cover" />
      ) : (
        <div className="size-full bg-gradient-to-r from-slate-800 to-slate-600" />
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />
      <button
        type="button"
        disabled={subiendo}
        onClick={() => fileInputRef.current?.click()}
        className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-60"
      >
        <ImageIcon className="size-3.5" />
        {subiendo ? 'Subiendo…' : 'Cambiar cover'}
      </button>
    </div>
  )
}
