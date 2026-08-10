/**
 * A7Box Module Registry Index
 */

// Text tools
import { jsonFormatterModule } from './json-formatter'
import { qrCodeModule } from './qr-code'
import { markdownPreviewModule } from './markdown-preview'
import { codeMinifyModule } from './code-minify'
import { hashGeneratorModule } from './hash-generator'
import { base64ToolModule } from './base64-tool'
import { timestampConverterModule } from './timestamp-converter'
import { uuidGeneratorModule } from './uuid-generator'
import { jwtDecoderModule } from './jwt-decoder'
import { regexTesterModule } from './regex-tester'
import { textDiffModule } from './text-diff'
// Image tools
import { imageCompressModule } from './image-compress'
import { imageConvertModule } from './image-convert'
import { imageWatermarkModule } from './image-watermark'
// Screen tools
import { screenshotModule } from './screenshot'
// Network tools
import { httpServerModule } from './http-server'
import { p2pTransferModule } from './p2p-transfer'
// Dev tools
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
  jsonFormatterModule,
  qrCodeModule,
  markdownPreviewModule,
  codeMinifyModule,
  hashGeneratorModule,
  base64ToolModule,
  timestampConverterModule,
  uuidGeneratorModule,
  jwtDecoderModule,
  regexTesterModule,
  textDiffModule,
  imageCompressModule,
  imageConvertModule,
  imageWatermarkModule,
  screenshotModule,
  httpServerModule,
  p2pTransferModule,
  colorToolModule,
  clipboardManagerModule,
  reminderModule,
  timerModule,
  systemInfoModule,
]

/** Export modules for registry */
export {
  jsonFormatterModule,
  qrCodeModule,
  markdownPreviewModule,
  codeMinifyModule,
  hashGeneratorModule,
  base64ToolModule,
  timestampConverterModule,
  uuidGeneratorModule,
  jwtDecoderModule,
  regexTesterModule,
  textDiffModule,
  imageCompressModule,
  imageConvertModule,
  imageWatermarkModule,
  screenshotModule,
  httpServerModule,
  p2pTransferModule,
  colorToolModule,
  clipboardManagerModule,
  reminderModule,
  timerModule,
  systemInfoModule,
}
