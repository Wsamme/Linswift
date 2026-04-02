import type { PDFDocumentProxy } from 'pdfjs-dist'
import {
  renderPageToCanvas,
  sanitizeText,
  type OCRLayoutResult,
  type OCRLineItem,
  type OCRWordItem,
} from './pdf'

type OCRBBox = OCRWordItem['bbox']

export type OCRStage =
  | 'idle'
  | 'initializing-worker'
  | 'loading-language-data'
  | 'rendering-page'
  | 'recognizing'
  | 'completed'
  | 'warning'
  | 'error'

export interface OCRProgressSummary {
  pagesCompleted: number
  totalPages: number
  lineCount: number
  charCount: number
}

export interface OCRProgressUpdate {
  stage: OCRStage
  statusText: string
  progress?: number
  elapsedMs?: number
  page?: number
  totalPages?: number
  summary?: OCRProgressSummary
}

export interface OCRSession {
  lang: string
  recognize: (image: HTMLCanvasElement | OffscreenCanvas | Blob) => Promise<Tesseract.RecognizeResult>
  emit: (update: OCRProgressUpdate) => void
  setRecognitionStatusText: (statusText: string | null) => void
  terminate: () => Promise<void>
}

export interface OCRPageResult {
  pageNumber: number
  result: OCRLayoutResult
}

export interface OCRDocumentResult {
  text: string
  pages: OCRPageResult[]
  summary: OCRProgressSummary
}

export interface OverlayWordBox {
  id: string
  text: string
  bbox: OCRBBox
  confidence: number
  lineIndex: number
  rowIndex: number
  columnIndex: number
}

export interface OverlayLineBox {
  id: string
  text: string
  bbox: OCRBBox
  words: OverlayWordBox[]
  confidence: number
  lineIndex: number
  rowIndex: number
  columnIndex: number
}

export interface OverlayRegion {
  id: string
  text: string
  bbox: OCRBBox
  availableX0: number
  availableX1: number
  maxY1: number
  confidence: number
  lineIndex: number
  rowIndex: number
  columnIndex: number
  words: OverlayWordBox[]
}

export interface OverlayModel {
  words: OverlayWordBox[]
  coverBoxes: OverlayWordBox[]
  lines: OverlayLineBox[]
  regions: OverlayRegion[]
  translationRegions: OverlayRegion[]
  imageWidth: number
  imageHeight: number
}

export interface FitTranslatedRegionOptions {
  minFontSize?: number
  maxFontSize?: number
}

export interface FittedTranslatedRegion {
  text: string
  lines: string[]
  left: number
  fontSize: number
  lineHeight: number
  width: number
  height: number
  paddingX: number
  paddingY: number
  isCjk: boolean
}

const OCR_STAGE_TIMEOUTS: Record<Exclude<OCRStage, 'idle' | 'completed' | 'warning' | 'error'>, number> = {
  'initializing-worker': 30_000,
  'loading-language-data': 60_000,
  'rendering-page': 30_000,
  'recognizing': 240_000,
}

const OCR_MAX_SIDE = 5200
const LOW_CONFIDENCE_THRESHOLD = 24
const OCR_PREVIEW_MAX_WIDTH = 1600
const OCR_PREVIEW_MAX_HEIGHT = 1800
const OCR_MAX_COLUMN_SEGMENTS = 4
const OCR_MIN_COLUMN_SEGMENT_RATIO = 0.18
const OCR_MIN_COLUMN_GAP_RATIO = 0.012
const OCR_MAX_ROW_SEGMENTS_PER_COLUMN = 6
const OCR_MIN_ROW_SEGMENT_RATIO = 0.14
const OCR_MIN_ROW_GAP_RATIO = 0.008
const OCR_MAX_ROW_SEGMENT_RATIO = 0.34
const OCR_SEGMENT_PADDING_X_RATIO = 0.0022
const OCR_SEGMENT_PADDING_Y_RATIO = 0.0018

export class OCRServiceError extends Error {
  stage: 'warning' | 'error'
  code: string

  constructor(message: string, stage: 'warning' | 'error' = 'error', code = 'ocr_failed') {
    super(message)
    this.name = 'OCRServiceError'
    this.stage = stage
    this.code = code
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getOCRAssetUrl(path: string) {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '/')
  return `${base}${path.replace(/^\/+/, '')}`
}

function getTimeoutLabel(stage: keyof typeof OCR_STAGE_TIMEOUTS) {
  if (stage === 'initializing-worker') return '初始化 OCR worker'
  if (stage === 'loading-language-data') return '加载 OCR 语言数据'
  if (stage === 'rendering-page') return '渲染页面用于 OCR'
  return '识别页面文字'
}

function formatStatusText(stage: OCRStage, page?: number, totalPages?: number) {
  const pagePrefix = page && totalPages ? `第 ${page}/${totalPages} 页 · ` : ''
  if (stage === 'initializing-worker') return `${pagePrefix}initializing worker`
  if (stage === 'loading-language-data') return `${pagePrefix}loading language data`
  if (stage === 'rendering-page') return `${pagePrefix}rendering page for OCR`
  if (stage === 'recognizing') return `${pagePrefix}recognizing`
  return pagePrefix
}

function mapLoggerStage(status: string): Exclude<OCRStage, 'idle' | 'completed' | 'warning' | 'error'> {
  const normalized = status.toLowerCase()
  if (normalized.includes('language')) return 'loading-language-data'
  if (normalized.includes('recogniz')) return 'recognizing'
  return 'initializing-worker'
}

function makeBBox(x0: number, y0: number, x1: number, y1: number): OCRBBox {
  return { x0, y0, x1, y1 }
}

function boxWidth(bbox: OCRBBox) {
  return Math.max(0, bbox.x1 - bbox.x0)
}

function boxHeight(bbox: OCRBBox) {
  return Math.max(0, bbox.y1 - bbox.y0)
}

function centerY(bbox: OCRBBox) {
  return (bbox.y0 + bbox.y1) / 2
}

function centerX(bbox: OCRBBox) {
  return (bbox.x0 + bbox.x1) / 2
}

function overlapX(a: OCRBBox, b: OCRBBox) {
  return Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0))
}

function overlapY(a: OCRBBox, b: OCRBBox) {
  return Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
}

function mergeBBoxes(boxes: OCRBBox[]) {
  const valid = boxes.filter((bbox) => boxWidth(bbox) > 0 && boxHeight(bbox) > 0)
  if (valid.length === 0) return makeBBox(0, 0, 0, 0)
  return valid.reduce((acc, bbox) => ({
    x0: Math.min(acc.x0, bbox.x0),
    y0: Math.min(acc.y0, bbox.y0),
    x1: Math.max(acc.x1, bbox.x1),
    y1: Math.max(acc.y1, bbox.y1),
  }))
}

function clampBBox(bbox: OCRBBox, maxWidth: number, maxHeight: number) {
  return makeBBox(
    clamp(bbox.x0, 0, maxWidth),
    clamp(bbox.y0, 0, maxHeight),
    clamp(bbox.x1, 0, maxWidth),
    clamp(bbox.y1, 0, maxHeight),
  )
}

function hasSubstantialTextMatch(a: string, b: string) {
  const left = sanitizeText(a).replace(/\s+/g, ' ').trim().toLowerCase()
  const right = sanitizeText(b).replace(/\s+/g, ' ').trim().toLowerCase()
  if (!left || !right) return false
  if (left === right) return true
  const shorter = left.length <= right.length ? left : right
  const longer = shorter === left ? right : left
  return shorter.length >= 6 && longer.includes(shorter) && shorter.length / longer.length >= 0.72
}

function dedupeRecognizedLines(lines: OCRLineItem[]) {
  const deduped: OCRLineItem[] = []

  for (const line of lines) {
    const duplicate = deduped.slice(-4).find((candidate) => {
      const horizontalOverlap = overlapX(candidate.bbox, line.bbox)
      const verticalOverlap = overlapY(candidate.bbox, line.bbox)
      const minWidth = Math.max(1, Math.min(boxWidth(candidate.bbox), boxWidth(line.bbox)))
      const minHeight = Math.max(1, Math.min(boxHeight(candidate.bbox), boxHeight(line.bbox)))
      return horizontalOverlap / minWidth >= 0.55
        && verticalOverlap / minHeight >= 0.72
        && hasSubstantialTextMatch(candidate.text, line.text)
    })

    if (!duplicate) {
      deduped.push(line)
    }
  }

  return deduped
}

function getTextLength(text: string) {
  return sanitizeText(text).replace(/\s+/g, '').length
}

function countLatinChars(text: string) {
  const matches = sanitizeText(text).match(/[A-Za-z]/g)
  return matches ? matches.length : 0
}

function countCjkChars(text: string) {
  const matches = sanitizeText(text).match(/[\u3400-\u9fff]/g)
  return matches ? matches.length : 0
}

function isLikelyTranslatableRegion(text: string) {
  const normalized = sanitizeText(text).trim()
  if (!normalized) return false
  const latinCount = countLatinChars(normalized)
  const cjkCount = countCjkChars(normalized)
  const digitCount = (normalized.match(/\d/g) || []).length
  if (latinCount < 4) return false
  if (digitCount > latinCount * 1.6) return false
  if (cjkCount > 0 && latinCount < cjkCount * 0.55) return false
  return true
}

