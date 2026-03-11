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
  scale: number = 1.5
): Promise<{ width: number; height: number; originalWidth: number; originalHeight: number }> {
  const page = await pdf.getPage(pageNum)
  const viewport = page.getViewport({ scale })

  // 设置 Canvas 尺寸（考虑设备像素比以获得清晰渲染）
  const dpr = window.devicePixelRatio || 1
  canvas.width = viewport.width * dpr
  canvas.height = viewport.height * dpr
  canvas.style.width = `${viewport.width}px`
  // 关键修复：CSS 高度使用 auto，避免在移动端 max-width 缩放时出现强制拉伸
  // 实际渲染尺寸由 canvas.width / canvas.height 决定，显示层保持原始宽高比
  canvas.style.height = 'auto'

  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)

  // 渲染页面到 Canvas
  // pdfjs-dist v5+ 需要同时传 canvas 和 canvasContext
  await page.render({
    canvasContext: ctx,
    viewport,
    canvas,
  } as any).promise

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
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(lang)

  try {
    const imageData = canvas.toDataURL('image/png')
    const { data } = await worker.recognize(imageData)

    // Tesseract.js v7 的结构: data.blocks → paragraphs → lines → words
    // 使用 any 绕过 TS 类型限制，运行时 Tesseract 会返回完整的嵌套结构
    const rawData = data as any
    const rawLines: any[] = rawData.lines || []

    // 如果 data.lines 不直接可用，从 blocks → paragraphs → lines 路径提取
    const flatLines: any[] = rawLines.length > 0
      ? rawLines
      : (rawData.blocks || []).flatMap((block: any) =>
          (block.paragraphs || []).flatMap((para: any) => para.lines || [])
        )

    const lines: OCRLineItem[] = flatLines.map((line: any) => ({
      text: (line.text || '').trim(),
      bbox: line.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 },
      words: (line.words || []).map((word: any) => ({
        text: word.text || '',
        bbox: word.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 },
        confidence: word.confidence || 0,
      })),
    })).filter((line: OCRLineItem) => line.text.length > 0)

    return {
      text: data.text || '',
      lines,
      imageWidth: canvas.width,
      imageHeight: canvas.height,
    }
  } finally {
    await worker.terminate()
  }
}

/**
 * 获取数字版 PDF 某一页的文本层数据（带精确位置信息）
 *
 * 对于非扫描版 PDF，pdf.js 能直接提取每个文字项的精确坐标和变换矩阵。
 * 返回的数据可用于在 Canvas 上叠加透明文字层，实现文本选择、搜索、翻译。
 *
 * @param pdf     - PDF 文档对象
 * @param pageNum - 页码
 * @param scale   - 缩放比例（必须和 Canvas 渲染时一致）
 * @returns 文本项数组 + viewport 尺寸
 */
export async function getTextLayerData(
  pdf: PDFDocumentProxy,
  pageNum: number,
  scale: number
): Promise<{
  items: PDFTextLayerItem[]
  viewportWidth: number
  viewportHeight: number
}> {
  const page = await pdf.getPage(pageNum)
  const viewport = page.getViewport({ scale })
  const content = await page.getTextContent()

  const items: PDFTextLayerItem[] = content.items
    .filter((item: any) => item.str && item.str.length > 0)
    .map((item: any) => {
      // item.transform = [scaleX, skewY, skewX, scaleY, translateX, translateY]
      // 用 viewport.transform 将 PDF 坐标转为屏幕坐标
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)

      // tx[0], tx[1] → 字号和旋转分量
      const fontSize = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1])
      // 旋转角度
      const angle = Math.atan2(tx[1], tx[0])

      // tx[4] = 屏幕 x，tx[5] = 屏幕 y（基线位置）
      // y 需要往上偏移一个字号高度（因为 PDF 文字锚点在基线）
      const x = tx[4]
      const y = tx[5] - fontSize

      // CSS transform：处理旋转和缩放
      const cosA = Math.cos(angle)
      const sinA = Math.sin(angle)
      const cssTransform =
        Math.abs(angle) > 0.01
          ? `matrix(${cosA.toFixed(4)},${sinA.toFixed(4)},${(-sinA).toFixed(4)},${cosA.toFixed(4)},0,0)`
          : ''

      return {
        str: item.str,
        x,
        y,
        width: (item.width || 0) * scale,
        fontSize,
        cssTransform,
      }
    })

  return {
    items,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
  }
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
  const totalPages = pdf.numPages
  const pageTexts: string[] = []

  // 动态导入 tesseract.js
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(lang)

  try {
    for (let i = 1; i <= totalPages; i++) {
      // 通知进度
      onProgress?.(Math.round((i - 1) / totalPages * 100), i, totalPages)

      // 创建临时 Canvas
      const tempCanvas = document.createElement('canvas')
      await renderPageToCanvas(pdf, i, tempCanvas, 2.0) // 用 2x 缩放提高 OCR 准确度

      // 对这一页执行 OCR
      const imageData = tempCanvas.toDataURL('image/png')
      const { data } = await worker.recognize(imageData)
      pageTexts.push(data.text || '')

      // 通知本页完成
      onProgress?.(Math.round(i / totalPages * 100), i, totalPages)
    }
  } finally {
    await worker.terminate()
  }

  return pageTexts.join('\n\n')
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
