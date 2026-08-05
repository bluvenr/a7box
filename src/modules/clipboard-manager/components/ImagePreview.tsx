/**
 * Clipboard Manager — Thumbnail preview loading a stored image via data URL.
 */
import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import * as bridge from '../bridge'

export function ImagePreview({ fileName, size = 40 }: { fileName: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    void bridge.imageDataUrl(fileName).then((url) => {
      if (!cancelled) setSrc(url)
      if (!url && !cancelled) setFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [fileName])

  if (failed) {
    return (
      <div
        className="flex items-center justify-center rounded bg-bg-hover text-text-disabled"
        style={{ width: size, height: size }}
      >
        <ImageOff size={14} />
      </div>
    )
  }

  if (!src) {
    return (
      <div
        className="animate-pulse rounded bg-bg-hover"
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <img
      src={src}
      alt=""
      className="rounded border border-border-subtle object-cover"
      style={{ width: size, height: size }}
      draggable={false}
    />
  )
}
