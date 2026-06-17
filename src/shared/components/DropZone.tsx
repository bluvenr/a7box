/**
 * A7Box DropZone Component
 * Reusable file drag-and-drop area for image compress, hash generator, etc.
 */

import { useState, useCallback, useRef } from 'react'
import { Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export interface DropZoneProps {
  /** Callback when files are selected/dropped */
  onFiles: (files: File[]) => void
  /** Accepted file types, e.g. 'image/*' or '.png,.jpg' */
  accept?: string
  /** Allow multiple files */
  multiple?: boolean
  /** Custom hint text (i18n key or plain text) */
  hint?: string
  /** Additional CSS classes */
  className?: string
}

export function DropZone({ onFiles, accept, multiple = true, hint, className = '' }: DropZoneProps) {
  const { t } = useTranslation()
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) {
        onFiles(multiple ? files : [files[0]])
      }
    },
    [onFiles, multiple]
  )

  const handleClick = () => inputRef.current?.click()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) {
      onFiles(multiple ? files : [files[0]])
    }
    // Reset so same file can be selected again
    e.target.value = ''
  }

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors ${
        isDragOver
          ? 'border-primary bg-primary/5'
          : 'border-border-base bg-bg-elevated hover:border-text-muted hover:bg-bg-hover'
      } ${className}`}
    >
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
          isDragOver ? 'bg-primary/20 text-primary' : 'bg-bg-hover text-text-muted'
        }`}
      >
        <Upload className="h-6 w-6" />
      </div>
      <div className="text-center">
        <p className="text-sm text-text-secondary">
          {hint || t('common.dropFileOrClick')}
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        className="hidden"
      />
    </div>
  )
}
