/**
 * Image Watermark Module — Type Definitions
 */

/** Watermark type */
export type WatermarkType = 'text' | 'image' | 'timestamp'

/** Layout mode for watermark placement */
export type LayoutMode = 'single' | 'tile'

/** 9-grid position identifier */
export type GridPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'center-left' | 'center' | 'center-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'

/** Output format options */
export type OutputFormat = 'original' | 'png' | 'jpeg' | 'webp'

/** Text watermark configuration */
export interface TextWatermarkConfig {
  text: string
  fontFamily: string
  fontSize: number
  color: string
  opacity: number // 0-100
  bold: boolean
  rotation: number // -180 to 180
  shadow: boolean
  shadowColor: string
}

/** Image watermark configuration */
export interface ImageWatermarkConfig {
  /** Object URL of the uploaded logo image */
  logoUrl: string | null
  /** Cached ImageBitmap for rendering */
  logoBitmap: ImageBitmap | null
  /** Scale relative to source image width (1-100%) */
  scale: number
  opacity: number // 0-100
  rotation: number // -180 to 180
}

/** Timestamp watermark configuration */
export interface TimestampWatermarkConfig {
  /** Format pattern: yyyy-MM-dd HH:mm:ss */
  format: string
  fontSize: number
  color: string
  opacity: number // 0-100
}

/** Layout / positioning configuration (shared across types) */
export interface LayoutConfig {
  mode: LayoutMode
  position: GridPosition
  /** Custom X offset as percentage (0-100), overrides position grid when set */
  customX: number | null
  /** Custom Y offset as percentage (0-100) */
  customY: number | null
  /** Margin from edges in px (single mode) */
  margin: number
  /** Horizontal gap between tiles in px */
  tileGapX: number
  /** Vertical gap between tiles in px */
  tileGapY: number
  /** Stagger alternate rows in tile mode */
  tileStagger: boolean
}

/** Output / export configuration */
export interface OutputConfig {
  format: OutputFormat
  quality: number // 10-100 (for jpeg/webp)
  suffix: string // filename suffix
}

/** Complete watermark configuration */
export interface WatermarkConfig {
  type: WatermarkType
  text: TextWatermarkConfig
  image: ImageWatermarkConfig
  timestamp: TimestampWatermarkConfig
  layout: LayoutConfig
  output: OutputConfig
}

/** A loaded image item */
export interface WatermarkImage {
  id: string
  file: File
  url: string // Object URL for thumbnail
  bitmap: ImageBitmap | null
  width: number
  height: number
}

/** Available font families for text watermark */
export const FONT_FAMILIES = [
  { value: 'sans-serif', label: 'Sans Serif' },
  { value: 'serif', label: 'Serif' },
  { value: 'monospace', label: 'Monospace' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'Verdana', label: 'Verdana' },
  { value: 'Impact', label: 'Impact' },
] as const

/** Timestamp format presets */
export const TIMESTAMP_FORMATS = [
  { value: 'yyyy-MM-dd HH:mm', label: '2026-07-29 14:30' },
  { value: 'yyyy-MM-dd', label: '2026-07-29' },
  { value: 'yyyy/MM/dd HH:mm:ss', label: '2026/07/29 14:30:00' },
  { value: 'dd/MM/yyyy', label: '29/07/2026' },
  { value: 'MM-dd-yyyy HH:mm', label: '07-29-2026 14:30' },
] as const
