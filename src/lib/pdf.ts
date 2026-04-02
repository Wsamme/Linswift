/**
 * pdf.ts — PDF 处理工具库（V2：支持页面渲染 + OCR）
 *
 * 功能：
 *   - extractTextFromPDF(file)      — 提取全文文本
 *   - extractPageText(file, pageNum) — 提取指定页文本
 *   - getPDFMetadata(file)           — 获取元数据
 *   - extractAllPages(file)          — 逐页提取文本
 *   - renderPageToCanvas(pdf, pageNum, canvas, scale) — 渲染 PDF 页面到 Canvas
 *   - isScannedPDF(file)             — 检测 PDF 是否为扫描版（OCR 用）
 *   - ocrPageFromCanvas(canvas)      — 对 Canvas 内容执行 OCR
 *   - loadPDFDocument(source)        — 加载 PDF 文档对象（File 或 URL）
 *   - formatFileSize(bytes)          — 格式化文件大小
 *
 * 技术说明：
 *   - 使用 pdfjs-dist 做 PDF 解析和渲染
 *   - 使用 tesseract.js 做 OCR 文字识别（扫描版 PDF）
 *   - Vite 环境下用 CDN Worker 避免打包问题
 */

import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// ===== 配置 Worker =====
// 使用 Vite 打包后的本地 worker URL，避免依赖外网 CDN 导致加载失败
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const activeCanvasRenderTasks = new WeakMap<HTMLCanvasElement, { cancel: () => void; promise: Promise<unknown> }>()

// ========== 类型定义 ==========

/** PDF 元数据 */
export interface PDFMeta {
  title: string
  author: string
  numPages: number
  fileSize: number
}

/** 单页提取结果 */
export interface PageResult {
  pageNum: number
  text: string
}

// ===== OCR 布局保留相关类型 =====

/** OCR 识别出的单个词，包含位置信息 */
export interface OCRWordItem {
  text: string
  /** 词的边界框（像素坐标，相对于 OCR 输入图片） */
  bbox: { x0: number; y0: number; x1: number; y1: number }
  /** 识别置信度 0-100 */
  confidence: number
}

/** OCR 识别出的一行文字，包含该行内所有词 */
export interface OCRLineItem {
  text: string
  bbox: { x0: number; y0: number; x1: number; y1: number }
  words: OCRWordItem[]
}

/** 一页 OCR 的完整结果：文本 + 所有行的布局信息 */
export interface OCRLayoutResult {
  text: string
  lines: OCRLineItem[]
  /** OCR 输入图片的像素宽度（= canvas.width，包含 dpr） */
  imageWidth: number
  /** OCR 输入图片的像素高度（= canvas.height，包含 dpr） */
  imageHeight: number
}

/** PDF 原生文本项（数字版 PDF），带视口坐标 */
export interface PDFTextLayerItem {
  str: string
  /** 在 viewport 坐标系下的 x 坐标（CSS 像素） */
  x: number
  /** 在 viewport 坐标系下的 y 坐标（CSS 像素，已翻转为屏幕方向） */
  y: number
  /** 文字宽度（CSS 像素） */
  width: number
  /** 近似字号（CSS 像素） */
  fontSize: number
  /** CSS transform 字符串，用于精确定位旋转文字 */
  cssTransform: string
}

/** 合并后的文本行（用于按行翻译和覆盖渲染） */
export interface TextLine {
  /** 该行的完整文本 */
  text: string
  /** 行起始 x 坐标 */
  x: number
  /** 行 y 坐标 */
  y: number
  /** 行宽度 */
  width: number
  /** 行高度（基于字号） */
  height: number
  /** 字号 */
  fontSize: number
}

/**
 * 将分散的 PDF 文本项按 y 坐标合并为逻辑行
 *
 * PDF 的 getTextContent 返回的是独立的文本片段（可能是单词、字符甚至空格），
 * 这个函数将 y 坐标相近的片段合并为完整的一行文字。
 */