function isBroadlyTranslatableRegion(text: string) {
  const normalized = sanitizeText(text).trim()
  if (!normalized) return false
  const visibleCount = normalized.replace(/\s+/g, '').length
  if (visibleCount < 2) return false
  const alphaCount = (normalized.match(/[A-Za-z\u3400-\u9fff]/g) || []).length
  const digitCount = (normalized.match(/\d/g) || []).length
  if (alphaCount === 0) return false
  if (digitCount > visibleCount * 0.88) return false
  return true
}

function measureCanvas() {
  const canvas = document.createElement('canvas')
  return canvas.getContext('2d')
}

function smoothSeries(values: number[], radius: number) {
  if (radius <= 0 || values.length === 0) return [...values]
  const smoothed = new Array(values.length).fill(0)
  for (let i = 0; i < values.length; i += 1) {
    let sum = 0
    let count = 0
    for (let offset = -radius; offset <= radius; offset += 1) {
      const target = i + offset
      if (target < 0 || target >= values.length) continue
      sum += values[target]
      count += 1
    }
    smoothed[i] = count > 0 ? sum / count : values[i]
  }
  return smoothed
}

function getMedian(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function wrapTextLines(text: string, maxWidth: number, fontSize: number, isCjk: boolean) {
  const ctx = measureCanvas()
  if (!ctx) return [text]

  ctx.font = `${fontSize}px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif`
  const safeText = text.replace(/\s+/g, ' ').trim()
  if (!safeText) return ['']

  const tokens = isCjk
    ? Array.from(safeText)
    : safeText.split(/(\s+)/).filter(Boolean)

  const lines: string[] = []
  let currentLine = ''

  for (const token of tokens) {
    const next = `${currentLine}${token}`
    if (!currentLine || ctx.measureText(next).width <= maxWidth) {
      currentLine = next
      continue
    }

    lines.push(currentLine.trimEnd())
    currentLine = token.trimStart()
  }

  if (currentLine) {
    lines.push(currentLine.trimEnd())
  }

  return lines.length > 0 ? lines : [safeText]
}

function ellipsizeLines(lines: string[], maxLines: number) {
  if (lines.length <= maxLines) return lines
  const trimmed = lines.slice(0, maxLines)
  const last = trimmed[maxLines - 1] || ''
  trimmed[maxLines - 1] = last.length > 1 ? `${last.slice(0, Math.max(1, last.length - 1))}…` : '…'
  return trimmed
}

function scaleCanvas(source: HTMLCanvasElement, width: number, height: number) {
  const target = document.createElement('canvas')
  target.width = Math.max(1, Math.round(width))
  target.height = Math.max(1, Math.round(height))
  const ctx = target.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new OCRServiceError('OCR 缩放画布创建失败')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, target.width, target.height)
  return target
}

function enhanceOCRCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new OCRServiceError('OCR 预处理失败')

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = imageData

  const width = canvas.width
  const height = canvas.height
  const pixelCount = width * height
  const grayscale = new Uint8ClampedArray(pixelCount)
  const tileSize = Math.max(28, Math.round(Math.min(width, height) / 46))
  const tileCols = Math.max(1, Math.ceil(width / tileSize))
  const tileRows = Math.max(1, Math.ceil(height / tileSize))
  const tileSums = new Float64Array(tileCols * tileRows)
  const tileCounts = new Uint32Array(tileCols * tileRows)
  let globalGraySum = 0

  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4
    const alpha = data[offset + 3]
    const x = index % width
    const y = Math.floor(index / width)
    const tileIndex = Math.floor(x / tileSize) + Math.floor(y / tileSize) * tileCols

    let gray = 255
    if (alpha !== 0) {
      gray = Math.round(data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722)
    }

    grayscale[index] = gray
    tileSums[tileIndex] += gray
    tileCounts[tileIndex] += 1
    globalGraySum += gray
  }

  const globalAverage = globalGraySum / Math.max(1, pixelCount)

  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4
    const x = index % width
    const y = Math.floor(index / width)
    const tileIndex = Math.floor(x / tileSize) + Math.floor(y / tileSize) * tileCols
    const localAverage = tileSums[tileIndex] / Math.max(1, tileCounts[tileIndex])
    const gray = grayscale[index]
    const localDelta = gray - localAverage
    const globalDelta = gray - globalAverage
    const normalized = clamp(
      gray + localDelta * 0.32 + globalDelta * 0.14 - 10,
      gray > 238 ? 244 : 0,
      255,
    )
    const output = normalized

    data[offset] = output
    data[offset + 1] = output
    data[offset + 2] = output
    data[offset + 3] = 255
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

function normalizeImageCanvas(canvas: HTMLCanvasElement) {
  let ocrCanvas = canvas
  const longestSide = Math.max(canvas.width, canvas.height)

  if (longestSide > OCR_MAX_SIDE) {
    const ratio = OCR_MAX_SIDE / longestSide
    ocrCanvas = scaleCanvas(canvas, canvas.width * ratio, canvas.height * ratio)
  } else if (canvas !== ocrCanvas) {
    ocrCanvas = scaleCanvas(canvas, canvas.width, canvas.height)
  }

  return enhanceOCRCanvas(ocrCanvas)
}

function detectColumnSegments(canvas: HTMLCanvasElement) {
  if (canvas.width < 880) {
    return [{ x0: 0, x1: canvas.width }]
  }

  const preview = canvas.width > OCR_PREVIEW_MAX_WIDTH
    ? scaleCanvas(canvas, OCR_PREVIEW_MAX_WIDTH, canvas.height * (OCR_PREVIEW_MAX_WIDTH / canvas.width))
    : scaleCanvas(canvas, canvas.width, canvas.height)
  const ctx = preview.getContext('2d', { willReadFrequently: true })
  if (!ctx) return [{ x0: 0, x1: canvas.width }]

  const { data, width, height } = ctx.getImageData(0, 0, preview.width, preview.height)
  const columnInk = new Array(width).fill(0)
  const rowStep = Math.max(1, Math.round(height / 900))

  for (let y = 0; y < height; y += rowStep) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const alpha = data[index + 3]
      if (alpha < 16) continue
      const gray = data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722
      const darkness = 255 - gray
      if (darkness > 26) {
        columnInk[x] += darkness
      }
    }
  }

  const smoothed = smoothSeries(columnInk, Math.max(2, Math.round(width / 180)))
  const positive = smoothed.filter((value) => value > 0)
  const median = getMedian(positive)
  if (median <= 0) {
    return [{ x0: 0, x1: canvas.width }]
  }

  const gapThreshold = Math.max(10, median * 0.14)
  const minGapWidth = Math.max(12, Math.round(width * OCR_MIN_COLUMN_GAP_RATIO))
  const minSegmentWidth = Math.max(140, Math.round(width * OCR_MIN_COLUMN_SEGMENT_RATIO))
  const splitPoints: number[] = []

  let gapStart = -1
  for (let x = 0; x < width; x += 1) {
    const isGap = smoothed[x] <= gapThreshold
    if (isGap && gapStart < 0) gapStart = x

    if ((!isGap || x === width - 1) && gapStart >= 0) {
      const gapEnd = !isGap ? x - 1 : x
      const gapWidth = gapEnd - gapStart + 1
      if (gapWidth >= minGapWidth) {
        const midpoint = Math.round((gapStart + gapEnd) / 2)
        const previousSplit = splitPoints.length > 0 ? splitPoints[splitPoints.length - 1] : 0
        if (midpoint - previousSplit >= minSegmentWidth && width - midpoint >= minSegmentWidth) {
          splitPoints.push(midpoint)
          if (splitPoints.length >= OCR_MAX_COLUMN_SEGMENTS - 1) break
        }
      }
      gapStart = -1
    }
  }

  if (splitPoints.length === 0) {
    return [{ x0: 0, x1: canvas.width }]
  }

  const ratio = canvas.width / width
  const boundaries = [0, ...splitPoints.map((split) => Math.round(split * ratio)), canvas.width]
  const segments: Array<{ x0: number; x1: number }> = []
  const paddingX = getSegmentPaddingX(canvas.width)

  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const start = boundaries[i]
    const end = boundaries[i + 1]
    if (end - start < canvas.width * 0.1) continue
    segments.push({
      x0: Math.max(0, start - paddingX),
      x1: Math.min(canvas.width, end + paddingX),
    })
  }

  return segments.length > 0 ? segments : [{ x0: 0, x1: canvas.width }]
}

function findLowInkSplit(values: number[], target: number, radius: number) {
  let bestIndex = clamp(Math.round(target), 0, values.length - 1)
  let bestValue = Number.POSITIVE_INFINITY
  const start = Math.max(0, Math.round(target - radius))
  const end = Math.min(values.length - 1, Math.round(target + radius))
  for (let index = start; index <= end; index += 1) {
    if (values[index] < bestValue) {
      bestValue = values[index]
      bestIndex = index
    }
  }
  return bestIndex
}

