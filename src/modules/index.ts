/**
 * A7Box Module Registry Index
 */

// Text tools
import { qrCodeModule } from './qr-code'
import { markdownPreviewModule } from './markdown-preview'
import { textDiffModule } from './text-diff'
// Image tools
import { imageCompressModule } from './image-compress'
import { imageConvertModule } from './image-convert'
import { imageWatermarkModule } from './image-watermark'
// File tools
import { pdfToolkitModule } from './pdf-toolkit'
// Screen tools
import { screenshotModule } from './screenshot'
// Network tools
import { httpServerModule } from './http-server'
import { p2pTransferModule } from './p2p-transfer'
// Dev tools
import { jsonFormatterModule } from './json-formatter'
import { codeMinifyModule } from './code-minify'
import { regexTesterModule } from './regex-tester'
import { base64ToolModule } from './base64-tool'
import { urlCodecModule } from './url-codec'
import { jwtDecoderModule } from './jwt-decoder'
import { hashGeneratorModule } from './hash-generator'
import { uuidGeneratorModule } from './uuid-generator'
import { timestampConverterModule } from './timestamp-converter'
import { colorToolModule } from './color-tool'
// Other (clipboard-manager first as the flagship utility)
import { clipboardManagerModule } from './clipboard-manager'
import { reminderModule } from './reminder'
import { timerModule } from './timer'
import { systemInfoModule } from './system-info'
import type { A7Module } from '../core/types'

/**
 * All available modules.
 * Registration order defines the default module order for fresh installs
 * (persisted user orders are preserved by syncModuleOrder). Modules are
 * grouped by category following the CATEGORIES order, so the flat sidebar
 * list stays coherent.
 */
export const allModules: A7Module[] = [
  // Text tools
  qrCodeModule,
  markdownPreviewModule,
  textDiffModule,
  // Image tools
  imageCompressModule,
  imageConvertModule,
  imageWatermarkModule,
  // File tools
  pdfToolkitModule,
  // Screen tools
  screenshotModule,
  // Network tools
  httpServerModule,
  p2pTransferModule,
  // Dev tools
  jsonFormatterModule,
  codeMinifyModule,
  regexTesterModule,
  base64ToolModule,
  urlCodecModule,
  jwtDecoderModule,
  hashGeneratorModule,
  uuidGeneratorModule,
  timestampConverterModule,
  colorToolModule,
  // Other
  clipboardManagerModule,
  reminderModule,
  timerModule,
  systemInfoModule,
]

/** Export modules for registry */
export {
  qrCodeModule,
  markdownPreviewModule,
  textDiffModule,
  imageCompressModule,
  imageConvertModule,
  imageWatermarkModule,
  pdfToolkitModule,
  screenshotModule,
  httpServerModule,
  p2pTransferModule,
  jsonFormatterModule,
  codeMinifyModule,
  regexTesterModule,
  base64ToolModule,
  urlCodecModule,
  jwtDecoderModule,
  hashGeneratorModule,
  uuidGeneratorModule,
  timestampConverterModule,
  colorToolModule,
  clipboardManagerModule,
  reminderModule,
  timerModule,
  systemInfoModule,
}
