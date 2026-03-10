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

// ===== 配置 Worker =====
// Vite 无法直接 import pdf.worker.js，使用 CDN 的 worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

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

// ========== 核心函数 ==========

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
    // File 对象 → 转 ArrayBuffer
    data = await fileToArrayBuffer(source)
  } else {
    // ArrayBuffer 或 URL 字符串直接使用
    data = source
  }

  // 如果是 ArrayBuffer，传 { data }；如果是字符串（URL），传 { url }
  if (typeof data === 'string') {
    return pdfjsLib.getDocument({ url: data }).promise
  }
  return pdfjsLib.getDocument({ data }).promise
}

/**
 * 从 PDF 文件中提取全部文本
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  const pdf = await loadPDFDocument(file)
  const pageTexts: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item: any) => item.str)
      .join(' ')
    pageTexts.push(text)
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
 */
export async function getPDFMetadata(file: File): Promise<PDFMeta> {
  const pdf = await loadPDFDocument(file)
  const metadata = await pdf.getMetadata()
  const info = metadata.info as Record<string, any> | undefined

  return {
    title: info?.Title || file.name.replace(/\.pdf$/i, ''),
    author: info?.Author || '未知作者',
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
  canvas.style.height = `${viewport.height}px`

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
 * 对 Canvas 内容执行 OCR 文字识别
 *
 * 使用 tesseract.js 对 Canvas 图像内容进行文字识别。
 * 支持英文和中文识别。
 *
 * @param canvas - 包含 PDF 页面图像的 Canvas 元素
 * @param lang   - OCR 识别语言，默认 'eng'（英文），可用 'chi_sim' 中文简体
 * @returns 识别出的文本内容
 */
export async function ocrPageFromCanvas(
  canvas: HTMLCanvasElement,
  lang: string = 'eng'
): Promise<string> {
  // 动态导入 tesseract.js（避免首屏加载时加载 OCR 引擎）
  const { createWorker } = await import('tesseract.js')

  // 创建 OCR Worker
  const worker = await createWorker(lang)

  try {
    // 将 Canvas 转为图片数据
    const imageData = canvas.toDataURL('image/png')

    // 执行识别
    const { data } = await worker.recognize(imageData)
    return data.text || ''
  } finally {
    // 清理 Worker 资源
    await worker.terminate()
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