function detectRowSegments(canvas: HTMLCanvasElement) {
  if (canvas.height < Math.max(900, canvas.width * 0.9)) {
    return [{ y0: 0, y1: canvas.height }]
  }

  const preview = canvas.height > OCR_PREVIEW_MAX_HEIGHT
    ? scaleCanvas(canvas, canvas.width * (OCR_PREVIEW_MAX_HEIGHT / canvas.height), OCR_PREVIEW_MAX_HEIGHT)
    : scaleCanvas(canvas, canvas.width, canvas.height)
  const ctx = preview.getContext('2d', { willReadFrequently: true })
  if (!ctx) return [{ y0: 0, y1: canvas.height }]

  const { data, width, height } = ctx.getImageData(0, 0, preview.width, preview.height)
  const rowInk = new Array(height).fill(0)
  const columnStep = Math.max(1, Math.round(width / 1000))

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += columnStep) {
      const index = (y * width + x) * 4
      const alpha = data[index + 3]
      if (alpha < 16) continue
      const gray = data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722
      const darkness = 255 - gray
      if (darkness > 24) {
        rowInk[y] += darkness
      }
    }
  }

  const smoothed = smoothSeries(rowInk, Math.max(2, Math.round(height / 220)))
  const positive = smoothed.filter((value) => value > 0)
  const median = getMedian(positive)
  const ratio = canvas.height / height
  const minGapHeight = Math.max(10, Math.round(height * OCR_MIN_ROW_GAP_RATIO))
  const minSegmentHeight = Math.max(180, Math.round(height * OCR_MIN_ROW_SEGMENT_RATIO))
  const maxSegmentHeight = Math.max(
    minSegmentHeight + 40,
    Math.round(Math.min(height * OCR_MAX_ROW_SEGMENT_RATIO, height / Math.max(1, OCR_MAX_ROW_SEGMENTS_PER_COLUMN - 1))),
  )

  const candidateSplits: number[] = []
  if (median > 0) {
    const gapThreshold = Math.max(10, median * 0.16)
    let gapStart = -1
    for (let y = 0; y < height; y += 1) {
      const isGap = smoothed[y] <= gapThreshold
      if (isGap && gapStart < 0) gapStart = y
      if ((!isGap || y === height - 1) && gapStart >= 0) {
        const gapEnd = !isGap ? y - 1 : y
        const gapHeight = gapEnd - gapStart + 1
        if (gapHeight >= minGapHeight) {
          const midpoint = Math.round((gapStart + gapEnd) / 2)
          if (
            midpoint >= minSegmentHeight
            && height - midpoint >= minSegmentHeight
            && candidateSplits.length < OCR_MAX_ROW_SEGMENTS_PER_COLUMN - 1
          ) {
            candidateSplits.push(midpoint)
          }
        }
        gapStart = -1
      }
    }
  }

  const boundaries = [0]
  let nextCandidateIndex = 0
  while (boundaries[boundaries.length - 1] < height && boundaries.length <= OCR_MAX_ROW_SEGMENTS_PER_COLUMN) {
    const lastBoundary = boundaries[boundaries.length - 1]
    const remaining = height - lastBoundary
    if (remaining <= maxSegmentHeight || boundaries.length === OCR_MAX_ROW_SEGMENTS_PER_COLUMN) break

    let split = -1
    while (nextCandidateIndex < candidateSplits.length) {
      const candidate = candidateSplits[nextCandidateIndex]
      nextCandidateIndex += 1
      if (candidate - lastBoundary < minSegmentHeight) continue
      if (candidate - lastBoundary > maxSegmentHeight) break
      split = candidate
    }

    if (split < 0) {
      const target = lastBoundary + maxSegmentHeight
      split = findLowInkSplit(smoothed, target, Math.max(16, Math.round(height * 0.035)))
    }

    if (split - lastBoundary < minSegmentHeight) {
      split = Math.min(height - minSegmentHeight, lastBoundary + minSegmentHeight)
    }
    if (height - split < minSegmentHeight) {
      split = height - minSegmentHeight
    }
    if (split <= lastBoundary || split >= height) break

    boundaries.push(split)
  }
  boundaries.push(height)

  const segments: Array<{ y0: number; y1: number }> = []
  const paddingY = getSegmentPaddingY(canvas.height)
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index]
    const end = boundaries[index + 1]
    if (end - start < minSegmentHeight * 0.7) continue
    segments.push({
      y0: Math.max(0, Math.round(start * ratio) - paddingY),
      y1: Math.min(canvas.height, Math.round(end * ratio) + paddingY),
    })
  }

  return segments.length > 0 ? segments : [{ y0: 0, y1: canvas.height }]
}

interface OCRPreparedSegment {
  id: string
  canvas: HTMLCanvasElement
  sourceX: number
  sourceY: number
  sourceWidth: number
  sourceHeight: number
  scaleX: number
  scaleY: number
  columnIndex: number
  rowIndex: number
}

interface OCRSegmentWord extends OCRWordItem {
  columnIndex: number
  rowIndex: number
}

interface OCRSegmentLine extends OCRLineItem {
  confidence: number
  columnIndex: number
  rowIndex: number
}

function prepareOCRSegments(canvas: HTMLCanvasElement): OCRPreparedSegment[] {
  const columns = detectColumnSegments(canvas)
  const prepared: OCRPreparedSegment[] = []

  columns.forEach((column, columnIndex) => {
    const cropWidth = Math.max(1, column.x1 - column.x0)
    const columnCanvas = document.createElement('canvas')
    columnCanvas.width = cropWidth
    columnCanvas.height = canvas.height
    const columnCtx = columnCanvas.getContext('2d')
    if (!columnCtx) throw new OCRServiceError('OCR 分段画布创建失败')
    columnCtx.imageSmoothingEnabled = true
    columnCtx.imageSmoothingQuality = 'high'
    columnCtx.drawImage(
      canvas,
      column.x0,
      0,
      cropWidth,
      canvas.height,
      0,
      0,
      cropWidth,
      canvas.height,
    )

    const rowSegments = detectRowSegments(columnCanvas)
    rowSegments.forEach((row, rowIndex) => {
      const cropHeight = Math.max(1, row.y1 - row.y0)
      const cropped = document.createElement('canvas')
      cropped.width = cropWidth
      cropped.height = cropHeight
      const croppedCtx = cropped.getContext('2d')
      if (!croppedCtx) throw new OCRServiceError('OCR 分段画布创建失败')
      croppedCtx.imageSmoothingEnabled = true
      croppedCtx.imageSmoothingQuality = 'high'
      croppedCtx.drawImage(
        columnCanvas,
        0,
        row.y0,
        cropWidth,
        cropHeight,
        0,
        0,
        cropWidth,
        cropHeight,
      )

      const normalized = normalizeImageCanvas(cropped)
      prepared.push({
        id: `segment-${columnIndex}-${rowIndex}`,
        canvas: normalized,
        sourceX: column.x0,
        sourceY: row.y0,
        sourceWidth: cropWidth,
        sourceHeight: cropHeight,
        scaleX: cropWidth / Math.max(1, normalized.width),
        scaleY: cropHeight / Math.max(1, normalized.height),
        columnIndex,
        rowIndex,
      })
    })
  })

  return prepared
}

function getRawLines(data: Tesseract.Page) {
  const rawData = data as any
  const rawLines: any[] = rawData.lines || []
  return rawLines.length > 0
    ? rawLines
    : (rawData.blocks || []).flatMap((block: any) =>
        (block.paragraphs || []).flatMap((para: any) => para.lines || []),
      )
}

function getRawWords(data: Tesseract.Page) {
  const rawData = data as any
  const rawWords: any[] = rawData.words || []
  return rawWords.length > 0
    ? rawWords
    : getRawLines(data).flatMap((line: any) => line.words || [])
}

function isStandalonePunctuation(text: string) {
  return /^[^A-Za-z0-9\u3400-\u9fff]+$/u.test(text)
}

function isMeaningfulToken(text: string) {
  return /[A-Za-z0-9\u3400-\u9fff]/.test(sanitizeText(text))
}

