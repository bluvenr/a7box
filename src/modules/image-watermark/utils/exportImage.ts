/**
 * Image Watermark Module — Export Utilities
 * Handles single and batch image export with Tauri integration.
 */

import type { WatermarkConfig, WatermarkImage } from '../types'
import { renderToBlob, getOutputExt } from './renderWatermark'
import { isTauri } from '../../../shared/utils'

/** Build output filename from original name + suffix */
export function buildFilename(originalName: string, config: WatermarkConfig): string {
  const baseName = originalName.replace(/\.[^.]+$/, '')
  const ext = getOutputExt(config, originalName)
  return `${baseName}${config.output.suffix}.${ext}`
}

/** Export a single image — triggers save dialog in Tauri, download in browser */
export async function exportSingle(
  img: WatermarkImage,
  config: WatermarkConfig,
  toast: (msg: string) => void,
  t: (key: string, opts?: Record<string, unknown>) => string,
): Promise<void> {
  if (!img.bitmap) return
  const blob = await renderToBlob(img.bitmap, config, img.file.name)
  const filename = buildFilename(img.file.name, config)

  if (isTauri()) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const { writeFile } = await import('@tauri-apps/plugin-fs')
      const filePath = await save({ defaultPath: filename })
      if (filePath) {
        const data = new Uint8Array(await blob.arrayBuffer())
        await writeFile(filePath, data)
        toast(t('modules.imageWatermark.ui.toastSaved', { defaultValue: 'Saved successfully' }))
      }
      return
    } catch { /* fallback to browser download */ }
  }

  // Browser fallback
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Batch export all images to a directory (Tauri) or download each (browser) */
export async function exportBatch(
  images: WatermarkImage[],
  config: WatermarkConfig,
  onProgress: (done: number, total: number) => void,
  toast: (msg: string) => void,
  t: (key: string, opts?: Record<string, unknown>) => string,
): Promise<void> {
  const validImages = images.filter((img) => img.bitmap)
  if (validImages.length === 0) return

  if (isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const { writeFile } = await import('@tauri-apps/plugin-fs')
      const dir = await open({ directory: true, multiple: false })
      if (!dir) return

      let done = 0
      for (const img of validImages) {
        if (!img.bitmap) continue
        const blob = await renderToBlob(img.bitmap, config, img.file.name)
        const filename = buildFilename(img.file.name, config)
        const data = new Uint8Array(await blob.arrayBuffer())
        await writeFile(`${dir}/${filename}`, data)
        done++
        onProgress(done, validImages.length)
      }
      toast(t('modules.imageWatermark.ui.toastBatchDone', { count: done, defaultValue: 'Exported {{count}} images' }))
      return
    } catch { /* fallback to browser */ }
  }

  // Browser fallback: download each
  let done = 0
  for (const img of validImages) {
    if (!img.bitmap) continue
    const blob = await renderToBlob(img.bitmap, config, img.file.name)
    const filename = buildFilename(img.file.name, config)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    done++
    onProgress(done, validImages.length)
    // Small delay to avoid browser blocking multiple downloads
    await new Promise((r) => setTimeout(r, 200))
  }
  toast(t('modules.imageWatermark.ui.toastBatchDone', { count: done, defaultValue: 'Exported {{count}} images' }))
}