export function groupItemsIntoLines(items: PDFTextLayerItem[]): TextLine[] {
  if (items.length === 0) return []

  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: { items: PDFTextLayerItem[]; y: number }[] = []

  let curGroup: PDFTextLayerItem[] = [sorted[0]]
  let curY = sorted[0].y

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i]
    // y 坐标差距小于半个字号，视为同一行
    const threshold = Math.max(item.fontSize, curGroup[0].fontSize) * 0.6
    if (Math.abs(item.y - curY) < threshold) {
      curGroup.push(item)
    } else {
      lines.push({ items: curGroup, y: curY })
      curGroup = [item]
      curY = item.y
    }
  }
  lines.push({ items: curGroup, y: curY })

  return lines.map(line => {
    const byX = line.items.sort((a, b) => a.x - b.x)
    const first = byX[0]

    // pdf.js 有时返回重叠的文本项（如 "positioning" 和 "ing."）
    // 检测 x 范围重叠，跳过已覆盖的部分
    let text = ''
    let lastEnd = -Infinity
    for (const it of byX) {
      if (it.x >= lastEnd - 1) {
        text += it.str
      } else if (it.x + it.width > lastEnd) {
        // 部分重叠——只保留超出已有范围的字符
        const overlapRatio = Math.min(1, (lastEnd - it.x) / Math.max(1, it.width))
        const skip = Math.max(0, Math.round(overlapRatio * it.str.length))
        text += it.str.slice(skip)
      }
      lastEnd = Math.max(lastEnd, it.x + it.width)
    }

    let minY = Infinity, maxY = -Infinity
    for (const it of byX) {
      minY = Math.min(minY, it.y)
      maxY = Math.max(maxY, it.y + it.fontSize)
    }

    return {
      text,
      x: first.x,
      y: minY,
      width: lastEnd - first.x,
      height: maxY - minY,
      fontSize: first.fontSize,
    }
  })
}

// ========== 核心函数 ==========

/**
 * 清洗文本中的无效 Unicode 字符
 *
 * 某些 PDF 使用自定义字体编码，提取出来的文字可能包含：
 * - 孤立的代理对（surrogate）字符：U+D800 ~ U+DFFF
 * - NULL 字节和不可见控制字符：U+0000 ~ U+0008, U+000E ~ U+001F
 * - 私有区域的不可打印码点
 * 这些字符会导致 JSON 序列化或数据库写入失败。
 */
export function sanitizeText(text: string): string {
  if (!text) return ''
  return text
    // 移除 NULL 字节和大部分 C0 控制字符（保留 \t \n \r）
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    // 移除孤立的 UTF-16 代理对半体（JSON.stringify 可能崩溃的元凶）
    .replace(/[\uD800-\uDFFF]/g, '')
    // 移除 Unicode "replacement character" 堆积
    .replace(/\uFFFD{3,}/g, '\uFFFD')
}

/**
 * 将 File 对象转换为 ArrayBuffer
 */
function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * 加载 PDF 文档对象
 * 支持 File 对象、ArrayBuffer 或 URL 字符串
 *
 * @param source - File 对象、ArrayBuffer 或 URL 字符串
 * @returns PDFDocumentProxy 对象，可用于后续渲染和文本提取
 */
export async function loadPDFDocument(
  source: File | ArrayBuffer | string
): Promise<PDFDocumentProxy> {
  let data: ArrayBuffer | string

  if (source instanceof File) {
    data = await fileToArrayBuffer(source)
  } else {
    data = source
  }

  try {
    if (typeof data === 'string') {
      return await pdfjsLib.getDocument({ url: data }).promise
    }
    return await pdfjsLib.getDocument({ data }).promise
  } catch (err: any) {
    const msg = String(err?.message || '')
    // 常见的 PDF 解析错误：Unicode 转义、加密、损坏
    if (msg.includes('Unicode') || msg.includes('escape')) {
      throw new Error('PDF 内部编码异常（Unicode 错误），但文件可能仍可打开渲染')
    }
    if (msg.includes('password') || msg.includes('encrypted')) {
      throw new Error('PDF 已加密，请提供未加密版本')
    }
    throw err
  }
}