function isSuspiciousOCRToken(text: string) {
  const compact = sanitizeText(text).replace(/\s+/g, '')
  if (!compact) return true
  if (isStandalonePunctuation(compact)) return true
  if (/[|]{2,}|["“”'`]{3,}|[0O]{4,}/.test(compact)) return true
  if (/^[A-Za-z]$/.test(compact)) return true
  if (compact.length <= 2 && !isMeaningfulToken(compact)) return true
  return false
}

function getSegmentPaddingX(canvasWidth: number) {
  return Math.max(24, Math.round(canvasWidth * OCR_SEGMENT_PADDING_X_RATIO))
}

function getSegmentPaddingY(canvasHeight: number) {
  return Math.max(20, Math.round(canvasHeight * OCR_SEGMENT_PADDING_Y_RATIO))
}

function isLikelyNoiseWord(
  text: string,
  bbox: OCRBBox,
  confidence: number,
  imageWidth: number,
  imageHeight: number,
) {
  const compact = sanitizeText(text).replace(/\s+/g, '')
  if (!compact) return true

  const area = boxWidth(bbox) * boxHeight(bbox)
  const pageArea = Math.max(1, imageWidth * imageHeight)
  const hasReadableChars = /[A-Za-z0-9\u3400-\u9fff]/.test(compact)
  const standalonePunctuation = isStandalonePunctuation(compact)

  if (standalonePunctuation && confidence < 58) return true
  if (!hasReadableChars && compact.length <= 2 && confidence < 64) return true
  if (confidence < 12 && area < pageArea * 0.00008) return true
  if (compact.length <= 2 && confidence < 18 && area < pageArea * 0.00016) return true

  return false
}

function dedupeRecognizedWords(words: OCRSegmentWord[]) {
  const sorted = [...words].sort((a, b) => (
    a.columnIndex - b.columnIndex
    || a.rowIndex - b.rowIndex
    || a.bbox.y0 - b.bbox.y0
    || a.bbox.x0 - b.bbox.x0
  ))
  const deduped: OCRSegmentWord[] = []

  for (const word of sorted) {
    const duplicate = deduped.slice(-12).find((candidate) => {
      if (candidate.columnIndex !== word.columnIndex) return false
      const horizontalOverlap = overlapX(candidate.bbox, word.bbox)
      const verticalOverlap = overlapY(candidate.bbox, word.bbox)
      const minWidth = Math.max(1, Math.min(boxWidth(candidate.bbox), boxWidth(word.bbox)))
      const minHeight = Math.max(1, Math.min(boxHeight(candidate.bbox), boxHeight(word.bbox)))
      return horizontalOverlap / minWidth >= 0.72
        && verticalOverlap / minHeight >= 0.72
        && hasSubstantialTextMatch(candidate.text, word.text)
    })

    if (!duplicate) {
      deduped.push(word)
    }
  }

  return deduped
}

function shouldJoinWordsWithSpace(previous: OCRWordItem, next: OCRWordItem) {
  const previousText = sanitizeText(previous.text).trim()
  const nextText = sanitizeText(next.text).trim()
  if (!previousText || !nextText) return false
  if (/[\u3400-\u9fff]$/.test(previousText) || /^[\u3400-\u9fff]/.test(nextText)) return false
  if (/^[,.;:!?%)\]}]/.test(nextText)) return false
  if (/[([{/"'`-]$/.test(previousText)) return false

  const gap = next.bbox.x0 - previous.bbox.x1
  const charWidth = boxWidth(previous.bbox) / Math.max(1, getTextLength(previousText))
  return gap >= clamp(charWidth * 0.42, 1.5, Math.max(8, boxHeight(previous.bbox) * 0.52))
}

function splitWordsIntoVisualRuns(words: OCRSegmentWord[]) {
  if (words.length <= 1) return [words]

  const runs: OCRSegmentWord[][] = []
  let currentRun: OCRSegmentWord[] = [words[0]]

  for (let index = 1; index < words.length; index += 1) {
    const word = words[index]
    const previous = currentRun[currentRun.length - 1]
    const gap = word.bbox.x0 - previous.bbox.x1
    const medianHeight = getMedian(currentRun.map((item) => boxHeight(item.bbox)))
    const splitThreshold = Math.max(28, medianHeight * 3.1)

    if (gap > splitThreshold) {
      runs.push(currentRun)
      currentRun = [word]
      continue
    }

    currentRun.push(word)
  }

  if (currentRun.length > 0) {
    runs.push(currentRun)
  }

  return runs
}

function buildLineText(words: OCRWordItem[]) {
  if (words.length === 0) return ''

  let text = sanitizeText(words[0].text).trim()
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index]
    const nextText = sanitizeText(word.text).trim()
    if (!nextText) continue
    text += shouldJoinWordsWithSpace(words[index - 1], word) ? ` ${nextText}` : nextText
  }

  return text.trim()
}

function wordBelongsToLine(lineWords: OCRSegmentWord[], candidate: OCRSegmentWord) {
  const centerBand = getMedian(lineWords.map((word) => centerY(word.bbox)))
  const medianHeight = Math.max(1, getMedian(lineWords.map((word) => boxHeight(word.bbox))))
  const candidateHeight = Math.max(1, boxHeight(candidate.bbox))
  const candidateCenter = centerY(candidate.bbox)
  const lineBand = makeBBox(
    0,
    centerBand - medianHeight / 2,
    1,
    centerBand + medianHeight / 2,
  )
  const candidateBand = makeBBox(0, candidate.bbox.y0, 1, candidate.bbox.y1)
  const verticalOverlap = overlapY(lineBand, candidateBand)
  const minHeight = Math.max(1, Math.min(medianHeight, candidateHeight))
  const centerDistance = Math.abs(centerBand - candidateCenter)
  const allowedDistance = Math.max(medianHeight, candidateHeight) * 0.42

  return verticalOverlap / minHeight >= 0.26 || centerDistance <= allowedDistance
}

function buildLayoutFromWords(
  words: OCRSegmentWord[],
  imageWidth: number,
  imageHeight: number,
): OCRLayoutResult {
  const linesWithMeta: Array<OCRLineItem & { columnIndex: number }> = []
  const columnIndexes = [...new Set(words.map((word) => word.columnIndex))].sort((a, b) => a - b)

  for (const columnIndex of columnIndexes) {
    const columnWords = words
      .filter((word) => word.columnIndex === columnIndex)
      .sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0)

    const lineGroups: OCRSegmentWord[][] = []

    for (const word of columnWords) {
      const candidateLines = [...lineGroups]
        .slice(-10)
        .filter((lineWords) => wordBelongsToLine(lineWords, word))
        .sort((left, right) => {
          const leftDistance = Math.abs(getMedian(left.map((item) => centerY(item.bbox))) - centerY(word.bbox))
          const rightDistance = Math.abs(getMedian(right.map((item) => centerY(item.bbox))) - centerY(word.bbox))
          return leftDistance - rightDistance
        })
      const targetLine = candidateLines[0]
      if (targetLine) {
        targetLine.push(word)
      } else {
        lineGroups.push([word])
      }
    }

    for (const lineWords of lineGroups) {
      const sortedWords = [...lineWords].sort((a, b) => a.bbox.x0 - b.bbox.x0)
      const visualRuns = splitWordsIntoVisualRuns(sortedWords)
      for (const run of visualRuns) {
        const text = buildLineText(run)
        if (!text) continue
        linesWithMeta.push({
          text,
          bbox: clampBBox(mergeBBoxes(run.map((word) => word.bbox)), imageWidth, imageHeight),
          words: run.map(({ text: wordText, bbox, confidence }) => ({ text: wordText, bbox, confidence })),
          columnIndex,
        })
      }
    }
  }

  const lines = dedupeRecognizedLines(
    linesWithMeta
      .sort((a, b) => a.columnIndex - b.columnIndex || a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0)
      .map(({ text, bbox, words: lineWords }) => ({ text, bbox, words: lineWords })),
  )

  return {
    text: lines.map((line) => line.text).join('\n'),
    lines,
    imageWidth,
    imageHeight,
  }
}

function collectSegmentWords(
  data: Tesseract.Page,
  segment: OCRPreparedSegment,
  imageWidth: number,
  imageHeight: number,
): OCRSegmentWord[] {
  const rawWords = getRawWords(data)

  const remapBBox = (bbox: OCRBBox) => clampBBox(makeBBox(
    segment.sourceX + bbox.x0 * segment.scaleX,
    segment.sourceY + bbox.y0 * segment.scaleY,
    segment.sourceX + bbox.x1 * segment.scaleX,
    segment.sourceY + bbox.y1 * segment.scaleY,
  ), imageWidth, imageHeight)

  return rawWords
    .map((word: any) => {
      const text = sanitizeText(word.text || '').replace(/\s+/g, ' ').trim()
      const bbox = remapBBox(word.bbox || makeBBox(0, 0, 0, 0))
      const confidence = word.confidence || 0
      return {
        text,
        bbox,
        confidence,
        columnIndex: segment.columnIndex,
        rowIndex: segment.rowIndex,
      }
    })
    .filter((word: OCRSegmentWord) => (
      word.text.length > 0
      && boxWidth(word.bbox) > 0
      && boxHeight(word.bbox) > 0
      && !isLikelyNoiseWord(word.text, word.bbox, word.confidence, imageWidth, imageHeight)
    ))
}

function dedupeSegmentLines(lines: OCRSegmentLine[]) {
  const sorted = [...lines].sort((a, b) => (
    a.columnIndex - b.columnIndex
    || a.rowIndex - b.rowIndex
    || a.bbox.y0 - b.bbox.y0
    || a.bbox.x0 - b.bbox.x0
  ))
  const deduped: OCRSegmentLine[] = []

  for (const line of sorted) {
    const duplicate = deduped.slice(-10).find((candidate) => {
      if (candidate.columnIndex !== line.columnIndex) return false
      const horizontalOverlap = overlapX(candidate.bbox, line.bbox)
      const verticalOverlap = overlapY(candidate.bbox, line.bbox)
      const minWidth = Math.max(1, Math.min(boxWidth(candidate.bbox), boxWidth(line.bbox)))
      const minHeight = Math.max(1, Math.min(boxHeight(candidate.bbox), boxHeight(line.bbox)))
      return horizontalOverlap / minWidth >= 0.58
        && verticalOverlap / minHeight >= 0.7
        && hasSubstantialTextMatch(candidate.text, line.text)
    })

    if (!duplicate) {
      deduped.push(line)
    }
  }

  return deduped
}

function collectSegmentLines(
  data: Tesseract.Page,
  segment: OCRPreparedSegment,
  imageWidth: number,
  imageHeight: number,
): OCRSegmentLine[] {
  const rawLines = getRawLines(data)
  if (rawLines.length === 0) return []

  const remapBBox = (bbox: OCRBBox) => clampBBox(makeBBox(
    segment.sourceX + bbox.x0 * segment.scaleX,
    segment.sourceY + bbox.y0 * segment.scaleY,
    segment.sourceX + bbox.x1 * segment.scaleX,
    segment.sourceY + bbox.y1 * segment.scaleY,
  ), imageWidth, imageHeight)

  return rawLines
    .map((line: any) => {
      const rawWords: OCRSegmentWord[] = (line.words || [])
        .map((word: any) => {
          const text = sanitizeText(word.text || '').replace(/\s+/g, ' ').trim()
          const bbox = remapBBox(word.bbox || makeBBox(0, 0, 0, 0))
          const confidence = word.confidence || 0
          return {
            text,
            bbox,
            confidence,
            columnIndex: segment.columnIndex,
            rowIndex: segment.rowIndex,
          }
        })
        .filter((word: OCRSegmentWord) => (
          word.text.length > 0
          && boxWidth(word.bbox) > 0
          && boxHeight(word.bbox) > 0
          && !isLikelyNoiseWord(word.text, word.bbox, word.confidence, imageWidth, imageHeight)
        ))
        .sort((a: OCRSegmentWord, b: OCRSegmentWord) => a.bbox.x0 - b.bbox.x0)

      const reliableWords = rawWords.filter((word) => word.confidence >= LOW_CONFIDENCE_THRESHOLD)
      const selectedWords = reliableWords.length >= Math.max(2, Math.ceil(rawWords.length * 0.6))
        ? reliableWords
        : rawWords.filter((word) => word.confidence >= LOW_CONFIDENCE_THRESHOLD * 0.45 || isMeaningfulToken(word.text))
      const resolvedWords = selectedWords.length > 0 ? selectedWords : rawWords
      const text = buildLineText(resolvedWords) || sanitizeText(line.text || '').replace(/\s+/g, ' ').trim()
      const bbox = resolvedWords.length > 0
        ? mergeBBoxes(resolvedWords.map((word) => word.bbox))
        : remapBBox(line.bbox || makeBBox(0, 0, 0, 0))
      const confidence = resolvedWords.length > 0
        ? resolvedWords.reduce((sum, word) => sum + word.confidence, 0) / resolvedWords.length
        : (line.confidence || 0)

      return {
        text,
        bbox: clampBBox(bbox, imageWidth, imageHeight),
        words: resolvedWords.map(({ text: wordText, bbox: wordBBox, confidence: wordConfidence }) => ({
          text: wordText,
          bbox: wordBBox,
          confidence: wordConfidence,
        })),
        confidence,
        columnIndex: segment.columnIndex,
        rowIndex: segment.rowIndex,
      }
    })
    .filter((line: OCRSegmentLine) => (
      getTextLength(line.text) > 0
      && boxWidth(line.bbox) > 0
      && boxHeight(line.bbox) > 0
    ))
}

function buildLayoutFromSegmentLines(
  lines: OCRSegmentLine[],
  imageWidth: number,
  imageHeight: number,
): OCRLayoutResult {
  const preservedLines: OCRLineItem[] = []

  for (const line of [...lines].sort((a, b) => (
    a.columnIndex - b.columnIndex
    || a.rowIndex - b.rowIndex
    || a.bbox.y0 - b.bbox.y0
    || a.bbox.x0 - b.bbox.x0
  ))) {
    const sortedWords = line.words
      .map((word) => ({
        ...word,
        columnIndex: line.columnIndex,
        rowIndex: line.rowIndex,
      }))
      .sort((a, b) => a.bbox.x0 - b.bbox.x0)

    const fallbackText = (sortedWords.length > 0 ? buildLineText(sortedWords) : '')
      || sanitizeText(line.text).trim()

    if (!fallbackText) continue

    preservedLines.push({
      text: fallbackText,
      bbox: clampBBox(
        sortedWords.length > 0 ? mergeBBoxes(sortedWords.map((word) => word.bbox)) : line.bbox,
        imageWidth,
        imageHeight,
      ),
      words: sortedWords.map(({ text: wordText, bbox, confidence }) => ({ text: wordText, bbox, confidence })),
    })
  }

  const deduped = dedupeRecognizedLines(preservedLines)
  return {
    text: deduped.map((line) => line.text).join('\n'),
    lines: deduped,
    imageWidth,
    imageHeight,
  }
}

function scoreLayoutQuality(result: OCRLayoutResult) {
  let tokenCount = 0
  let meaningfulTokenCount = 0
  let suspiciousTokenCount = 0
  let singleCharacterCount = 0

  for (const line of result.lines) {
    for (const word of line.words) {
      const text = sanitizeText(word.text).trim()
      if (!text) continue
      tokenCount += 1
      if (text.length === 1) singleCharacterCount += 1
      if (isMeaningfulToken(text)) meaningfulTokenCount += 1
      if (isSuspiciousOCRToken(text)) suspiciousTokenCount += 1
    }
  }

  const charCount = getTextLength(result.text)
  return charCount * 1.4
    + meaningfulTokenCount * 4
    - suspiciousTokenCount * 10
    - Math.max(0, singleCharacterCount - meaningfulTokenCount * 0.08) * 3
    - Math.max(0, tokenCount - meaningfulTokenCount * 2.2)
}

function createStageEmitter(
  onProgress?: (update: OCRProgressUpdate) => void,
) {
  let stage: OCRStage = 'idle'
  let stageStartedAt = Date.now()
  let timer: ReturnType<typeof setTimeout> | null = null
  let timeoutReject: ((reason?: unknown) => void) | null = null
  let timedOut = false

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutReject = reject
  })

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  const armTimer = (nextStage: OCRStage) => {
    clearTimer()
    if (!(nextStage in OCR_STAGE_TIMEOUTS)) return
    const stageKey = nextStage as keyof typeof OCR_STAGE_TIMEOUTS
    timer = setTimeout(() => {
      timedOut = true
      timeoutReject?.(new OCRServiceError(`${getTimeoutLabel(stageKey)}超时，请重试或切换 OCR 语言`, 'error', 'ocr_timeout'))
    }, OCR_STAGE_TIMEOUTS[stageKey])
  }

  const emit = (update: OCRProgressUpdate) => {
    if (update.stage !== stage) {
      stage = update.stage
      stageStartedAt = Date.now()
      armTimer(update.stage)
    }
    onProgress?.({
      ...update,
      elapsedMs: Date.now() - stageStartedAt,
    })
  }

  const stop = () => {
    clearTimer()
  }

  return {
    emit,
    timeoutPromise,
    stop,
    hasTimedOut: () => timedOut,
  }
}

