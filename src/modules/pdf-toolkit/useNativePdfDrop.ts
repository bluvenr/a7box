/**
 * PDF Toolkit — Native file drop hook
 * Tauri native drag-drop (triple leak protection) + browser HTML5 fallback.
 * Filters dropped paths/files by kind ('pdf' | 'image') and reads them into File[].
 */

import { useState, useEffect, useRef, useCallback, type DragEvent } from 'react'
import { isTauri } from '../../shared/utils'
import { IMAGE_MIME, isPdfName, isImageName, pathBaseName, fileExt } from './utils'

export type DropKind = 'pdf' | 'image'

interface Options {
  kind: DropKind
  onFiles: (files: File[]) => void
  /** Whether the enclosing page is active (guards background drops) */
  active?: boolean
}

function acceptName(kind: DropKind, name: string): boolean {
  return kind === 'pdf' ? isPdfName(name) : isImageName(name)
}

/** Read dropped native paths into File[] (Tauri only). */
async function readPaths(paths: string[], kind: DropKind): Promise<File[]> {
  const { readFile } = await import('@tauri-apps/plugin-fs')
  const files: File[] = []
  for (const p of paths) {
    try {
      const name = pathBaseName(p)
      if (!acceptName(kind, name)) continue
      const data = await readFile(p)
      const mime = kind === 'pdf' ? 'application/pdf' : (IMAGE_MIME[fileExt(name)] || 'image/png')
      const blob = new Blob([data], { type: mime })
      files.push(new File([blob], name, { type: mime }))
    } catch { /* skip unreadable files */ }
  }
  return files
}

export function useNativeFileDrop({ kind, onFiles, active = true }: Options) {
  const [isDragging, setIsDragging] = useState(false)

  // Stable refs so the listener never needs re-registration on prop changes
  const onFilesRef = useRef(onFiles)
  onFilesRef.current = onFiles
  const activeRef = useRef(active)
  activeRef.current = active
  const kindRef = useRef(kind)
  kindRef.current = kind

  // ── Tauri native drag-drop with triple protection ──
  useEffect(() => {
    if (!isTauri()) return
    let unlistenFn: (() => void) | undefined
    let cleanedUp = false
    ;(async () => {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview')
        if (cleanedUp) return // 1) after async await
        unlistenFn = await getCurrentWebview().onDragDropEvent(async (event) => {
          if (cleanedUp || !activeRef.current) return // 2) inside callback
          if (event.payload.type === 'over') {
            setIsDragging(true)
          } else if (event.payload.type === 'leave') {
            setIsDragging(false)
          } else if (event.payload.type === 'drop') {
            setIsDragging(false)
            const files = await readPaths(event.payload.paths, kindRef.current)
            if (cleanedUp || !activeRef.current) return
            if (files.length > 0) onFilesRef.current(files)
          }
        })
        if (cleanedUp) { // 3) late registration after cleanup
          unlistenFn?.()
          unlistenFn = undefined
        }
      } catch { /* not supported */ }
    })()
    return () => {
      cleanedUp = true
      if (unlistenFn) {
        unlistenFn()
        unlistenFn = undefined
      }
    }
  }, [])

  // ── Browser HTML5 fallback handlers ──
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isTauri()) setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isTauri()) setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (isTauri()) return // native listener handles it
    const files = Array.from(e.dataTransfer.files).filter((f) => acceptName(kindRef.current, f.name))
    if (files.length > 0) onFilesRef.current(files)
  }, [])

  return {
    isDragging,
    dragHandlers: {
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  }
}