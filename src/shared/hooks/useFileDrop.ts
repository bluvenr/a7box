/**
 * A7Box useFileDrop Hook
 * Reusable drag-and-drop file handling for any component
 */

import { useState, useCallback, type DragEvent } from 'react'

interface UseFileDropOptions {
  /** Accepted MIME types or extensions, e.g. ['image/png', '.jpg'] */
  accept?: string[]
  /** Callback when valid files are dropped */
  onFiles: (files: File[]) => void
}

export function useFileDrop({ accept, onFiles }: UseFileDropOptions) {
  const [isDragOver, setIsDragOver] = useState(false)

  const isValidFile = useCallback(
    (file: File): boolean => {
      if (!accept || accept.length === 0) return true
      return accept.some((type) => {
        if (type.startsWith('.')) {
          return file.name.toLowerCase().endsWith(type.toLowerCase())
        }
        if (type.endsWith('/*')) {
          return file.type.startsWith(type.replace('/*', '/'))
        }
        return file.type === type
      })
    },
    [accept]
  )

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      const files = Array.from(e.dataTransfer.files).filter(isValidFile)
      if (files.length > 0) {
        onFiles(files)
      }
    },
    [onFiles, isValidFile]
  )

  return {
    isDragOver,
    dragHandlers: {
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  }
}