export async function createOCRSession(
  lang: string,
  onProgress?: (update: OCRProgressUpdate) => void,
): Promise<OCRSession> {
  const { createWorker, PSM } = await import('tesseract.js')
  const workerPath = getOCRAssetUrl('/ocr/worker.min.js')
  const corePath = getOCRAssetUrl('/ocr/tesseract-core-lstm.wasm.js')
  const langPath = getOCRAssetUrl('/ocr/lang')
  const emitter = createStageEmitter(onProgress)
  let recognitionStatusText: string | null = null

  let worker: Tesseract.Worker | null = null
  let creationTimedOut = false
  emitter.emit({
    stage: 'initializing-worker',
    statusText: formatStatusText('initializing-worker'),
    progress: 0,
  })

  const createWorkerPromise = createWorker(lang, 1, {
    workerPath,
    corePath,
    langPath,
    workerBlobURL: false,
    gzip: true,
    logger: (message: Tesseract.LoggerMessage) => {
      const stage = mapLoggerStage(message.status)
      emitter.emit({
        stage,
        statusText: stage === 'recognizing' && recognitionStatusText
          ? recognitionStatusText
          : formatStatusText(stage),
        progress: Math.round((message.progress || 0) * 100),
      })
    },
    errorHandler: (error) => {
      throw new OCRServiceError(String(error || 'OCR worker 发生未知错误'))
    },
  }).then((created) => {
    worker = created
    if (creationTimedOut) {
      void created.terminate()
      throw new OCRServiceError('初始化 OCR worker 超时，请重试', 'error', 'ocr_timeout')
    }
    return created
  })

  try {
    worker = await Promise.race([createWorkerPromise, emitter.timeoutPromise])
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    } as Record<string, string | number>)
  } catch (error) {
    creationTimedOut = emitter.hasTimedOut()
    emitter.stop()
    if (worker) {
      await worker.terminate().catch(() => {})
    }
    throw error instanceof OCRServiceError
      ? error
      : new OCRServiceError(String((error as Error)?.message || error || 'OCR worker 初始化失败'))
  }

  emitter.stop()

  const runWithTimeout = async <T,>(
    stage: Exclude<OCRStage, 'idle' | 'completed' | 'warning' | 'error'>,
    statusText: string,
    work: () => Promise<T>,
    progress?: number,
  ) => {
    const runtimeEmitter = createStageEmitter(onProgress)
    runtimeEmitter.emit({ stage, statusText, progress })
    try {
      const result = await Promise.race([work(), runtimeEmitter.timeoutPromise])
      runtimeEmitter.stop()
      return result
    } catch (error) {
      runtimeEmitter.stop()
      throw error instanceof OCRServiceError
        ? error
        : new OCRServiceError(String((error as Error)?.message || error || 'OCR 运行失败'))
    }
  }

  return {
    lang,
    emit: (update) => onProgress?.(update),
    setRecognitionStatusText: (statusText) => {
      recognitionStatusText = statusText
    },
    recognize: async (image) => {
      if (!worker) throw new OCRServiceError('OCR worker 不可用')
      return runWithTimeout(
        'recognizing',
        formatStatusText('recognizing'),
        () => worker!.recognize(image, {}, { text: true, blocks: true }),
      )
    },
    terminate: async () => {
      if (!worker) return
      try {
        await worker.terminate()
      } finally {
        worker = null
      }
    },
  }
}