/**
 * 从 PDF 文件中提取全部文本
 *
 * 逐页提取并 try-catch，某一页失败不会导致整体失败。
 * 提取后的文本经过 sanitizeText 消毒，移除无效 Unicode 字符。
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  const pdf = await loadPDFDocument(file)
  const pageTexts: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const text = content.items
        .map((item: any) => item.str || '')
        .join(' ')
      pageTexts.push(sanitizeText(text))
    } catch {
      // 单页提取失败（如 Unicode 错误、字体编码问题）跳过该页
      pageTexts.push(`[第 ${i} 页文本提取失败]`)
    }
  }

  return pageTexts.join('\n\n')
}

/**
 * 从 PDF 提取指定页的文本
 */
export async function extractPageText(file: File, pageNum: number): Promise<string> {
  const pdf = await loadPDFDocument(file)

  if (pageNum < 1 || pageNum > pdf.numPages) {
    throw new Error(`页码超出范围: ${pageNum}，总页数: ${pdf.numPages}`)
  }

  const page = await pdf.getPage(pageNum)
  const content = await page.getTextContent()
  return content.items.map((item: any) => item.str).join(' ')
}

/**
 * 获取 PDF 文件的元数据
 *
 * 有些 PDF 的元数据包含无效 Unicode（如损坏的 XMP 或 Info 字典），
 * 需要 try-catch + sanitize 处理。
 */
export async function getPDFMetadata(file: File): Promise<PDFMeta> {
  let pdf: PDFDocumentProxy
  try {
    pdf = await loadPDFDocument(file)
  } catch {
    // 无法加载 PDF 文档，返回基于文件名的最小元数据
    return {
      title: sanitizeText(file.name.replace(/\.pdf$/i, '')),
      author: '未知作者',
      numPages: 0,
      fileSize: file.size,
    }
  }

  let info: Record<string, any> | undefined
  try {
    const metadata = await pdf.getMetadata()
    info = metadata.info as Record<string, any> | undefined
  } catch {
    info = undefined
  }

  return {
    title: sanitizeText(info?.Title || '') || file.name.replace(/\.pdf$/i, ''),
    author: sanitizeText(info?.Author || '') || '未知作者',
    numPages: pdf.numPages,
    fileSize: file.size,
  }
}

/**
 * 逐页提取 PDF 的所有文本
 */
export async function extractAllPages(file: File): Promise<PageResult[]> {
  const pdf = await loadPDFDocument(file)
  const results: PageResult[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map((item: any) => item.str).join(' ')
    results.push({ pageNum: i, text })
  }

  return results
}

// ========== V2 新增功能 ==========

/**
 * 渲染 PDF 某一页到 Canvas 元素上
 *
 * @param pdf     - 已加载的 PDF 文档对象
 * @param pageNum - 页码（从 1 开始）
 * @param canvas  - 目标 Canvas 元素
 * @param scale   - 缩放比例（默认 1.5，清晰度和性能平衡）
 * @returns 页面的原始宽高（像素），以及渲染后的宽高
 */
export async function renderPageToCanvas(
  pdf: PDFDocumentProxy,
  pageNum: number,
  canvas: HTMLCanvasElement,
  scale: number = 1.5,
  options?: { pixelRatio?: number },
): Promise<{ width: number; height: number; originalWidth: number; originalHeight: number }> {
  const page = await pdf.getPage(pageNum)
  const viewport = page.getViewport({ scale })

  const previousTask = activeCanvasRenderTasks.get(canvas)
  if (previousTask) {
    previousTask.cancel()
    try {
      await previousTask.promise
    } catch {
      // pdf.js cancels the in-flight render by rejecting the promise.
    }
  }

  // 设置 Canvas 尺寸（考虑设备像素比以获得清晰渲染）
  const dpr = Math.max(1, options?.pixelRatio ?? (window.devicePixelRatio || 1))
  canvas.width = viewport.width * dpr
  canvas.height = viewport.height * dpr
  canvas.style.width = `${viewport.width}px`
  canvas.style.height = `${viewport.height}px`

  const ctx = canvas.getContext('2d')!
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.scale(dpr, dpr)

  // 渲染页面到 Canvas
  // pdfjs-dist v5+ 需要同时传 canvas 和 canvasContext
  const renderTask = page.render({
    canvasContext: ctx,
    viewport,
    canvas,
  } as any)
  activeCanvasRenderTasks.set(canvas, {
    cancel: () => renderTask.cancel(),
    promise: renderTask.promise,
  })

  try {
    await renderTask.promise
  } finally {
    const activeTask = activeCanvasRenderTasks.get(canvas)
    if (activeTask?.promise === renderTask.promise) {
      activeCanvasRenderTasks.delete(canvas)
    }
  }

  // 返回尺寸信息
  const originalViewport = page.getViewport({ scale: 1 })
  return {
    width: viewport.width,
    height: viewport.height,
    originalWidth: originalViewport.width,
    originalHeight: originalViewport.height,
  }
}

