/**
 * PDF Toolkit — Engine
 * Lazy-loaded pdf.js (rendering) + pdf-lib (structure manipulation).
 * All heavy dependencies are dynamically imported and cached so they are
 * code-split out of the main bundle and only fetched when the module is used.
 */

import type { PDFDocumentProxy } from 'pdfjs-dist'
import { type OutputFormat, type PageSize, PAGE_SIZES, fileExt } from './utils'

// ── Cached lazy loaders ──

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null

/** Load pdf.js once and wire its worker (Vite emits the worker as an asset URL). */
export function getPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist')
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      return pdfjs
    })()
  }
  return pdfjsPromise
}

let pdfLibPromise: Promise<typeof import('pdf-lib')> | null = null

export function getPdfLib(): Promise<typeof import('pdf-lib')> {
  if (!pdfLibPromise) pdfLibPromise = import('pdf-lib')
  return pdfLibPromise
}

// ── pdf.js: loading & rendering ──

/** Open a PDF for rendering / info. Caller owns the proxy and must destroy() it. */
export async function loadPdf(file: File): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfjs()
  const data = new Uint8Array(await file.arrayBuffer())
  return pdfjs.getDocument({ data }).promise
}

export async function getPdfInfo(file: File): Promise<{ pageCount: number; size: number }> {
  const pdf = await loadPdf(file)
  try {
    return { pageCount: pdf.numPages, size: file.size }
  } finally {
    await pdf.destroy()
  }
}

/** Render a single page (1-based) to a raster Blob via an offscreen canvas. */
export async function renderPageToBlob(
  pdf: PDFDocumentProxy,
  pageNum: number,
  scale: number,
  format: OutputFormat,
  quality: number,
): Promise<Blob> {
  const page = await pdf.getPage(pageNum)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  // JPEG has no alpha channel — fill white to avoid black backgrounds
  if (format === 'image/jpeg') {
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  await page.render({ canvasContext: ctx, viewport }).promise
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Render failed'))), format, quality)
  })
  page.cleanup()
  return blob
}

// ── Canvas helper: normalize any image to PNG bytes (pdf-lib embeds PNG/JPG only) ──

async function imageToPngBytes(file: File): Promise<Uint8Array> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image()
    const url = URL.createObjectURL(file)
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Invalid image')) }
    image.src = url
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.drawImage(img, 0, 0)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png')
  })
  return new Uint8Array(await blob.arrayBuffer())
}

/** Return embeddable bytes + kind for pdf-lib (PNG/JPG passthrough, others → PNG). */
async function toEmbeddable(file: File): Promise<{ data: Uint8Array; kind: 'png' | 'jpg' }> {
  const ext = fileExt(file.name)
  const raw = new Uint8Array(await file.arrayBuffer())
  if (ext === 'png') return { data: raw, kind: 'png' }
  if (ext === 'jpg' || ext === 'jpeg') return { data: raw, kind: 'jpg' }
  return { data: await imageToPngBytes(file), kind: 'png' }
}

// ── pdf-lib: image → PDF ──

export interface ImagesToPdfOpts {
  pageSize: PageSize
  margin: number // points
}

/** Combine ordered images into a single PDF. Returns saved PDF bytes. */
export async function imagesToPdf(files: File[], opts: ImagesToPdfOpts): Promise<Uint8Array> {
  const { PDFDocument } = await getPdfLib()
  const doc = await PDFDocument.create()
  const preset = PAGE_SIZES.find((p) => p.value === opts.pageSize)!
  const margin = Math.max(0, opts.margin)

  for (const file of files) {
    const { data, kind } = await toEmbeddable(file)
    const img = kind === 'png' ? await doc.embedPng(data) : await doc.embedJpg(data)
    const iw = img.width
    const ih = img.height

    const pageW = opts.pageSize === 'fit' ? iw + margin * 2 : preset.w
    const pageH = opts.pageSize === 'fit' ? ih + margin * 2 : preset.h
    const page = doc.addPage([pageW, pageH])

    const availW = Math.max(1, pageW - margin * 2)
    const availH = Math.max(1, pageH - margin * 2)
    const ratio = Math.min(availW / iw, availH / ih)
    const dw = iw * ratio
    const dh = ih * ratio
    page.drawImage(img, {
      x: (pageW - dw) / 2,
      y: (pageH - dh) / 2,
      width: dw,
      height: dh,
    })
  }

  return doc.save()
}

// ── pdf-lib: merge ──

/** Merge multiple PDFs (in order) into one. Returns saved PDF bytes. */
export async function mergePdfs(files: File[]): Promise<Uint8Array> {
  const { PDFDocument } = await getPdfLib()
  const out = await PDFDocument.create()
  for (const file of files) {
    const src = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()))
    const pages = await out.copyPages(src, src.getPageIndices())
    pages.forEach((p) => out.addPage(p))
  }
  return out.save()
}

// ── pdf-lib: split ──

/** Split a PDF into multiple PDFs, one per page group (1-based page numbers). */
export async function splitPdf(file: File, groups: number[][]): Promise<Uint8Array[]> {
  const { PDFDocument } = await getPdfLib()
  const src = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()))
  const total = src.getPageCount()
  const results: Uint8Array[] = []
  for (const group of groups) {
    const indices = group.map((n) => n - 1).filter((i) => i >= 0 && i < total)
    if (indices.length === 0) continue
    const out = await PDFDocument.create()
    const pages = await out.copyPages(src, indices)
    pages.forEach((p) => out.addPage(p))
    results.push(await out.save())
  }
  return results
}

// ── pdf-lib: page management (reorder / rotate / delete) ──

/** One output page: source index (0-based) + extra rotation in degrees. */
export interface PageOp {
  from: number
  rotation: number
}

/**
 * Rebuild a PDF from an ordered list of page ops. Deletion is expressed by
 * omitting pages; rotation is added on top of each page's existing rotation.
 */
export async function applyPageOps(file: File, ops: PageOp[]): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await getPdfLib()
  const src = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()))
  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, ops.map((o) => o.from))
  pages.forEach((p, i) => {
    const existing = p.getRotation().angle
    p.setRotation(degrees(((existing + ops[i].rotation) % 360 + 360) % 360))
    out.addPage(p)
  })
  return out.save()
}