export async function recognizeCanvasWithLayout(
  canvas: HTMLCanvasElement,
  session: OCRSession,
): Promise<OCRLayoutResult> {
  session.emit({
    stage: 'rendering-page',
    statusText: formatStatusText('rendering-page'),
    progress: 0,
  })

  const segments = prepareOCRSegments(canvas)
  session.emit({
    stage: 'recognizing',
    statusText: segments.length > 1 ? `recognizing 1/${segments.length}` : formatStatusText('recognizing'),
    progress: 5,
  })
  session.setRecognitionStatusText(segments.length > 1 ? `recognizing 1/${segments.length}` : formatStatusText('recognizing'))

  const partialWords: OCRSegmentWord[] = []
  const partialLines: OCRSegmentLine[] = []
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    const segmentStatusText = segments.length > 1 ? `recognizing ${index + 1}/${segments.length}` : formatStatusText('recognizing')
    session.setRecognitionStatusText(segmentStatusText)
    session.emit({
      stage: 'recognizing',
      statusText: segmentStatusText,
      progress: Math.round((index / segments.length) * 100),
    })

    const recognized = await session.recognize(segment.canvas)
    partialWords.push(...collectSegmentWords(recognized.data, segment, canvas.width, canvas.height))
    partialLines.push(...collectSegmentLines(recognized.data, segment, canvas.width, canvas.height))
  }

  const dedupedWords = dedupeRecognizedWords(partialWords)
  const dedupedLines = dedupeSegmentLines(partialLines)
  const lineBasedResult = dedupedLines.length > 0
    ? buildLayoutFromSegmentLines(dedupedLines, canvas.width, canvas.height)
    : null
  const wordBasedResult = buildLayoutFromWords(dedupedWords, canvas.width, canvas.height)
  const lineBasedCharCount = lineBasedResult ? getTextLength(lineBasedResult.text) : 0
  const wordBasedCharCount = getTextLength(wordBasedResult.text)
  const lineBasedScore = lineBasedResult ? scoreLayoutQuality(lineBasedResult) : Number.NEGATIVE_INFINITY
  const wordBasedScore = scoreLayoutQuality(wordBasedResult)
  const result = lineBasedResult && (
    lineBasedCharCount >= wordBasedCharCount * 0.74
    && lineBasedScore >= wordBasedScore * 0.92
  )
    ? lineBasedResult
    : wordBasedResult
  const charCount = getTextLength(result.text)
  const lineCount = result.lines.length

  if (charCount === 0 || lineCount === 0) {
    const switchHint = session.lang.includes('chi')
      ? '可尝试切换到 eng+chi_sim 或 chi_tra 后重试'
      : '可尝试切换到 eng+chi_sim 后重试'
    throw new OCRServiceError(`OCR 未识别到有效文本，${switchHint}`, 'warning', 'ocr_zero_result')
  }

  session.emit({
    stage: 'completed',
    statusText: `completed with ${lineCount} lines / ${charCount} chars`,
    progress: 100,
    summary: {
      pagesCompleted: 1,
      totalPages: 1,
      lineCount,
      charCount,
    },
  })
  session.setRecognitionStatusText(null)

  return result
}

export async function recognizePdfDocument(
  pdfDoc: PDFDocumentProxy,
  session: OCRSession,
  onProgress?: (update: OCRProgressUpdate) => void,
): Promise<OCRDocumentResult> {
  const pages: OCRPageResult[] = []
  let lineCount = 0
  let charCount = 0

  for (let page = 1; page <= pdfDoc.numPages; page += 1) {
    onProgress?.({
      stage: 'rendering-page',
      statusText: formatStatusText('rendering-page', page, pdfDoc.numPages),
      progress: Math.round(((page - 1) / pdfDoc.numPages) * 100),
      page,
      totalPages: pdfDoc.numPages,
      summary: {
        pagesCompleted: page - 1,
        totalPages: pdfDoc.numPages,
        lineCount,
        charCount,
      },
    })

    const tempCanvas = document.createElement('canvas')
    await renderPageToCanvas(pdfDoc, page, tempCanvas, 2, { pixelRatio: 1 })

    const result = await recognizeCanvasWithLayout(tempCanvas, {
      ...session,
      emit: (update) => {
        onProgress?.({
          ...update,
          page,
          totalPages: pdfDoc.numPages,
          progress: update.progress == null
            ? undefined
            : Math.min(100, Math.round((((page - 1) + update.progress / 100) / pdfDoc.numPages) * 100)),
          summary: {
            pagesCompleted: page - 1,
            totalPages: pdfDoc.numPages,
            lineCount,
            charCount,
          },
        })
      },
    })

    pages.push({ pageNumber: page, result })
    lineCount += result.lines.length
    charCount += getTextLength(result.text)

    onProgress?.({
      stage: 'recognizing',
      statusText: formatStatusText('recognizing', page, pdfDoc.numPages),
      progress: Math.round((page / pdfDoc.numPages) * 100),
      page,
      totalPages: pdfDoc.numPages,
      summary: {
        pagesCompleted: page,
        totalPages: pdfDoc.numPages,
        lineCount,
        charCount,
      },
    })
  }

  const summary = {
    pagesCompleted: pdfDoc.numPages,
    totalPages: pdfDoc.numPages,
    lineCount,
    charCount,
  }

  onProgress?.({
    stage: 'completed',
    statusText: `completed with ${lineCount} lines / ${charCount} chars`,
    progress: 100,
    page: pdfDoc.numPages,
    totalPages: pdfDoc.numPages,
    summary,
  })

  return {
    text: pages.map((page) => page.result.text).join('\n\n'),
    pages,
    summary,
  }
}

export async function recognizePdfPage(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number,
  session: OCRSession,
  onProgress?: (update: OCRProgressUpdate) => void,
): Promise<OCRLayoutResult> {
  const safePageNumber = Math.max(1, Math.min(pageNumber, pdfDoc.numPages))

  onProgress?.({
    stage: 'rendering-page',
    statusText: formatStatusText('rendering-page', safePageNumber, pdfDoc.numPages),
    progress: 0,
    page: safePageNumber,
    totalPages: pdfDoc.numPages,
    summary: {
      pagesCompleted: 0,
      totalPages: 1,
      lineCount: 0,
      charCount: 0,
    },
  })

  const tempCanvas = document.createElement('canvas')
  await renderPageToCanvas(pdfDoc, safePageNumber, tempCanvas, 2, { pixelRatio: 1 })

  const result = await recognizeCanvasWithLayout(tempCanvas, {
    ...session,
    emit: (update) => {
      onProgress?.({
        ...update,
        page: safePageNumber,
        totalPages: pdfDoc.numPages,
      })
    },
  })

  onProgress?.({
    stage: 'completed',
    statusText: `OCR 已完成：${result.lines.length} 行 / ${getTextLength(result.text)} 字符`,
    progress: 100,
    page: safePageNumber,
    totalPages: pdfDoc.numPages,
    summary: {
      pagesCompleted: 1,
      totalPages: 1,
      lineCount: result.lines.length,
      charCount: getTextLength(result.text),
    },
  })

  return result
}

