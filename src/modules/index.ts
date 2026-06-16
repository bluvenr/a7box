/**
 * A7Box Module Registry Index
 */

import { jsonFormatterModule } from './json-formatter'
import { qrCodeModule } from './qr-code'
import { markdownPreviewModule } from './markdown-preview'
import { codeMinifyModule } from './code-minify'
import { imageCompressModule } from './image-compress'
import { hashGeneratorModule } from './hash-generator'
import { imageConvertModule } from './image-convert'
import { colorToolModule } from './color-tool'
import { base64ToolModule } from './base64-tool'
import type { A7Module } from '../core/types'

/** All available modules */
export const allModules: A7Module[] = [
  jsonFormatterModule,
  qrCodeModule,
  markdownPreviewModule,
  codeMinifyModule,
  imageCompressModule,
  hashGeneratorModule,
  imageConvertModule,
  colorToolModule,
  base64ToolModule,
  // Add more modules here...
]

/** Export modules for registry */
export { jsonFormatterModule, qrCodeModule, markdownPreviewModule, codeMinifyModule, imageCompressModule, hashGeneratorModule, imageConvertModule, colorToolModule, base64ToolModule }