/**
 * 检测 PDF 是否为扫描版（图片型 PDF，文本内容极少）
 *
 * 原理：抽取前 3 页的文本内容，如果每页平均文字数少于 20 个字符，
 * 则认为是扫描版 PDF，需要 OCR 处理。
 *
 * @param file - PDF File 对象
 * @returns true = 扫描版（需要 OCR），false = 文本版
 */
export async function isScannedPDF(file: File): Promise<boolean> {
  const pdf = await loadPDFDocument(file)
  const pagesToCheck = Math.min(pdf.numPages, 3) // 检查前 3 页
  let totalChars = 0

  for (let i = 1; i <= pagesToCheck; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map((item: any) => item.str).join('').trim()
    totalChars += text.length
  }

  // 每页平均少于 20 个字符 → 很可能是扫描版
  const avgChars = totalChars / pagesToCheck
  return avgChars < 20
}

/**
 * 对 Canvas 内容执行 OCR 文字识别（简单版，只返回文本）
 */
export async function ocrPageFromCanvas(
  canvas: HTMLCanvasElement,
  lang: string = 'eng'
): Promise<string> {
  const result = await ocrPageWithLayout(canvas, lang)
  return result.text
}

/**
 * 对 Canvas 内容执行 OCR 文字识别 —— 布局保留版
 *
 * 除了返回全文文本，还返回每行、每词的精确边界框（bounding box），
 * 可以用于在 PDF 页面上叠加透明文字层，实现"保留原始排版"的效果。
 *
 * @param canvas - 包含 PDF 页面图像的 Canvas 元素
 * @param lang   - OCR 识别语言，默认 'eng'
 * @returns OCRLayoutResult，包含文本和所有行/词的位置信息
 */
export async function ocrPageWithLayout(
  canvas: HTMLCanvasElement,
  lang: string = 'eng'
): Promise<OCRLayoutResult> {
  const { createOCRSession, recognizeCanvasWithLayout } = await import('./ocr')
  const session = await createOCRSession(lang)
  try {
    return await recognizeCanvasWithLayout(canvas, session)
  } finally {
    await session.terminate()
  }
}

/**
 * 使用 pdf.js 内置 TextLayer 渲染文本层到一个临时容器，
 * 然后读取浏览器计算的精确位置。
 *
 * 这比手动从 transform 矩阵计算坐标可靠得多，
 * 因为 pdf.js TextLayer 内部处理了所有字体度量、旋转、缩放的细节。
 */
export async function renderNativeTextLayer(
  pdf: PDFDocumentProxy,
  pageNum: number,
  scale: number,
  container: HTMLDivElement
): Promise<{ viewportWidth: number; viewportHeight: number }> {
  const page = await pdf.getPage(pageNum)
  const viewport = page.getViewport({ scale })

  // 清空旧内容
  container.innerHTML = ''

  // 设置容器尺寸匹配 viewport
  container.style.width = `${viewport.width}px`
  container.style.height = `${viewport.height}px`

  const { TextLayer } = await import('pdfjs-dist')
  const textLayer = new TextLayer({
    textContentSource: await page.getTextContent(),
    container,
    viewport,
  })
  await textLayer.render()

  return {
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
  }
}

/**
 * 从 TextLayer 渲染的 DOM 中提取行数据
 * 用于翻译模式（需要按行翻译和替换）
 */