export function buildOverlayRegions(
  layoutResult: OCRLayoutResult,
): OverlayModel {
  const { imageWidth, imageHeight } = layoutResult
  const baseLines: OverlayLineBox[] = layoutResult.lines
    .map((line, lineIndex) => {
      const rawWords = line.words
        .map((word) => ({
          text: sanitizeText(word.text || '').trim(),
          bbox: clampBBox(word.bbox, imageWidth, imageHeight),
          confidence: word.confidence || 0,
        }))
        .filter((word) => word.text.length > 0 && boxWidth(word.bbox) > 0 && boxHeight(word.bbox) > 0)
        .sort((a, b) => a.bbox.x0 - b.bbox.x0)

      const reliableWords = rawWords.filter((word) => word.confidence >= LOW_CONFIDENCE_THRESHOLD)
      const selectedWords = reliableWords.length >= Math.max(2, Math.ceil(rawWords.length * 0.6))
        ? reliableWords
        : rawWords.filter((word) => word.confidence >= LOW_CONFIDENCE_THRESHOLD * 0.45 || isMeaningfulToken(word.text))
      const resolvedWords = selectedWords.length > 0 ? selectedWords : rawWords
      const mergedWordBox = resolvedWords.length > 0
        ? mergeBBoxes(resolvedWords.map((word) => word.bbox))
        : clampBBox(line.bbox, imageWidth, imageHeight)
      const lineBox = clampBBox(mergedWordBox, imageWidth, imageHeight)
      const confidence = resolvedWords.length > 0
        ? resolvedWords.reduce((sum, word) => sum + word.confidence, 0) / resolvedWords.length
        : 0

      return {
        id: `line-${lineIndex}`,
        text: sanitizeText(line.text).trim(),
        bbox: lineBox,
        words: resolvedWords.map((word, wordIndex) => ({
          id: `line-${lineIndex}-word-${wordIndex}`,
          text: word.text,
          bbox: word.bbox,
          confidence: word.confidence,
          lineIndex,
          rowIndex: -1,
          columnIndex: -1,
        })),
        confidence,
        lineIndex,
        rowIndex: -1,
        columnIndex: -1,
      }
    })
    .filter((line) => line.text.length > 0 && boxWidth(line.bbox) > 0 && boxHeight(line.bbox) > 0)
  const normalizedLines = [...baseLines]

  // Detect if this looks like a dense table/grid layout
  // (many short lines with similar heights clustered in a grid pattern)
  const avgLineWidth = normalizedLines.length > 0
    ? normalizedLines.reduce((sum, l) => sum + boxWidth(l.bbox), 0) / normalizedLines.length
    : imageWidth
  const avgLineHeight = normalizedLines.length > 0
    ? normalizedLines.reduce((sum, l) => sum + boxHeight(l.bbox), 0) / normalizedLines.length
    : 20
  const isDenseLayout = normalizedLines.length > 30
    && avgLineWidth < imageWidth * 0.4
    && avgLineHeight < imageHeight * 0.03

  const columns: Array<{ index: number; bbox: OCRBBox; lines: OverlayLineBox[] }> = []
  const sortedForColumns = [...normalizedLines].sort((a, b) => a.bbox.x0 - b.bbox.x0 || a.bbox.y0 - b.bbox.y0)
  for (const line of sortedForColumns) {
    const targetColumn = columns.find((column) => {
      const horizontalOverlap = overlapX(column.bbox, line.bbox)
      const minWidth = Math.max(1, Math.min(boxWidth(column.bbox), boxWidth(line.bbox)))
      const centerDistance = Math.abs(centerX(column.bbox) - centerX(line.bbox))
      if (isDenseLayout) {
        // Strict mode for tables: require strong horizontal overlap
        return horizontalOverlap / minWidth >= 0.45
          || centerDistance <= Math.max(boxWidth(column.bbox), boxWidth(line.bbox)) * 0.2
      }
      return horizontalOverlap / minWidth >= 0.16
        || centerDistance <= Math.max(48, Math.min(imageWidth * 0.1, Math.max(boxWidth(column.bbox), boxWidth(line.bbox)) * 0.42))
    })

    if (targetColumn) {
      targetColumn.lines.push(line)
      targetColumn.bbox = mergeBBoxes([targetColumn.bbox, line.bbox])
    } else {
      columns.push({
        index: columns.length,
        bbox: line.bbox,
        lines: [line],
      })
    }
  }

  columns.sort((a, b) => a.bbox.x0 - b.bbox.x0)
  columns.forEach((column, columnIndex) => {
    column.index = columnIndex
    column.lines.forEach((line) => {
      line.columnIndex = columnIndex
      line.words = line.words.map((word) => ({ ...word, columnIndex }))
    })
  })

  const rowsByColumn = new Map<number, Array<{ index: number; bbox: OCRBBox; lines: OverlayLineBox[]; columnIndex: number }>>()
  let nextRowIndex = 0

  columns.forEach((column) => {
    const rows: Array<{ index: number; bbox: OCRBBox; lines: OverlayLineBox[]; columnIndex: number }> = []
    const sortedLines = [...column.lines].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0)

    for (const line of sortedLines) {
      const targetRow = rows.find((row) => {
        const overlapTop = Math.max(row.bbox.y0, line.bbox.y0)
        const overlapBottom = Math.min(row.bbox.y1, line.bbox.y1)
        const overlap = Math.max(0, overlapBottom - overlapTop)
        const minHeight = Math.max(1, Math.min(boxHeight(row.bbox), boxHeight(line.bbox)))
        if (isDenseLayout) {
          // Strict: only merge lines that genuinely overlap vertically
          return overlap / minHeight >= 0.5
            || Math.abs(centerY(row.bbox) - centerY(line.bbox)) <= Math.max(boxHeight(row.bbox), boxHeight(line.bbox)) * 0.25
        }
        return overlap / minHeight >= 0.24
          || Math.abs(centerY(row.bbox) - centerY(line.bbox)) <= Math.max(boxHeight(row.bbox), boxHeight(line.bbox)) * 0.55
      })

      if (targetRow) {
        targetRow.lines.push(line)
        targetRow.bbox = mergeBBoxes([targetRow.bbox, line.bbox])
      } else {
        rows.push({
          index: nextRowIndex,
          bbox: line.bbox,
          lines: [line],
          columnIndex: column.index,
        })
        nextRowIndex += 1
      }
    }

    rowsByColumn.set(column.index, rows)
  })

  const coverBoxes: OverlayWordBox[] = []
  const words: OverlayWordBox[] = []

  rowsByColumn.forEach((rows, columnIndex) => {
    const sortedRows = [...rows].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0)
    rowsByColumn.set(columnIndex, sortedRows)

    sortedRows.forEach((row) => {
      row.lines.sort((a, b) => a.bbox.x0 - b.bbox.x0)

      row.lines.forEach((line) => {
        line.rowIndex = row.index
        line.columnIndex = row.columnIndex
        line.bbox = clampBBox(
          line.words.length > 0 ? mergeBBoxes(line.words.map((word) => word.bbox)) : line.bbox,
          imageWidth,
          imageHeight,
        )

        line.words = line.words.map((word) => {
          const nextWord = {
            ...word,
            rowIndex: row.index,
            columnIndex: row.columnIndex,
            bbox: clampBBox(word.bbox, imageWidth, imageHeight),
          }
          words.push(nextWord)
          return nextWord
        })

        const mergedWordGroups: OverlayWordBox[] = []
        for (const word of line.words) {
          const previous = mergedWordGroups[mergedWordGroups.length - 1]
          if (!previous) {
            mergedWordGroups.push({ ...word })
            continue
          }

          const gap = word.bbox.x0 - previous.bbox.x1
          const maxWordH = Math.max(boxHeight(previous.bbox), boxHeight(word.bbox))
          const mergeGap = isDenseLayout
            ? Math.min(4, maxWordH * 0.15)
            : Math.min(8, maxWordH * 0.35)
          const verticalOverlap = overlapY(previous.bbox, word.bbox)
          const minHeight = Math.max(1, Math.min(boxHeight(previous.bbox), boxHeight(word.bbox)))
          const overlapThreshold = isDenseLayout ? 0.7 : 0.58

          if (gap <= mergeGap && verticalOverlap / minHeight >= overlapThreshold) {
            previous.text = `${previous.text}${gap > 1 ? ' ' : ''}${word.text}`.trim()
            previous.bbox = clampBBox(mergeBBoxes([previous.bbox, word.bbox]), imageWidth, imageHeight)
            previous.confidence = (previous.confidence + word.confidence) / 2
          } else {
            mergedWordGroups.push({ ...word })
          }
        }

        coverBoxes.push(...mergedWordGroups.map((word, wordIndex) => ({
          ...word,
          id: `${line.id}-cover-${wordIndex}`,
        })))
      })
    })
  })

  const regions: OverlayRegion[] = normalizedLines.map((line, lineIndex) => {
    const columnRows = rowsByColumn.get(line.columnIndex) || []
    const row = columnRows.find((candidate) => candidate.index === line.rowIndex)
    const column = columns[line.columnIndex]
    if (!row || !column) {
      const fallbackBox = clampBBox(line.bbox, imageWidth, imageHeight)
      return {
        id: `region-${lineIndex}`,
        text: line.text,
        bbox: fallbackBox,
        availableX0: fallbackBox.x0,
        availableX1: fallbackBox.x1,
        maxY1: fallbackBox.y1,
        confidence: line.confidence,
        lineIndex: line.lineIndex,
        rowIndex: line.rowIndex,
        columnIndex: line.columnIndex,
        words: line.words,
      }
    }
    const sorted = [...row.lines].sort((a: OverlayLineBox, b: OverlayLineBox) => a.bbox.x0 - b.bbox.x0)
    const linePosition = sorted.findIndex((candidate) => candidate.id === line.id)
    const prev = linePosition > 0 ? sorted[linePosition - 1] : null
    const next = linePosition < sorted.length - 1 ? sorted[linePosition + 1] : null
    const horizontalGap = Math.max(3, Math.round(boxHeight(line.bbox) * 0.18))
    const columnInset = Math.max(2, Math.round(boxHeight(line.bbox) * 0.12))
    const availableX0 = prev ? prev.bbox.x1 + horizontalGap : Math.max(0, column.bbox.x0 - columnInset)
    const availableX1 = next ? next.bbox.x0 - horizontalGap : Math.min(imageWidth, column.bbox.x1 + columnInset)
    const sortedColumnRows = [...columnRows].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0)
    const rowPosition = sortedColumnRows.findIndex((candidate) => candidate.index === row.index)
    const nextRow = rowPosition >= 0 ? sortedColumnRows[rowPosition + 1] : null
    const maxY1 = nextRow
      ? Math.min(imageHeight, nextRow.bbox.y0 - horizontalGap)
      : Math.min(imageHeight, line.bbox.y1 + Math.max(14, boxHeight(line.bbox) * 1.6))

    const paddedBox = clampBBox(
      makeBBox(
        Math.max(availableX0, line.bbox.x0 - 2),
        Math.max(0, line.bbox.y0 - 1),
        Math.min(availableX1, line.bbox.x1 + 2),
        Math.min(maxY1, line.bbox.y1 + 2),
      ),
      imageWidth,
      imageHeight,
    )

    return {
      id: `region-${lineIndex}`,
      text: line.text,
      bbox: paddedBox,
      availableX0,
      availableX1,
      maxY1: Math.max(paddedBox.y1, maxY1),
      confidence: line.confidence,
      lineIndex: line.lineIndex,
      rowIndex: line.rowIndex,
      columnIndex: line.columnIndex,
      words: line.words,
    }
  })

  const groupTranslationRegions = (candidateRegions: OverlayRegion[]) => {
    const grouped: OverlayRegion[] = []
    const regionsByColumn = new Map<number, OverlayRegion[]>()
    for (const region of candidateRegions) {
      const bucket = regionsByColumn.get(region.columnIndex) || []
      bucket.push(region)
      regionsByColumn.set(region.columnIndex, bucket)
    }

    regionsByColumn.forEach((columnRegions, columnIndex) => {
      const sortedRegions = [...columnRegions].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0)
      let currentGroup: OverlayRegion[] = []

      const flushGroup = () => {
        if (currentGroup.length === 0) return
        const boxes = currentGroup.map((region) => region.bbox)
        const merged = clampBBox(mergeBBoxes(boxes), imageWidth, imageHeight)
        const availableX0 = Math.min(...currentGroup.map((region) => region.availableX0))
        const availableX1 = Math.max(...currentGroup.map((region) => region.availableX1))
        const maxY1 = Math.max(...currentGroup.map((region) => region.maxY1))
        const confidence = currentGroup.reduce((sum, region) => sum + region.confidence, 0) / currentGroup.length
        const words = currentGroup.flatMap((region) => region.words)
        grouped.push({
          id: `translation-region-${columnIndex}-${grouped.length}`,
          text: currentGroup.map((region) => region.text).join(' '),
          bbox: merged,
          availableX0,
          availableX1,
          maxY1,
          confidence,
          lineIndex: currentGroup[0].lineIndex,
          rowIndex: currentGroup[0].rowIndex,
          columnIndex,
          words,
        })
        currentGroup = []
      }

      for (const region of sortedRegions) {
        const previous = currentGroup[currentGroup.length - 1]
        if (!previous) {
          currentGroup.push(region)
          continue
        }

        const verticalGap = region.bbox.y0 - previous.bbox.y1
        const averageHeight = currentGroup.reduce((sum, item) => sum + boxHeight(item.bbox), 0) / currentGroup.length
        const averageLeft = currentGroup.reduce((sum, item) => sum + item.bbox.x0, 0) / currentGroup.length
        const averageWidth = currentGroup.reduce((sum, item) => sum + boxWidth(item.bbox), 0) / currentGroup.length
        const leftDelta = Math.abs(region.bbox.x0 - previous.bbox.x0)
        const anchorDelta = Math.abs(region.bbox.x0 - averageLeft)
        const widthOverlap = overlapX(region.bbox, previous.bbox)
        const minWidth = Math.max(1, Math.min(boxWidth(region.bbox), boxWidth(previous.bbox)))
        const similarColumn = widthOverlap / minWidth >= 0.12
          || leftDelta <= Math.max(56, averageWidth * 0.32)
          || anchorDelta <= Math.max(72, averageWidth * 0.38)
        const groupHeight = region.bbox.y1 - currentGroup[0].bbox.y0
        const currentTextLength = currentGroup.reduce((sum, item) => sum + getTextLength(item.text), 0)
        const maxGroupSize = isDenseLayout ? 3 : 6
        const maxGroupChars = isDenseLayout ? 120 : 360
        const maxGapFactor = isDenseLayout ? 0.5 : 1.12
        const maxGroupHeightFactor = isDenseLayout ? 3.0 : 6.4
        const canMerge = currentGroup.length < maxGroupSize
          && currentTextLength <= maxGroupChars
          && verticalGap >= -Math.max(6, averageHeight * 0.28)
          && verticalGap <= Math.max(isDenseLayout ? 8 : 26, averageHeight * maxGapFactor)
          && similarColumn
          && groupHeight <= Math.max(isDenseLayout ? 80 : 260, averageHeight * maxGroupHeightFactor)

        if (canMerge) {
          currentGroup.push(region)
        } else {
          flushGroup()
          currentGroup.push(region)
        }
      }

      flushGroup()
    })

    return grouped.sort((a, b) => a.columnIndex - b.columnIndex || a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0)
  }

  const preferredTranslationCandidates = regions.filter((region) => isLikelyTranslatableRegion(region.text))
  const broadTranslationCandidates = regions.filter((region) => isBroadlyTranslatableRegion(region.text))
  const preferredTranslationRegions = groupTranslationRegions(preferredTranslationCandidates)
  const broadTranslationRegions = groupTranslationRegions(broadTranslationCandidates)
  const preferredCharCoverage = preferredTranslationCandidates.reduce((sum, region) => sum + getTextLength(region.text), 0)
  const broadCharCoverage = broadTranslationCandidates.reduce((sum, region) => sum + getTextLength(region.text), 0)
  const totalRegionChars = Math.max(1, regions.reduce((sum, region) => sum + getTextLength(region.text), 0))
  const groupedFallbackTranslationRegions = groupTranslationRegions(
    [...regions]
      .filter((region) => getTextLength(region.text) > 0)
      .sort((a, b) => a.columnIndex - b.columnIndex || a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0),
  )

  const hasUsefulPreferredRegions = preferredTranslationRegions.length > 0 && (
    preferredTranslationRegions.length >= Math.max(3, Math.round(regions.length * 0.38))
    || preferredCharCoverage >= totalRegionChars * 0.58
    || broadTranslationRegions.length === 0
  )
  const hasUsefulBroadRegions = broadTranslationRegions.length > 0 && (
    broadTranslationRegions.length >= Math.max(2, Math.round(regions.length * 0.28))
    || broadCharCoverage >= totalRegionChars * 0.52
  )
  const translationRegions = hasUsefulPreferredRegions
    ? preferredTranslationRegions
    : hasUsefulBroadRegions
      ? broadTranslationRegions
      : groupedFallbackTranslationRegions

  return {
    words,
    coverBoxes,
    lines: normalizedLines.sort((a, b) => a.columnIndex - b.columnIndex || a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0),
    regions,
    translationRegions,
    imageWidth,
    imageHeight,
  }
}