export function extractLinesFromTextLayer(container: HTMLDivElement): TextLine[] {
  const spans = Array.from(container.querySelectorAll('span'))
  if (spans.length === 0) return []

  // 按 offsetTop 分组为逻辑行
  const groups: Map<number, { spans: HTMLSpanElement[]; y: number }> = new Map()

  for (const span of spans) {
    if (!span.textContent?.trim()) continue
    const y = span.offsetTop
    const fontSize = parseFloat(getComputedStyle(span).fontSize) || 12

    // 找到 y 坐标相近的已有组
    let matched = false
    for (const [, group] of groups) {
      if (Math.abs(y - group.y) < fontSize * 0.5) {
        group.spans.push(span)
        matched = true
        break
      }
    }
    if (!matched) {
      groups.set(y, { spans: [span], y })
    }
  }

  const lines: TextLine[] = []
  for (const group of groups.values()) {
    const sorted = group.spans.sort((a, b) => a.offsetLeft - b.offsetLeft)
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const text = sorted.map(s => s.textContent || '').join('')
    if (!text.trim()) continue

    const fontSize = parseFloat(getComputedStyle(first).fontSize) || 12
    lines.push({
      text,
      x: first.offsetLeft,
      y: group.y,
      width: (last.offsetLeft + last.offsetWidth) - first.offsetLeft,
      height: first.offsetHeight,
      fontSize,
    })
  }

  return lines.sort((a, b) => a.y - b.y)
}

/**
 * 对整个 PDF 执行 OCR 文字提取（扫描版 PDF 专用）
 *
 * 流程：逐页渲染到临时 Canvas → 对 Canvas 执行 OCR → 合并文本
 *
 * @param file       - PDF File 对象
 * @param lang       - OCR 语言
 * @param onProgress - 进度回调（0~100）
 * @returns 全文 OCR 提取的文本
 */
export async function ocrExtractFromPDF(
  file: File,
  lang: string = 'eng',
  onProgress?: (percent: number, page: number, total: number) => void
): Promise<string> {
  const pdf = await loadPDFDocument(file)
  const { createOCRSession, recognizePdfDocument } = await import('./ocr')
  const session = await createOCRSession(lang)
  try {
    const result = await recognizePdfDocument(pdf, session, (update) => {
      if (update.page && update.totalPages) {
        onProgress?.(update.progress ?? 0, update.page, update.totalPages)
      }
    })
    return result.text
  } finally {
    await session.terminate()
  }
}

/**
 * 获取 PDF 指定页的文本内容（用于文本层覆盖）
 * 返回每个文本项的位置和内容信息
 */
export async function getPageTextItems(
  pdf: PDFDocumentProxy,
  pageNum: number
): Promise<Array<{ str: string; x: number; y: number; width: number; height: number; fontName: string }>> {
  const page = await pdf.getPage(pageNum)
  const content = await page.getTextContent()
  const viewport = page.getViewport({ scale: 1 })

  return content.items.map((item: any) => {
    // 使用 transform 矩阵计算位置
    const tx = item.transform
    return {
      str: item.str,
      x: tx[4], // x 坐标
      y: viewport.height - tx[5], // y 坐标（PDF 坐标系 y 轴向上，需要翻转）
      width: item.width || 0,
      height: item.height || tx[0] || 12, // 字体大小
      fontName: item.fontName || '',
    }
  })
}

/**
 * 格式化文件大小为可读字符串
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Render the first page of a PDF as a JPEG thumbnail data URL.
 * Returns a small base64 string suitable for storing as a cover image.
 */
export async function generatePDFThumbnail(
  file: File,
  options?: { maxWidth?: number; maxHeight?: number; quality?: number },
): Promise<string | null> {
  const maxW = options?.maxWidth ?? 180
  const maxH = options?.maxHeight ?? 240
  const quality = options?.quality ?? 0.6

  try {
    const pdf = await loadPDFDocument(file)
    const page = await pdf.getPage(1)

    // Calculate scale to fit within maxW × maxH
    const unscaled = page.getViewport({ scale: 1 })
    const scale = Math.min(maxW / unscaled.width, maxH / unscaled.height)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    pdf.destroy()
    return dataUrl
  } catch {
    return null
  }
}