export function fitTranslatedRegionText(
  region: OverlayRegion,
  translatedText: string,
  options: FitTranslatedRegionOptions = {},
): FittedTranslatedRegion {
  const text = sanitizeText(translatedText).trim() || region.text
  const isCjk = /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(text)
  const paddingX = isCjk ? 6 : 7
  const paddingY = isCjk ? 4 : 5
  const minFontSize = options.minFontSize ?? 10
  const maxFontSize = options.maxFontSize ?? 28
  const baseHeight = Math.max(16, boxHeight(region.bbox))
  const maxHeight = Math.max(baseHeight, region.maxY1 - region.bbox.y0)
  const tightWidth = Math.max(24, boxWidth(region.bbox))
  const expandableLeft = Math.max(0, region.bbox.x0 - region.availableX0)
  const expandableRight = Math.max(0, region.availableX1 - region.bbox.x1)
  const maxWidth = Math.max(tightWidth, tightWidth + expandableLeft + expandableRight)
  const baseFontSize = clamp(baseHeight * (isCjk ? 0.82 : 0.72), minFontSize, maxFontSize)
  const step = 0.5
  const lineHeightFactor = isCjk ? 1.18 : 1.24
  const widthCandidates = [
    tightWidth,
    Math.min(maxWidth, tightWidth + Math.min(expandableRight, Math.max(18, tightWidth * 0.12))),
    Math.min(maxWidth, tightWidth + Math.min(expandableRight + expandableLeft, Math.max(36, tightWidth * 0.28))),
    maxWidth,
  ].filter((width, index, widths) => (
    width >= tightWidth
    && widths.findIndex((candidate) => Math.abs(candidate - width) < 1) === index
  ))

  let fontSize = baseFontSize
  let bestLines = [text]
  let bestWidth = tightWidth
  let bestLeft = region.bbox.x0

  while (fontSize >= minFontSize) {
    for (const candidateWidth of widthCandidates) {
      const extraWidth = Math.max(0, candidateWidth - tightWidth)
      const leftShift = Math.max(0, extraWidth - expandableRight)
      const candidateLeft = clamp(region.bbox.x0 - Math.min(expandableLeft, leftShift), region.availableX0, region.bbox.x0)
      const contentWidth = Math.max(16, candidateWidth - paddingX * 2)
      const lines = wrapTextLines(text, contentWidth, fontSize, isCjk)
      const lineHeight = fontSize * lineHeightFactor
      const neededHeight = lines.length * lineHeight + paddingY * 2
      if (neededHeight <= maxHeight) {
        const fittedHeight = Math.max(baseHeight, neededHeight)
        return {
          text,
          lines,
          left: candidateLeft,
          fontSize,
          lineHeight,
          width: candidateWidth,
          height: fittedHeight,
          paddingX,
          paddingY,
          isCjk,
        }
      }

      bestLines = lines
      bestWidth = candidateWidth
      bestLeft = candidateLeft
    }

    fontSize -= step
  }

  const maxLines = Math.max(1, Math.floor((maxHeight - paddingY * 2) / (minFontSize * lineHeightFactor)))
  const ellipsized = ellipsizeLines(bestLines, maxLines)
  return {
    text,
    lines: ellipsized,
    left: bestLeft,
    fontSize: minFontSize,
    lineHeight: minFontSize * lineHeightFactor,
    width: bestWidth,
    height: Math.max(baseHeight, Math.min(maxHeight, ellipsized.length * minFontSize * lineHeightFactor + paddingY * 2)),
    paddingX,
    paddingY,
    isCjk,
  }
}
