import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ChevronLeft, ZoomIn, ZoomOut, ChevronRight, Volume2,
  Settings, Loader2, BookOpen, ArrowLeft, ArrowRight,
  Maximize2, X, Check, Languages, AlertTriangle, RefreshCcw,
} from 'lucide-react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import {
  loadPDFDocument,
  renderPageToCanvas,
  isScannedPDF,
  renderNativeTextLayer,
  extractTextFromPDF,
  getPDFMetadata,
  sanitizeText,
  type OCRLayoutResult,
} from '../lib/pdf'
import {
  buildOverlayRegions,
  createOCRSession,
  fitTranslatedRegionText,
  recognizePdfPage,
  OCRServiceError,
  type OverlayRegion,
  type OCRProgressUpdate,
} from '../lib/ocr'
import { translateBatch, type BatchTranslationResult } from '../services/gemini'
import { speakEnglish, speakAuto } from '../lib/tts'
import { supabase, uploadFile, type UserBook } from '../lib/supabase'
import { useVocabulary } from '../hooks/useVocabulary'
import { useAuth } from '../contexts/AuthContext'
import { useLogicalBack } from '../hooks/useLogicalBack'
import { navigateSafely } from '../lib/navigation'
import {
  DAILY_GOAL_MAX,
  DAILY_GOAL_MIN,
  loadLearnSettings,
  normalizeDailyGoal,
  saveLearnSettings,
} from '../lib/learnSettings'

// ===== 阅读器设置类型 =====
const READER_SETTINGS_KEY = 'linswift_reader_settings'

interface ReaderSettings {
  // 语言设置
  ttsLang: string          // TTS 朗读语言
  ocrLang: string          // 内部兼容字段，前台不再暴露
  translateTo: string      // 翻译目标语言
  // 学习设置
  dailyGoal: number        // 每日新学单词数
  learningMode: 'listen' | 'read' | 'write'
  autoPlayWord: boolean    // 自动播放单词发音
  showExamples: boolean    // 显示例句
  reviewReminder: boolean  // 复习提醒
  // 阅读设置
  autoTranslate: boolean   // 自动翻译选中文本
  autoCollect: boolean     // 自动收录生词
  fontSize: number         // 文本模式字体大小
}

interface PageTranslationSummary {
  source: 'ocr' | 'text-layer'
  regionCount: number
  requestedCount: number
  apiTranslatedCount: number
  fallbackCount: number
  changedCount: number
}

const DEFAULT_READER_SETTINGS: ReaderSettings = {
  ttsLang: 'en-US',
  ocrLang: 'eng+chi_sim',
  translateTo: 'zh-CN',
  dailyGoal: 20,
  learningMode: 'read',
  autoPlayWord: true,
  showExamples: false,
  reviewReminder: true,
  autoTranslate: true,
  autoCollect: true,
  fontSize: 15,
}

// 叠加层显示模式
type OverlayMode = 'off' | 'select' | 'debug' | 'cover' | 'translate'

// TTS 语言选项
const TTS_LANG_OPTIONS = [
  { value: 'en-US', label: '🇺🇸 英语' },
  { value: 'zh-CN', label: '🇨🇳 简体中文' },
  { value: 'ja-JP', label: '🇯🇵 日语' },
]

// 翻译目标语言选项
const TRANSLATE_LANG_OPTIONS = [
  { value: 'zh-CN', label: '🇨🇳 中文' },
  { value: 'en', label: '🇺🇸 English' },
  { value: 'ja', label: '🇯🇵 日本語' },
]

// 每日目标选项
const GOAL_OPTIONS = [10, 20, 30, 50]

// 学习模式选项
const MODE_OPTIONS = [
  { key: 'listen' as const, icon: '👂', label: '听力' },
  { key: 'read' as const, icon: '📖', label: '阅读' },
  { key: 'write' as const, icon: '✍️', label: '拼写' },
]

function loadReaderSettings(): ReaderSettings {
  try {
    const learnSettings = loadLearnSettings()
    const raw = localStorage.getItem(READER_SETTINGS_KEY)
    const parsed = raw ? JSON.parse(raw) as Partial<ReaderSettings> : {}
    return {
      ...DEFAULT_READER_SETTINGS,
      ...parsed,
      dailyGoal: normalizeDailyGoal(learnSettings.dailyGoal ?? parsed.dailyGoal),
      learningMode: learnSettings.learningMode ?? parsed.learningMode ?? DEFAULT_READER_SETTINGS.learningMode,
      showExamples: learnSettings.showExamples ?? parsed.showExamples ?? DEFAULT_READER_SETTINGS.showExamples,
      reviewReminder: learnSettings.reviewReminder ?? parsed.reviewReminder ?? DEFAULT_READER_SETTINGS.reviewReminder,
    }
  } catch {
    return { ...DEFAULT_READER_SETTINGS }
  }
}

function saveReaderSettings(s: ReaderSettings) {
  const normalized = {
    ...s,
    dailyGoal: normalizeDailyGoal(s.dailyGoal),
  }
  localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(normalized))
  saveLearnSettings({
    ...loadLearnSettings(),
    dailyGoal: normalized.dailyGoal,
    learningMode: normalized.learningMode,
    showExamples: normalized.showExamples,
    reviewReminder: normalized.reviewReminder,
  })
}

/**
 * PDF 阅读器 —— 真正的 PDF 渲染阅读体验
 *
 * 功能：
 *  1. 用 Canvas 渲染 PDF 原始页面（保留排版、图片等）
 *  2. 自动检测扫描版 PDF
 *  3. 翻页（上一页/下一页）+ 页码跳转
 *  4. 缩放（放大/缩小/适应屏幕）
 *  5. 文本选择 → 查词释义 + TTS 朗读
 *  7. 阅读进度自动保存到数据库
 *  8. 支持两种来源：
 *     - bookId 参数 → 从数据库加载（file_path 或 content_text）
 *     - 本地文件选择器（无 bookId 时）
 *
 * 技术方案：
 *  - pdfjs-dist 渲染 PDF Canvas
 *  - Canvas + 文本层叠加做选词
 */

// ===== 阅读模式 =====
type ReadMode = 'pdf' | 'text'

export default function PDFReaderPage() {
  const navigate = useNavigate()
  const goBack = useLogicalBack('/bookshelf')
  const [searchParams] = useSearchParams()
  const bookId = searchParams.get('bookId')
  const { user } = useAuth()
  const { addWord } = useVocabulary()

  // ===== PDF 文档对象 =====
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [totalPages, setTotalPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)

  // ===== 缩放 =====
  const [scale, setScale] = useState(1.5) // 默认缩放
  const minScale = 0.5
  const maxScale = 3.0
  const [hasAutoFitted, setHasAutoFitted] = useState(false)

  // ===== 状态 =====
  const [loading, setLoading] = useState(true)
  const [rendering, setRendering] = useState(false)
  const [readMode, setReadMode] = useState<ReadMode>('pdf')

  // ===== OCR 叠加层状态 =====
  const [ocrOverlayDebug, setOcrOverlayDebug] = useState(false)
  const [ocrRunning, setOcrRunning] = useState(false)
  const [ocrStatusText, setOcrStatusText] = useState('')
  const [ocrProgress, setOcrProgress] = useState<number | null>(null)
  const [ocrError, setOcrError] = useState<string | null>(null)

  // ===== 文本叠加层状态 =====
  const textLayerRef = useRef<HTMLDivElement>(null)
  const [pageViewport, setPageViewport] = useState({ w: 0, h: 0 })
  const [textLayerViewport, setTextLayerViewport] = useState({ w: 0, h: 0 })
  const [ocrLayoutData, setOcrLayoutData] = useState<OCRLayoutResult | null>(null)
  const [ocrTranslatedLines, setOcrTranslatedLines] = useState<string[]>([])
  const [translationStatusText, setTranslationStatusText] = useState('')
  const [translationError, setTranslationError] = useState<string | null>(null)
  const [translationSummary, setTranslationSummary] = useState<PageTranslationSummary | null>(null)

  // 叠加层显示模式
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('select')
  const [translating, setTranslating] = useState(false)
  // 是否已经翻译过当前页（避免重复翻译）
  const [pageTranslated, setPageTranslated] = useState(false)

  // ===== 文本模式（从数据库 content_text） =====
  const [contentText, setContentText] = useState('')
  const [book, setBook] = useState<UserBook | null>(null)

  // ===== 阅读器设置 =====
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(loadReaderSettings)
  const [readerGoalDraft, setReaderGoalDraft] = useState(() => String(loadReaderSettings().dailyGoal))
  const updateReaderSettings = (partial: Partial<ReaderSettings>) => {
    setReaderSettings(prev => {
      const next = { ...prev, ...partial }
      saveReaderSettings(next)
      return next
    })
  }
  useEffect(() => {
    setReaderGoalDraft(String(readerSettings.dailyGoal))
  }, [readerSettings.dailyGoal])

  const applyReaderDailyGoal = (value: string | number) => {
    const nextGoal = normalizeDailyGoal(value)
    setReaderGoalDraft(String(nextGoal))
    updateReaderSettings({ dailyGoal: nextGoal })
  }

  const adjustReaderDailyGoal = (delta: number) => {
    applyReaderDailyGoal(readerSettings.dailyGoal + delta)
  }
  // ===== UI 状态 =====
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'display' | 'language' | 'learning'>('display')
  const [selectedText, setSelectedText] = useState('')
  const [showWordPopup, setShowWordPopup] = useState(false)
  const [pageInput, setPageInput] = useState('')
  const [showPageJump, setShowPageJump] = useState(false)

  // ===== 导入到书架状态（阅读器内导入） =====
  const [localFile, setLocalFile] = useState<File | null>(null)
  const [savingToShelf, setSavingToShelf] = useState(false)
  const [savedToShelf, setSavedToShelf] = useState(false)

  // ===== Canvas / Overlay Refs =====
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const renderTaskRef = useRef<number>(0)
  // 叠加层 wrapper ref（用于 ResizeObserver 测量实际显示尺寸）
  const overlayWrapperRef = useRef<HTMLDivElement>(null)
  // 叠加层缩放比例：实际显示宽度 / 原始坐标系宽度
  // textLayerScale 不再需要——TextLayer 尺寸通过 CSS 与 canvas 完全同步
  // 解析 user_books.file_path，兼容历史 URL 与新路径格式
  const extractStoragePath = (rawPath: string): string | null => {
    if (!rawPath) return null
    if (rawPath.startsWith('books:')) return rawPath.slice('books:'.length)

    const publicMarker = '/storage/v1/object/public/books/'
    const signMarker = '/storage/v1/object/sign/books/'

    if (rawPath.includes(publicMarker)) {
      return decodeURIComponent(rawPath.split(publicMarker)[1] || '')
    }
    if (rawPath.includes(signMarker)) {
      const remain = rawPath.split(signMarker)[1] || ''
      return decodeURIComponent(remain.split('?')[0] || '')
    }
    return null
  }

  const resetOCRState = useCallback(() => {
    setOcrLayoutData(null)
    setOcrTranslatedLines([])
    setOcrStatusText('')
    setOcrProgress(null)
    setOcrError(null)
    setOcrRunning(false)
    setTranslationStatusText('')
    setTranslationError(null)
    setTranslationSummary(null)
    setPageTranslated(false)
  }, [])

  const handleRunOCR = useCallback(async () => {
    if (!pdfDoc || ocrRunning) return

    setOcrRunning(true)
    setOcrError(null)
    setOcrStatusText('正在初始化 OCR…')
    setOcrProgress(0)
    setOcrTranslatedLines([])
    setTranslationStatusText('')
    setTranslationError(null)
    setTranslationSummary(null)
    setPageTranslated(false)

    let session: Awaited<ReturnType<typeof createOCRSession>> | null = null
    try {
      session = await createOCRSession(readerSettings.ocrLang, (update: OCRProgressUpdate) => {
        setOcrStatusText(update.statusText || 'OCR 进行中')
        setOcrProgress(typeof update.progress === 'number' ? update.progress : null)
      })

      const result = await recognizePdfPage(pdfDoc, currentPage, session, (update) => {
        setOcrStatusText(update.statusText || 'OCR 进行中')
        setOcrProgress(typeof update.progress === 'number' ? update.progress : null)
      })

      setOcrLayoutData(result)
      setOverlayMode('cover')
      setOcrOverlayDebug(false)
      setOcrStatusText(`OCR 已完成：识别 ${result.lines.length} 行`)
      setOcrProgress(100)
    } catch (error) {
      console.error('OCR 识别失败:', error)
      const message = error instanceof OCRServiceError
        ? error.message
        : String((error as Error)?.message || error || 'OCR 识别失败')
      setOcrError(message)
      setOcrStatusText('OCR 识别失败')
      setOcrProgress(null)
    } finally {
      setOcrRunning(false)
      if (session) {
        await session.terminate().catch(() => {})
      }
    }
  }, [pdfDoc, ocrRunning, readerSettings.ocrLang, currentPage])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || readMode !== 'pdf') return

    const syncViewportFromCanvas = () => {
      const width = parseFloat(canvas.style.width) || canvas.clientWidth || 0
      const height = parseFloat(canvas.style.height) || canvas.clientHeight || 0
      if (width > 0 && height > 0) {
        setPageViewport((prev) => (
          Math.abs(prev.w - width) < 0.5 && Math.abs(prev.h - height) < 0.5
            ? prev
            : { w: width, h: height }
        ))
      }
    }

    syncViewportFromCanvas()
    const ro = new ResizeObserver(syncViewportFromCanvas)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [readMode, currentPage, scale, rendering])

  // ================================================================
  // 加载 PDF（从数据库或本地文件）
  // ================================================================
  useEffect(() => {
    async function loadFromDB() {
      if (!bookId) {
        setLoading(false)
        return
      }

      resetOCRState()

      const parsedBookId = parseInt(bookId, 10)
      if (Number.isNaN(parsedBookId)) {
        setLoading(false)
        return
      }

      try {
        // 从数据库获取书籍信息
        const { data, error } = await supabase
          .from('user_books')
          .select('*')
          .eq('id', parsedBookId)
          .single()

        if (error || !data) {
          setLoading(false)
          return
        }

        setBook(data)
        setContentText(data.content_text || '')

        // 如果有 file_path（历史 URL 或存储路径），尝试加载 PDF
        if (data.file_path) {
          try {
            let source = data.file_path

            // 先尝试直接加载（兼容历史公开 URL）
            try {
              const pdf = await loadPDFDocument(source)
              setPdfDoc(pdf)
              setTotalPages(pdf.numPages)
              setCurrentPage(data.current_page > 0 ? data.current_page : 1)
              setHasAutoFitted(false)
              setReadMode('pdf')
              setLoading(false)
              return
            } catch {
              // 继续走签名 URL
            }

            const storagePath = extractStoragePath(data.file_path)
            if (storagePath) {
              const { data: signedData, error: signedErr } = await supabase.storage
                .from('books')
                .createSignedUrl(storagePath, 60 * 60)
              if (!signedErr && signedData?.signedUrl) {
                source = signedData.signedUrl
              }
            }

            const pdf = await loadPDFDocument(source)
            setPdfDoc(pdf)
            setTotalPages(pdf.numPages)
            setCurrentPage(data.current_page > 0 ? data.current_page : 1)
            setHasAutoFitted(false)
            setReadMode('pdf')
          } catch {
            // PDF 加载失败（URL 过期等），回退到文本模式
            console.warn('PDF 文件加载失败，使用文本模式')
            if (data.content_text) {
              setReadMode('text')
            }
          }
        } else if (data.content_text) {
          // 无 PDF 文件，只有文本
          setReadMode('text')
          setTotalPages(data.total_pages || 1)
        }
      } catch (err) {
        console.error('加载书籍失败:', err)
      }

      setLoading(false)
    }

    loadFromDB()
  }, [bookId, resetOCRState])

  // ================================================================
  // 本地文件导入（没有 bookId 时可以直接选文件阅读）
  // ================================================================
  const handleLocalFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      return
    }

    setLoading(true)
    setSavedToShelf(false)
    resetOCRState()
    try {
      const pdf = await loadPDFDocument(file)
      setPdfDoc(pdf)
      setTotalPages(pdf.numPages)
      setCurrentPage(1)
      setHasAutoFitted(false)
      setReadMode('pdf')
      setLocalFile(file) // 保存文件引用，用于后续"保存到书架"
      void isScannedPDF(file).catch(() => {})
    } catch (err: any) {
      console.error('PDF load error:', err)
      alert(`打开 PDF 失败: ${err.message || '格式不支持'}`)
    }
    setLoading(false)
  }

  // ================================================================
  // 从阅读器保存当前本地 PDF 到书架
  // ================================================================
  const handleSaveToShelf = async () => {
    if (!localFile || !user || savingToShelf) return

    setSavingToShelf(true)
    try {
      // 提取元数据
      let meta
      try {
        meta = await getPDFMetadata(localFile)
      } catch {
        meta = {
          title: localFile.name.replace(/\.pdf$/i, ''),
          author: '未知作者',
          numPages: totalPages || 0,
          fileSize: localFile.size,
        }
      }

      // 提取文本（限时 10 秒）
      let fullText = ''
      try {
        fullText = await Promise.race([
          extractTextFromPDF(localFile),
          new Promise<string>((resolve) => setTimeout(() => resolve(''), 10000)),
        ])
      } catch { /* 文本提取失败不阻塞 */ }

      // 上传到 Storage
      const safeName = localFile.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = `${user.id}/${Date.now()}_${safeName}`
      await uploadFile('books', filePath, localFile)
      const storedFilePath = `books:${filePath}`

      // 保存到数据库
      const emojis = ['📘', '📗', '📙', '📕', '📒', '📓', '📔', '📚']
      const { error } = await supabase.from('user_books').insert({
        user_id: user.id,
        title: sanitizeText(meta.title) || localFile.name.replace(/\.pdf$/i, ''),
        author: sanitizeText(meta.author) || '未知作者',
        cover_emoji: emojis[Math.floor(Math.random() * emojis.length)],
        file_path: storedFilePath,
        content_text: sanitizeText(fullText).slice(0, 500000),
        total_pages: meta.numPages || totalPages,
        current_page: currentPage,
        progress: totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0,
        unfamiliar_words_count: 0,
      })

      if (error) throw new Error(error.message)
      setSavedToShelf(true)
    } catch (err: any) {
      alert(`保存失败: ${err.message || '未知错误'}`)
    }
    setSavingToShelf(false)
  }

  // ================================================================
  // 渲染当前页到 Canvas + 用 pdf.js TextLayer 渲染文本层
  // ================================================================
  const renderCurrentPage = useCallback(async () => {
    if (loading || !pdfDoc || !canvasRef.current || readMode !== 'pdf') return

    const taskId = ++renderTaskRef.current
    setRendering(true)

    try {
      const renderedPage = await renderPageToCanvas(pdfDoc, currentPage, canvasRef.current, scale)
      if (taskId === renderTaskRef.current) {
        setPageViewport({ w: renderedPage.width, h: renderedPage.height })
        setTextLayerViewport({ w: renderedPage.width, h: renderedPage.height })
      }

      // 用 pdf.js 原生 TextLayer 渲染——定位精度由 pdf.js 内部保证
      if (textLayerRef.current) {
        try {
          const { viewportWidth, viewportHeight } = await renderNativeTextLayer(
            pdfDoc, currentPage, scale, textLayerRef.current
          )
          if (taskId === renderTaskRef.current) {
            setTextLayerViewport({ w: viewportWidth, h: viewportHeight })
          }
        } catch (e) {
          console.warn('TextLayer 渲染失败:', e)
        }
      }
    } catch (err) {
      if (!(err instanceof Error && /cancel/i.test(err.message))) {
        console.error('渲染页面失败:', err)
      }
    }

    if (taskId === renderTaskRef.current) {
      setRendering(false)
    }
  }, [loading, pdfDoc, currentPage, scale, readMode])

  // 每次页码或缩放变化时重新渲染
  useEffect(() => {
    renderCurrentPage()
  }, [renderCurrentPage])

  // ================================================================
  // 翻页操作
  // ================================================================
  const goToPage = useCallback((page: number) => {
    const safePage = Math.max(1, Math.min(page, totalPages))
    setCurrentPage(safePage)
    resetOCRState()

    if (bookId && user && totalPages > 0) {
      const parsedBookId = parseInt(bookId, 10)
      if (Number.isNaN(parsedBookId)) return
      const progress = Math.round((safePage / totalPages) * 100)
      supabase
        .from('user_books')
        .update({ current_page: safePage, progress })
        .eq('id', parsedBookId)
        .then(() => {})
    }
  }, [totalPages, bookId, user, resetOCRState])

  const prevPage = useCallback(() => goToPage(currentPage - 1), [currentPage, goToPage])
  const nextPage = useCallback(() => goToPage(currentPage + 1), [currentPage, goToPage])

  // 页码跳转
  const handlePageJump = () => {
    const page = parseInt(pageInput)
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      goToPage(page)
      setShowPageJump(false)
      setPageInput('')
    }
  }

  // ================================================================
  // 缩放操作
  // ================================================================
  const zoomIn = () => setScale(prev => Math.min(prev + 0.25, maxScale))
  const zoomOut = () => setScale(prev => Math.max(prev - 0.25, minScale))
  const fitWidth = useCallback(async () => {
    if (!containerRef.current || !pdfDoc) return
    try {
      // 按当前页真实宽度计算缩放，避免移动端首屏拉伸
      const page = await pdfDoc.getPage(currentPage)
      const baseViewport = page.getViewport({ scale: 1 })
      const containerWidth = Math.max(120, containerRef.current.clientWidth - 24)
      const nextScale = Math.min(maxScale, Math.max(minScale, containerWidth / baseViewport.width))
      setScale(nextScale)
    } catch {
      // 不阻断阅读
    }
  }, [pdfDoc, currentPage])

  // 首次加载 PDF 后自动适配屏幕宽度
  useEffect(() => {
    if (!pdfDoc || hasAutoFitted || readMode !== 'pdf') return
    fitWidth().finally(() => setHasAutoFitted(true))
  }, [pdfDoc, hasAutoFitted, readMode, fitWidth])

  // 计算 wrapper 相对于容器的缩放比（canvas 可能被 maxWidth 缩小）
  const [wrapperScale, setWrapperScale] = useState(1)
  useEffect(() => {
    const wrapper = overlayWrapperRef.current
    const container = containerRef.current
    if (!wrapper || !container || pageViewport.w <= 0) return

    const calcScale = () => {
      const availW = container.clientWidth - 24
      if (availW > 0 && pageViewport.w > availW) {
        setWrapperScale(availW / pageViewport.w)
      } else {
        setWrapperScale(1)
      }
    }
    calcScale()

    const ro = new ResizeObserver(calcScale)
    ro.observe(container)
    return () => ro.disconnect()
  }, [pageViewport.w])

  const ocrOverlayModel = ocrLayoutData ? buildOverlayRegions(ocrLayoutData) : null
  const hasSuspiciousTranslationAnchors = (regions: OverlayRegion[]) => {
    if (regions.length === 0) return true

    const meaningful = regions.filter((region) => (
      sanitizeText(region.text).replace(/\s+/g, '').length > 0
    ))
    if (meaningful.length === 0) return true

    const originAnchored = meaningful.filter((region) => region.bbox.x0 <= 2 && region.bbox.y0 <= 2).length
    const wideBoxes = meaningful.filter((region) => (
      (region.bbox.x1 - region.bbox.x0) >= ocrLayoutData!.imageWidth * 0.58
    )).length
    const uniqueAnchors = new Set(
      meaningful.map((region) => `${Math.round(region.bbox.x0 / 24)}:${Math.round(region.bbox.y0 / 24)}`),
    ).size

    return originAnchored / meaningful.length > 0.34
      || wideBoxes / meaningful.length > 0.4
      || uniqueAnchors < Math.max(8, Math.round(meaningful.length * 0.12))
  }
  const ocrTranslateRegions = ocrOverlayModel
    ? (() => {
        const groupedRegions = ocrOverlayModel.translationRegions.filter((region) => sanitizeText(region.text).trim().length > 0)
        const fallbackRegions = ocrOverlayModel.regions.filter((region) => sanitizeText(region.text).trim().length > 0)
        const visibleLines = ocrOverlayModel.lines.filter((line) => sanitizeText(line.text).trim().length > 0)
        const lineFallbackRegions: OverlayRegion[] = visibleLines.map((line, index) => {
          const lineWidth = line.bbox.x1 - line.bbox.x0
          const lineHeight = line.bbox.y1 - line.bbox.y0
          const nextLine = visibleLines.slice(index + 1).find((candidate) => (
            candidate.columnIndex === line.columnIndex && candidate.bbox.y0 > line.bbox.y0
          ))
          const verticalPadding = Math.max(6, lineHeight * 0.55)
          const nextLineCeiling = nextLine
            ? Math.max(line.bbox.y1 + verticalPadding, nextLine.bbox.y0 - Math.max(4, lineHeight * 0.38))
            : ocrLayoutData!.imageHeight

          return {
            id: `line-region-fallback-${line.id}`,
            text: line.text,
            bbox: line.bbox,
            availableX0: Math.max(0, line.bbox.x0 - Math.max(4, lineWidth * 0.04)),
            availableX1: Math.min(ocrLayoutData!.imageWidth, line.bbox.x1 + Math.max(8, lineWidth * 0.1)),
            maxY1: Math.min(
              ocrLayoutData!.imageHeight,
              Math.max(line.bbox.y1 + verticalPadding, nextLineCeiling),
            ),
            confidence: line.confidence,
            lineIndex: line.lineIndex,
            rowIndex: line.rowIndex,
            columnIndex: line.columnIndex,
            words: line.words,
          }
        })
        const safeLineFallback = hasSuspiciousTranslationAnchors(lineFallbackRegions) ? [] : lineFallbackRegions
        const safeGrouped = hasSuspiciousTranslationAnchors(groupedRegions) ? [] : groupedRegions
        const safeFallback = hasSuspiciousTranslationAnchors(fallbackRegions) ? [] : fallbackRegions

        if (safeLineFallback.length > 0) {
          return safeLineFallback
        }
        if (safeGrouped.length > 0 && safeGrouped.length >= Math.max(3, Math.round(lineFallbackRegions.length * 0.22))) {
          return safeGrouped
        }
        if (safeFallback.length > 0 && safeFallback.length <= Math.max(140, lineFallbackRegions.length)) {
          return safeFallback
        }
        return lineFallbackRegions
      })()
    : []
  const ocrOverlayRenderKey = ocrOverlayModel
    ? `${currentPage}-${scale}-${pageViewport.w}-${pageViewport.h}-${overlayMode}-${ocrTranslatedLines.join('|').length}`
    : 'no-ocr-overlay'

  const applyTranslationResult = useCallback((
    source: 'ocr' | 'text-layer',
    regionCount: number,
    batchResult: BatchTranslationResult,
    changedCount: number,
  ) => {
    const scopeLabel = source === 'ocr' ? 'OCR 区域' : '文本层'
    setTranslationSummary({
      source,
      regionCount,
      requestedCount: batchResult.requestedCount,
      apiTranslatedCount: batchResult.apiTranslatedCount,
      fallbackCount: batchResult.fallbackCount,
      changedCount,
    })

    const status = changedCount > 0
      ? `翻译已改写 ${changedCount}/${regionCount} 个${scopeLabel}${batchResult.fallbackUsed ? '，部分使用离线回退' : ''}`
      : batchResult.requestedCount === 0
        ? `当前页没有可翻译的${scopeLabel}`
        : `翻译未改写任何${scopeLabel}`

    setTranslationStatusText(status)
    setTranslationError(changedCount > 0 ? null : (batchResult.failureReason || `翻译未改写任何${scopeLabel}`))
  }, [])

  // ================================================================
  // 文本选择 → 查词功能
  // ================================================================
  const handleTextSelect = () => {
    const selection = window.getSelection()
    const text = selection?.toString().trim()
    if (text && text.length > 0 && text.length < 100) {
      setSelectedText(text)
      setShowWordPopup(true)
    }
  }

  // ================================================================
  // 翻译当前页——直接操作 TextLayer 的 span 元素
  // ================================================================
  const handleTranslatePage = async () => {
    const container = textLayerRef.current
    const spans = container
      ? Array.from(container.querySelectorAll('span')).filter(s => s.textContent && s.textContent.trim().length > 0)
      : []
    const ocrRegions = ocrTranslateRegions
    const useOcrFallback = spans.length === 0 && ocrRegions.length > 0

    if (spans.length === 0 && !useOcrFallback) {
      setTranslationStatusText('当前页没有可翻译文本')
      setTranslationError('当前页没有可用文本层，请切换到有文本内容的页面后再试。')
      return
    }

    setTranslating(true)
    setTranslationError(null)
    setTranslationSummary(null)
    try {
      const targetLang = readerSettings.translateTo === 'zh-CN' ? '中文'
        : readerSettings.translateTo === 'en' ? 'English'
        : readerSettings.translateTo === 'ja' ? '日语'
        : readerSettings.translateTo === 'ko' ? '韩语'
        : readerSettings.translateTo === 'fr' ? '法语'
        : readerSettings.translateTo === 'de' ? '德语'
        : readerSettings.translateTo === 'es' ? '西班牙语'
        : '中文'

      if (useOcrFallback) {
        const origTexts = ocrRegions.map((region) => region.text)
        setTranslationStatusText(`正在翻译 ${ocrRegions.length} 个 OCR 区域`)
        const batchResult = await translateBatch(origTexts, targetLang)
        const translatedLines = batchResult.lines.map((result, i) => sanitizeText(result || origTexts[i]).trim() || origTexts[i])
        const changedCount = translatedLines.reduce((count, line, index) => (
          sanitizeText(line).trim() !== sanitizeText(origTexts[index]).trim() ? count + 1 : count
        ), 0)
        setOcrTranslatedLines(translatedLines)
        applyTranslationResult('ocr', ocrRegions.length, batchResult, changedCount)
        if (changedCount === 0) {
          throw new Error(batchResult.failureReason || '翻译结果未改变当前页 OCR 内容')
        }
      } else {
        const origTexts = spans.map(s => s.textContent || '')

        spans.forEach((s, i) => {
          s.setAttribute('data-orig', origTexts[i])
        })

        setTranslationStatusText(`正在翻译 ${spans.length} 个文本层片段`)
        const batchResult = await translateBatch(origTexts, targetLang)
        let changedCount = 0

        spans.forEach((s, i) => {
          const translated = batchResult.lines[i] || origTexts[i]
          if (translated && translated !== origTexts[i]) {
            s.textContent = translated
            s.setAttribute('data-translated', translated)
            changedCount += 1
          } else {
            s.setAttribute('data-translated', origTexts[i])
          }
        })

        applyTranslationResult('text-layer', spans.length, batchResult, changedCount)
        if (changedCount === 0) {
          throw new Error(batchResult.failureReason || '翻译结果未改变当前页文本')
        }
      }

      setPageTranslated(true)
      setOverlayMode('translate')
    } catch (err: any) {
      setPageTranslated(false)
      setOverlayMode(ocrLayoutData ? 'cover' : 'select')
      setTranslationError(err?.message || '翻译失败')
      setTranslationStatusText('翻译失败')
    }
    setTranslating(false)
  }

  // 还原翻译（切换回非翻译模式时恢复原文）
  const restoreOriginalText = useCallback(() => {
    const container = textLayerRef.current
    if (!container) return
    const spans = Array.from(container.querySelectorAll('span[data-orig]'))
    spans.forEach(s => {
      const orig = s.getAttribute('data-orig')
      if (orig) s.textContent = orig
    })
  }, [])

  // 翻译模式的 hover 显示原文交互
  useEffect(() => {
    if (overlayMode !== 'translate') return
    const container = textLayerRef.current
    if (!container) return

    const handleEnter = (e: MouseEvent) => {
      const span = (e.target as HTMLElement).closest('span[data-orig]')
      if (!span) return
      const orig = span.getAttribute('data-orig')
      if (orig) span.textContent = orig
    }
    const handleLeave = (e: MouseEvent) => {
      const span = (e.target as HTMLElement).closest('span[data-orig]')
      if (!span) return
      const translated = span.getAttribute('data-translated')
      if (translated) span.textContent = translated
    }

    container.addEventListener('mouseenter', handleEnter, true)
    container.addEventListener('mouseleave', handleLeave, true)
    return () => {
      container.removeEventListener('mouseenter', handleEnter, true)
      container.removeEventListener('mouseleave', handleLeave, true)
    }
  }, [overlayMode])

  // ================================================================
  // 键盘导航
  // ================================================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showPageJump || showWordPopup || showSettings) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') prevPage()
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault()
        nextPage()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [prevPage, nextPage, showPageJump, showWordPopup, showSettings])

  // ================================================================
  // 渲染
  // ================================================================

  // ===== 加载中 =====
  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex flex-col items-center justify-center gap-3">
        <Loader2 size={32} className="text-[var(--color-primary)] animate-spin" />
        <p className="text-[14px] text-[var(--color-muted)]">正在加载 PDF...</p>
      </div>
    )
  }

  // ===== 没有 PDF 且没有 bookId → 本地文件选择 =====
  if (!pdfDoc && !book) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4">
          <button onClick={goBack} className="p-1">
            <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
          </button>
          <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">PDF 阅读器</h1>
        </div>

        {/* 文件选择 */}
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleLocalFile}
            className="hidden"
          />
          <div className="w-[120px] h-[120px] rounded-[24px] bg-[var(--color-primary-light)] flex items-center justify-center mb-6">
            <BookOpen size={48} className="text-[var(--color-primary)]" />
          </div>
          <h2 className="text-[20px] font-bold text-[var(--color-foreground)] mb-2">打开 PDF 文件</h2>
          <p className="text-[13px] text-[var(--color-muted)] text-center mb-6">
            支持常见 PDF 阅读与导入<br />
            <span className="text-[11px]">打开后可一键保存到书架</span>
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-8 py-3 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-[15px] font-semibold active:scale-95 transition-transform"
          >
            选择 PDF 文件
          </button>
          <button
            onClick={() => navigateSafely(navigate, '/bookshelf')}
            className="mt-3 text-[13px] text-[var(--color-primary)]"
          >
            或从书架选择
          </button>
        </div>
      </div>
    )
  }

  // ===== 有书籍但 PDF 与文本都不可用：给出明确兜底 =====
  if (!pdfDoc && book && !contentText) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4">
          <button onClick={goBack} className="p-1">
            <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
          </button>
          <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">PDF 阅读器</h1>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <BookOpen size={44} className="text-[var(--color-muted)] mb-3" />
          <p className="text-[15px] font-semibold text-[var(--color-foreground)] mb-1">当前书籍暂时无法打开</p>
          <p className="text-[12px] text-[var(--color-muted)] mb-5">
            PDF 链接可能已失效或文件无权限，建议回书架重新导入该 PDF。
          </p>
          <button
            onClick={() => navigateSafely(navigate, '/bookshelf')}
            className="px-6 py-2.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-sm)] text-[14px] font-semibold"
          >
            返回书架重新导入
          </button>
        </div>
      </div>
    )
  }

  // ===== 文本模式（无 PDF 文件，只有提取的文本） =====
  if (readMode === 'text' && !pdfDoc) {
    const paragraphs = contentText
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0)

    return (
      <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <button onClick={goBack} className="p-1">
            <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
          </button>
          <div className="text-center flex-1 min-w-0 px-2">
            <h1 className="text-[16px] font-bold text-[var(--color-foreground)] font-secondary line-clamp-1">
              {book?.title || 'PDF 阅读'}
            </h1>
            {book?.author && <p className="text-[11px] text-[var(--color-muted)]">{book.author}</p>}
          </div>
          <div className="w-8" />
        </div>

        {/* 文本内容 */}
        <div className="flex-1 px-5 py-6 overflow-y-auto" onMouseUp={handleTextSelect}>
          {paragraphs.length > 0 ? (
            paragraphs.map((para, i) => (
              <p key={i} className="text-[15px] text-[var(--color-foreground)] leading-[1.8] mb-4">
                {para}
              </p>
            ))
          ) : (
            <p className="text-[14px] text-[var(--color-muted)] text-center py-12">
              暂无文本内容
            </p>
          )}
        </div>

        {/* 查词弹窗 */}
        {showWordPopup && selectedText && (
          <WordPopupPanel
            word={selectedText}
            onClose={() => { setShowWordPopup(false); setSelectedText('') }}
            onAddWord={addWord}
          />
        )}
      </div>
    )
  }

  // ===== PDF 渲染模式 =====
  return (
    <div className="h-full min-h-screen bg-[#333] flex flex-col">
      {/* ===== 顶部工具栏 ===== */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#222] text-white">
        {/* 左侧：返回 */}
        <button onClick={goBack} className="p-1 active:scale-90 transition-transform">
          <ChevronLeft size={22} className="text-white/80" />
        </button>

        {/* 中间：页码 */}
        <button
          onClick={() => setShowPageJump(true)}
          className="flex items-center gap-1 px-3 py-1 bg-white/10 rounded-full"
        >
          <span className="text-[13px] text-white/90">{currentPage} / {totalPages}</span>
        </button>

        {/* 右侧：工具 */}
        <div className="flex items-center gap-1.5">
          {/* 保存到书架（仅本地文件） */}
          {localFile && !bookId && user && (
            <button
              onClick={handleSaveToShelf}
              disabled={savingToShelf || savedToShelf}
              className={`px-2 py-1 rounded-full text-[10px] font-medium active:scale-95 ${
                savedToShelf ? 'bg-green-500/30 text-green-300'
                  : savingToShelf ? 'bg-white/10 text-white/50'
                  : 'bg-[var(--color-primary)]/80 text-white'
              }`}
            >
              {savedToShelf ? '✓ 已保存' : savingToShelf ? '...' : '保存'}
            </button>
          )}
          <button
            onClick={handleRunOCR}
            disabled={ocrRunning || !pdfDoc}
            className={`px-2 py-1 rounded-full text-[10px] font-medium active:scale-95 ${
              ocrRunning
                ? 'bg-purple-500/20 text-purple-200'
                : ocrLayoutData
                  ? 'bg-purple-500/30 text-purple-100'
                  : 'bg-white/10 text-white/70'
            }`}
            title="识别当前页 OCR"
          >
            {ocrRunning ? 'OCR…' : ocrLayoutData ? 'OCR ✓' : 'OCR'}
          </button>
          {/* 翻译当前页 */}
          <button
            onClick={handleTranslatePage}
            disabled={translating}
            className={`p-1.5 active:scale-90 transition-transform ${overlayMode === 'translate' ? 'bg-blue-500/30 rounded' : ''}`}
            title="翻译当前页"
          >
            {translating
              ? <Loader2 size={18} className="text-blue-300 animate-spin" />
              : <Languages size={18} className={overlayMode === 'translate' ? 'text-blue-400' : 'text-white/70'} />
            }
          </button>
          {/* 设置 */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1.5 active:scale-90 transition-transform"
          >
            <Settings size={18} className="text-white/70" />
          </button>
        </div>
      </div>

      {(translationStatusText || translationError || translationSummary) && (
        <div className={`px-4 py-2 border-b ${
          translationError
            ? 'bg-red-500/10 border-red-500/30'
            : 'bg-blue-500/10 border-blue-500/30'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {translating
                  ? <Loader2 size={14} className="text-blue-300 animate-spin" />
                  : translationError
                    ? <AlertTriangle size={14} className="text-red-300" />
                    : <Languages size={14} className="text-blue-300" />}
                <p className="text-[12px] font-semibold text-white/90">
                  {translationStatusText || '翻译已就绪'}
                </p>
              </div>
              {translationError && (
                <p className="mt-1 text-[12px] text-white/70">
                  {translationError}
                </p>
              )}
              {translationSummary && (
                <p className="mt-1 text-[11px] text-white/55">
                  {translationSummary.source === 'ocr' ? 'OCR 区域' : '文本层'} {translationSummary.regionCount} 块，
                  提交 {translationSummary.requestedCount} 块，改写 {translationSummary.changedCount} 块，
                  API 成功 {translationSummary.apiTranslatedCount} 块
                  {translationSummary.fallbackCount > 0 ? `，回退 ${translationSummary.fallbackCount} 块` : ''}
                </p>
              )}
            </div>
            {!translating && (
              <button
                onClick={handleTranslatePage}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/80"
              >
                <RefreshCcw size={11} />
                重试翻译
              </button>
            )}
          </div>
        </div>
      )}

      {(ocrRunning || ocrStatusText || ocrError || ocrLayoutData) && (
        <div className={`px-4 py-2 border-b ${
          ocrError
            ? 'bg-red-500/10 border-red-500/30'
            : 'bg-purple-500/10 border-purple-500/30'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {ocrRunning
                  ? <Loader2 size={14} className="text-purple-300 animate-spin" />
                  : ocrError
                    ? <AlertTriangle size={14} className="text-red-300" />
                    : <BookOpen size={14} className="text-purple-300" />}
                <p className="text-[12px] font-semibold text-white/90">
                  {ocrStatusText || (ocrLayoutData ? 'OCR 已就绪' : 'OCR 未运行')}
                </p>
                {typeof ocrProgress === 'number' && (
                  <span className="text-[11px] text-white/60">{Math.round(ocrProgress)}%</span>
                )}
              </div>
              {ocrError && (
                <p className="mt-1 text-[12px] text-white/70">{ocrError}</p>
              )}
              {!ocrError && ocrLayoutData && (
                <p className="mt-1 text-[11px] text-white/55">
                  当前页已识别 {ocrLayoutData.lines.length} 行，可切换到调试 / 遮盖 / 翻译模式查看覆盖层
                </p>
              )}
            </div>
            {!ocrRunning && (
              <button
                onClick={handleRunOCR}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/80"
              >
                <RefreshCcw size={11} />
                重新识别
              </button>
            )}
          </div>
        </div>
      )}

      {/* ===== 设置抽屉面板 ===== */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex">
          {/* 遮罩 */}
          <div className="flex-1 bg-black/50" onClick={() => setShowSettings(false)} />
          {/* 抽屉 */}
          <div className="w-[320px] max-w-[85vw] bg-[#1e1e1e] h-full overflow-y-auto">
            {/* 抽屉头部 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 sticky top-0 bg-[#1e1e1e] z-10">
              <h3 className="text-[16px] font-bold text-white">设置</h3>
              <button onClick={() => setShowSettings(false)} className="p-1">
                <X size={18} className="text-white/60" />
              </button>
            </div>

            {/* Tab 切换 */}
            <div className="flex border-b border-white/10 px-2 sticky top-[52px] bg-[#1e1e1e] z-10">
              {[
                { key: 'display' as const, label: '📐 显示' },
                { key: 'language' as const, label: '🌍 语言' },
                { key: 'learning' as const, label: '📚 学习' },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setSettingsTab(tab.key)}
                  className={`flex-1 py-2.5 text-[12px] font-medium transition-colors border-b-2 ${
                    settingsTab === tab.key
                      ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
                      : 'text-white/50 border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-4 space-y-5">

              {/* ==================== 显示设置 ==================== */}
              {settingsTab === 'display' && (
                <>
                  {/* 缩放 */}
                  <div>
                    <p className="text-[12px] text-white/50 mb-2 uppercase tracking-wide">缩放</p>
                    <div className="flex items-center gap-3">
                      <button onClick={zoomOut} className="p-2 bg-white/10 rounded-lg active:scale-90">
                        <ZoomOut size={16} className="text-white/80" />
                      </button>
                      <div className="flex-1 text-center">
                        <span className="text-[16px] font-bold text-white">{Math.round(scale * 100)}%</span>
                      </div>
                      <button onClick={zoomIn} className="p-2 bg-white/10 rounded-lg active:scale-90">
                        <ZoomIn size={16} className="text-white/80" />
                      </button>
                    </div>
                    <button
                      onClick={fitWidth}
                      className="w-full mt-2 flex items-center justify-center gap-1 py-2 bg-white/10 rounded-lg text-[12px] text-white/70 active:scale-95"
                    >
                      <Maximize2 size={14} /> 适应屏幕宽度
                    </button>
                  </div>

                  {/* 阅读模式 */}
                  <div>
                    <p className="text-[12px] text-white/50 mb-2 uppercase tracking-wide">阅读模式</p>
                    <div className="flex gap-2">
                      {(['pdf', 'text'] as const).map(mode => (
                        <button
                          key={mode}
                          onClick={() => setReadMode(mode)}
                          className={`flex-1 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                            readMode === mode ? 'bg-[var(--color-primary)] text-white' : 'bg-white/10 text-white/60'
                          }`}
                        >
                          {mode === 'pdf' ? 'PDF 原版' : '纯文本'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 文本字号（文本模式下） */}
                  <div>
                    <p className="text-[12px] text-white/50 mb-2 uppercase tracking-wide">文本字号</p>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-white/40">小</span>
                      <input
                        type="range"
                        min={12}
                        max={22}
                        value={readerSettings.fontSize}
                        onChange={(e) => updateReaderSettings({ fontSize: parseInt(e.target.value) })}
                        className="flex-1 accent-[var(--color-primary)]"
                      />
                      <span className="text-[11px] text-white/40">大</span>
                      <span className="text-[13px] text-white/70 min-w-[30px] text-right">{readerSettings.fontSize}</span>
                    </div>
                    <p className="mt-1 text-white/70" style={{ fontSize: `${readerSettings.fontSize}px` }}>
                      Preview 预览文字
                    </p>
                  </div>

                  {/* 文本叠加层模式 */}
                  <div>
                    <p className="text-[12px] text-white/50 mb-2 uppercase tracking-wide">叠加层模式</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {([
                        { key: 'off' as const, label: '关闭', desc: '无叠加' },
                        { key: 'select' as const, label: '可选', desc: '透明可选文字' },
                        { key: 'debug' as const, label: '调试', desc: '显示原始/区域框' },
                        { key: 'cover' as const, label: '遮盖', desc: '白底覆盖原文' },
                        { key: 'translate' as const, label: '翻译', desc: '翻译覆盖原文' },
                      ] as const).map(m => (
                        <button
                          key={m.key}
                          onClick={() => {
                            // 从翻译模式切出时还原原文
                            if (overlayMode === 'translate' && m.key !== 'translate') {
                              restoreOriginalText()
                            }
                            setOverlayMode(m.key)
                            setOcrOverlayDebug(m.key === 'debug')
                            if (m.key === 'translate' && !pageTranslated) {
                              handleTranslatePage()
                            }
                            setShowSettings(false)
                          }}
                          className={`py-2 px-2 rounded-lg text-left transition-colors ${
                            overlayMode === m.key
                              ? 'bg-[var(--color-primary)] text-white'
                              : 'bg-white/10 text-white/60'
                          }`}
                        >
                          <span className="text-[12px] font-medium block">{m.label}</span>
                          <span className="text-[9px] opacity-70">{m.desc}</span>
                        </button>
                      ))}
                    </div>
                    {textLayerViewport.w > 0 && (
                      <p className="mt-2 text-[10px] text-blue-300/70">
                        文本层已加载{pageTranslated ? '（已翻译）' : ''}
                      </p>
                    )}
                    <div className="mt-2 rounded-xl bg-white/5 p-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium text-white">OCR 识别</p>
                          <p className="text-[10px] text-white/50">
                            扫描版或文本层错位时，先执行 OCR，再切换到遮盖或翻译模式。
                          </p>
                        </div>
                        <button
                          onClick={handleRunOCR}
                          disabled={ocrRunning || !pdfDoc}
                          className={`rounded-full px-3 py-1.5 text-[11px] font-medium ${
                            ocrRunning
                              ? 'bg-[var(--color-primary)]/40 text-white/70'
                              : 'bg-[var(--color-primary)] text-white'
                          }`}
                        >
                          {ocrRunning ? '识别中…' : ocrLayoutData ? '重新识别' : '开始 OCR'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 阅读开关 */}
                  <div>
                    <p className="text-[12px] text-white/50 mb-2 uppercase tracking-wide">阅读功能</p>
                    <div className="space-y-1">
                      <DarkToggleRow
                        label="自动翻译选中文本"
                        value={readerSettings.autoTranslate}
                        onChange={() => updateReaderSettings({ autoTranslate: !readerSettings.autoTranslate })}
                      />
                      <DarkToggleRow
                        label="自动收录生词"
                        value={readerSettings.autoCollect}
                        onChange={() => updateReaderSettings({ autoCollect: !readerSettings.autoCollect })}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* ==================== 语言设置 ==================== */}
              {settingsTab === 'language' && (
                <>
                  {/* TTS 朗读语言 */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Volume2 size={14} className="text-white/50" />
                      <p className="text-[12px] text-white/50 uppercase tracking-wide">朗读语言 (TTS)</p>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {TTS_LANG_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => updateReaderSettings({ ttsLang: opt.value })}
                          className={`py-2 px-2.5 rounded-lg text-[12px] text-left transition-colors ${
                            readerSettings.ttsLang === opt.value
                              ? 'bg-[var(--color-primary)] text-white'
                              : 'bg-white/10 text-white/60'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 翻译目标语言 */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Languages size={14} className="text-white/50" />
                      <p className="text-[12px] text-white/50 uppercase tracking-wide">翻译目标语言</p>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {TRANSLATE_LANG_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => updateReaderSettings({ translateTo: opt.value })}
                          className={`py-2 px-2.5 rounded-lg text-[12px] text-left transition-colors ${
                            readerSettings.translateTo === opt.value
                              ? 'bg-[var(--color-primary)] text-white'
                              : 'bg-white/10 text-white/60'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* ==================== 学习设置 ==================== */}
              {settingsTab === 'learning' && (
                <>
                  {/* 每日学习目标 */}
                  <div>
                    <p className="text-[12px] text-white/50 mb-2 uppercase tracking-wide">每日学习目标</p>
                    <p className="text-[11px] text-white/30 mb-2">每天要学习的新单词数量</p>
                    <div className="flex gap-2">
                      {GOAL_OPTIONS.map(g => (
                        <button
                          key={g}
                          onClick={() => updateReaderSettings({ dailyGoal: g })}
                          className={`flex-1 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                            readerSettings.dailyGoal === g
                              ? 'bg-[var(--color-primary)] text-white'
                              : 'bg-white/10 text-white/60'
                          }`}
                        >
                          {g}个
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 grid grid-cols-[56px_minmax(0,1fr)_56px] gap-2">
                      <button
                        type="button"
                        onClick={() => adjustReaderDailyGoal(-5)}
                        className="rounded-lg bg-white/10 py-2 text-[12px] font-medium text-white/70 transition-colors hover:bg-white/15"
                      >
                        -5
                      </button>
                      <input
                        type="number"
                        min={DAILY_GOAL_MIN}
                        max={DAILY_GOAL_MAX}
                        step={1}
                        inputMode="numeric"
                        value={readerGoalDraft}
                        onChange={(event) => setReaderGoalDraft(event.target.value)}
                        onBlur={() => applyReaderDailyGoal(readerGoalDraft)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.currentTarget.blur()
                          }
                        }}
                        className="rounded-lg bg-white/10 px-3 py-2 text-center text-[13px] font-medium text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        placeholder="自定义"
                      />
                      <button
                        type="button"
                        onClick={() => adjustReaderDailyGoal(5)}
                        className="rounded-lg bg-white/10 py-2 text-[12px] font-medium text-white/70 transition-colors hover:bg-white/15"
                      >
                        +5
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-white/30">也可以自定义每天新学词数，系统会按这个上限分配新词。</p>
                  </div>

                  {/* 学习模式 */}
                  <div>
                    <p className="text-[12px] text-white/50 mb-2 uppercase tracking-wide">学习模式</p>
                    <div className="flex gap-2">
                      {MODE_OPTIONS.map(m => (
                        <button
                          key={m.key}
                          onClick={() => updateReaderSettings({ learningMode: m.key })}
                          className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-lg transition-colors ${
                            readerSettings.learningMode === m.key
                              ? 'bg-[var(--color-primary)] text-white'
                              : 'bg-white/10 text-white/60'
                          }`}
                        >
                          <span className="text-[18px]">{m.icon}</span>
                          <span className="text-[11px] font-medium">{m.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 功能开关 */}
                  <div>
                    <p className="text-[12px] text-white/50 mb-2 uppercase tracking-wide">功能开关</p>
                    <div className="space-y-1">
                      <DarkToggleRow
                        label="🔊 自动播放单词发音"
                        value={readerSettings.autoPlayWord}
                        onChange={() => updateReaderSettings({ autoPlayWord: !readerSettings.autoPlayWord })}
                      />
                      <DarkToggleRow
                        label="📝 显示例句"
                        value={readerSettings.showExamples}
                        onChange={() => updateReaderSettings({ showExamples: !readerSettings.showExamples })}
                      />
                      <DarkToggleRow
                        label="⏰ 复习提醒"
                        value={readerSettings.reviewReminder}
                        onChange={() => updateReaderSettings({ reviewReminder: !readerSettings.reviewReminder })}
                      />
                    </div>
                  </div>
                </>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ===== 主内容区域 ===== */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto flex justify-center"
        onMouseUp={handleTextSelect}
      >
        {/* PDF Canvas 渲染模式 + 文本叠加层 */}
        {readMode === 'pdf' && (
          <div className="py-4 flex justify-center">
            {rendering && (
              <div className="fixed inset-0 flex items-center justify-center bg-black/20 z-10 pointer-events-none">
                <Loader2 size={24} className="text-white animate-spin" />
              </div>
            )}
            {/*
              外层 spacer: CSS transform 不影响文档流，手动设缩放后的宽高，
              让父 flex 容器知道实际占用空间，从而正确居中和滚动。
            */}
            <div style={{
              width: pageViewport.w > 0 ? pageViewport.w * wrapperScale : undefined,
              height: pageViewport.h > 0 ? pageViewport.h * wrapperScale + 8 : undefined,
            }}>
            {/*
              核心 wrapper: canvas + TextLayer + 覆盖层用完全相同的 viewport 尺寸。
              wrapperScale < 1 时整体缩放（手机端），保证三者完美对齐。
            */}
            <div
              ref={overlayWrapperRef}
              className="relative shadow-lg"
              style={{
                width: pageViewport.w || undefined,
                height: pageViewport.h || undefined,
                transformOrigin: '0 0',
                transform: wrapperScale < 1 ? `scale(${wrapperScale})` : undefined,
              }}
            >
              <canvas
                ref={(el) => {
                  canvasRef.current = el
                }}
                className="block"
              />

              {/* pdf.js 原生 TextLayer */}
              <div
                ref={textLayerRef}
                className={`textLayer overlay-mode-${overlayMode}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  zIndex: overlayMode === 'off' ? -1 : 2,
                  pointerEvents: overlayMode === 'off' ? 'none' : 'auto',
                  opacity: overlayMode === 'off' ? 0 : 1,
                }}
                onMouseUp={handleTextSelect}
              />

              {/* OCR 覆盖层：扫描版常没有原生 textLayer，需用 OCR bbox 自行覆盖 */}
              {ocrOverlayModel && overlayMode !== 'off' && (
                <div
                  key={ocrOverlayRenderKey}
                  className={`ocrOverlay ocr-overlay-mode-${overlayMode}`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: pageViewport.w || '100%',
                    height: pageViewport.h || '100%',
                    zIndex: 3,
                    pointerEvents: rendering ? 'none' : 'auto',
                    opacity: rendering ? 0 : 1,
                    transition: 'opacity 120ms ease-out',
                  }}
                  onMouseUp={handleTextSelect}
                >
                  {(() => {
                    const baseW = pageViewport.w || canvasRef.current?.clientWidth || 1
                    const baseH = pageViewport.h || canvasRef.current?.clientHeight || 1
                    const sx = baseW / Math.max(1, ocrOverlayModel.imageWidth)
                    const sy = baseH / Math.max(1, ocrOverlayModel.imageHeight)
                    const translatedMode = overlayMode === 'translate' && ocrTranslatedLines.length > 0 && ocrTranslateRegions.length > 0

                    const translatedEntries = translatedMode
                      ? ocrTranslateRegions.map((region, index) => {
                          const fitted = fitTranslatedRegionText(
                            {
                              ...region,
                              bbox: {
                                x0: region.bbox.x0 * sx,
                                y0: region.bbox.y0 * sy,
                                x1: region.bbox.x1 * sx,
                                y1: region.bbox.y1 * sy,
                              },
                              availableX0: region.availableX0 * sx,
                              availableX1: region.availableX1 * sx,
                              maxY1: region.maxY1 * sy,
                            },
                            ocrTranslatedLines[index] || region.text,
                          )

                          return {
                            key: region.id,
                            left: fitted.left,
                            top: region.bbox.y0 * sy,
                            width: fitted.width,
                            height: fitted.height,
                            fontSize: fitted.fontSize,
                            lineHeight: fitted.lineHeight,
                            paddingX: fitted.paddingX,
                            paddingY: fitted.paddingY,
                            lines: fitted.lines,
                            isCjk: fitted.isCjk,
                            confidence: region.confidence,
                          }
                        })
                      : []

                    const debugGroups = [
                      ...ocrOverlayModel.words.map((word) => ({
                        key: `debug-word-${word.id}`,
                        className: 'ocr-debug-word',
                        text: word.text,
                        left: word.bbox.x0 * sx,
                        top: word.bbox.y0 * sy,
                        width: Math.max(4, (word.bbox.x1 - word.bbox.x0) * sx),
                        height: Math.max(8, (word.bbox.y1 - word.bbox.y0) * sy),
                        confidence: word.confidence,
                      })),
                      ...ocrOverlayModel.lines.map((line) => ({
                        key: `debug-line-${line.id}`,
                        className: 'ocr-debug-line',
                        text: line.text,
                        left: line.bbox.x0 * sx,
                        top: line.bbox.y0 * sy,
                        width: Math.max(8, (line.bbox.x1 - line.bbox.x0) * sx),
                        height: Math.max(10, (line.bbox.y1 - line.bbox.y0) * sy),
                        confidence: line.confidence,
                      })),
                      ...ocrOverlayModel.regions.map((region) => ({
                        key: `debug-region-${region.id}`,
                        className: 'ocr-debug-region',
                        text: region.text,
                        left: region.bbox.x0 * sx,
                        top: region.bbox.y0 * sy,
                        width: Math.max(8, (region.bbox.x1 - region.bbox.x0) * sx),
                        height: Math.max(12, (region.bbox.y1 - region.bbox.y0) * sy),
                        confidence: region.confidence,
                      })),
                    ]

                    const coverEntries = ocrOverlayModel.coverBoxes.map((box) => ({
                      key: box.id,
                      text: box.text,
                      left: box.bbox.x0 * sx,
                      top: box.bbox.y0 * sy,
                      width: Math.max(4, (box.bbox.x1 - box.bbox.x0) * sx),
                      height: Math.max(10, (box.bbox.y1 - box.bbox.y0) * sy),
                      confidence: box.confidence,
                    }))

                    if (overlayMode === 'debug') {
                      return debugGroups.map((box) => (
                        <div
                          key={box.key}
                          className={`ocr-debug-box ${box.className}`}
                          style={{
                            left: box.left,
                            top: box.top,
                            width: box.width,
                            height: box.height,
                          }}
                        >
                          {ocrOverlayDebug && (
                            <span className="ocr-debug-label">
                              {Math.round(box.confidence)}
                            </span>
                          )}
                        </div>
                      ))
                    }

                    if (translatedMode) {
                      return translatedEntries.map((entry) => (
                        <div
                          key={entry.key}
                          className={`ocr-overlay-line ${entry.isCjk ? 'ocr-overlay-line-cjk' : 'ocr-overlay-line-latin'}`}
                          style={{
                            position: 'absolute',
                            left: entry.left,
                            top: entry.top,
                            width: entry.width,
                            height: entry.height,
                            minHeight: entry.height,
                            padding: `${entry.paddingY}px ${entry.paddingX}px`,
                            fontSize: entry.fontSize,
                            lineHeight: `${entry.lineHeight}px`,
                            userSelect: 'text',
                            WebkitUserSelect: 'text',
                          }}
                        >
                          {entry.lines.map((line, lineIndex) => (
                            <span key={`${entry.key}-line-${lineIndex}`} className="ocr-overlay-line-text">
                              {line}
                            </span>
                          ))}
                        </div>
                      ))
                    }

                    return coverEntries.map((box) => (
                      <span
                        key={box.key}
                        className="ocr-overlay-word"
                        style={{
                          position: 'absolute',
                          left: box.left,
                          top: box.top,
                          width: box.width,
                          height: box.height,
                          fontSize: Math.max(10, box.height * 0.72),
                          lineHeight: 1,
                          userSelect: 'text',
                          WebkitUserSelect: 'text',
                        }}
                      >
                        {box.text}
                      </span>
                    ))
                  })()}
                </div>
              )}

              <style>{`
                .textLayer {
                  text-align: initial;
                  overflow: hidden;
                }
                .textLayer span,
                .textLayer br {
                  color: transparent;
                  position: absolute;
                  white-space: pre;
                  transform-origin: 0% 0%;
                  user-select: text;
                  -webkit-user-select: text;
                }
                .textLayer span::selection {
                  background: rgba(59, 130, 246, 0.3);
                  color: rgba(0, 0, 0, 0.8);
                }
                /* 可选模式：透明可选 */
                .overlay-mode-select span { color: transparent !important; background: transparent !important; }
                /* 调试模式：半透明蓝色 */
                .overlay-mode-debug span { color: rgba(0, 80, 255, 0.35) !important; background: transparent !important; }
                /* 遮盖模式：白底黑字，完全覆盖原文 */
                .overlay-mode-cover span {
                  color: #1a1a1a !important;
                  background: white !important;
                  padding: 0 1px;
                }
                /* 翻译模式：白底 + 翻译文本（span 内容已被替换） */
                .overlay-mode-translate span {
                  color: #1a1a1a !important;
                  background: white !important;
                  padding: 0 1px;
                  font-family: var(--font-pdf-overlay) !important;
                }
                /* hover 时显示原文标记 */
                .overlay-mode-translate span:hover {
                  background: #FFF8E1 !important;
                  border-bottom: 2px solid #FFA000;
                  cursor: pointer;
                }
                /* OCR 覆盖层样式 */
                .ocrOverlay .ocr-overlay-word {
                  display: flex;
                  align-items: center;
                  white-space: nowrap;
                  overflow: hidden;
                  box-sizing: border-box;
                  padding: 0 1px;
                  border-radius: 2px;
                }
                .ocrOverlay .ocr-overlay-line {
                  display: flex;
                  flex-direction: column;
                  align-items: flex-start;
                  justify-content: flex-start;
                  white-space: nowrap;
                  overflow: hidden;
                  box-sizing: border-box;
                  border-radius: 5px;
                }
                .ocrOverlay .ocr-overlay-line-text {
                  display: block;
                  width: 100%;
                  white-space: nowrap;
                  overflow: hidden;
                }
                .ocrOverlay .ocr-overlay-word::selection {
                  background: rgba(59, 130, 246, 0.3);
                  color: rgba(0, 0, 0, 0.8);
                }
                .ocrOverlay .ocr-overlay-line::selection {
                  background: rgba(59, 130, 246, 0.3);
                  color: rgba(0, 0, 0, 0.8);
                }
                .ocr-overlay-mode-select .ocr-overlay-word {
                  color: transparent;
                  background: transparent;
                }
                .ocr-overlay-mode-select .ocr-overlay-line {
                  color: transparent;
                  background: transparent;
                }
                .ocr-overlay-mode-debug .ocr-overlay-word {
                  color: rgba(0, 80, 255, 0.35);
                  background: rgba(255, 255, 255, 0.25);
                  outline: 1px solid rgba(0, 80, 255, 0.35);
                }
                .ocr-overlay-mode-debug .ocr-overlay-line {
                  color: rgba(0, 80, 255, 0.35);
                  background: rgba(255, 255, 255, 0.25);
                  outline: 1px solid rgba(0, 80, 255, 0.35);
                }
                .ocr-overlay-mode-cover .ocr-overlay-word,
                .ocr-overlay-mode-translate .ocr-overlay-word {
                  color: #1a1a1a;
                  background: #fff;
                  box-shadow: 0 0 0 1px #fff inset;
                }
                .ocr-overlay-mode-cover .ocr-overlay-line,
                .ocr-overlay-mode-translate .ocr-overlay-line {
                  color: #1a1a1a;
                  background: #fff;
                  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(255, 255, 255, 0.96) inset;
                  font-family: var(--font-pdf-overlay);
                }
                .ocr-overlay-line-cjk { letter-spacing: 0.01em; }
                .ocr-overlay-line-latin { letter-spacing: 0.005em; }
                .ocr-debug-box {
                  position: absolute;
                  pointer-events: none;
                  box-sizing: border-box;
                }
                .ocr-debug-word {
                  border: 1px solid rgba(59, 130, 246, 0.5);
                  background: rgba(59, 130, 246, 0.08);
                }
                .ocr-debug-line {
                  border: 1px solid rgba(249, 115, 22, 0.65);
                  background: rgba(249, 115, 22, 0.08);
                }
                .ocr-debug-region {
                  border: 1px dashed rgba(34, 197, 94, 0.8);
                  background: rgba(34, 197, 94, 0.05);
                }
                .ocr-debug-label {
                  position: absolute;
                  top: -14px;
                  left: 0;
                  padding: 1px 4px;
                  border-radius: 999px;
                  font-size: 9px;
                  line-height: 1.2;
                  color: white;
                  background: rgba(15, 23, 42, 0.8);
                }
              `}</style>
            </div>
            </div>{/* spacer 结束 */}
          </div>
        )}

        {/* 文本模式（提取的纯文本） */}
        {readMode === 'text' && (
          <div className="w-full max-w-[650px] px-5 py-6">
            {contentText ? (
              contentText.split(/\n\n+/).map((para, i) => (
                <p key={i} className="text-white/90 leading-[1.8] mb-4" style={{ fontSize: `${readerSettings.fontSize}px` }}>
                  {para.trim()}
                </p>
              ))
            ) : (
              <div className="text-center py-12">
                <p className="text-[14px] text-white/50">无文本内容</p>
                <p className="text-[12px] text-white/30 mt-1">
                  当前文件没有可用文本层，请切换回 PDF 原版查看
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===== 底部翻页栏 ===== */}
      <div className="flex items-center justify-between px-5 py-3 bg-[#222] border-t border-white/10">
        {/* 上一页 */}
        <button
          onClick={prevPage}
          disabled={currentPage <= 1}
          className="flex items-center gap-1 px-4 py-2 bg-white/10 rounded-full text-[13px] text-white/80 active:scale-95 transition-transform disabled:opacity-30"
        >
          <ArrowLeft size={16} /> 上一页
        </button>

        {/* 进度条 */}
        <div className="flex-1 mx-4">
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--color-primary)] rounded-full transition-all duration-300"
              style={{ width: `${(currentPage / totalPages) * 100}%` }}
            />
          </div>
        </div>

        {/* 下一页 */}
        <button
          onClick={nextPage}
          disabled={currentPage >= totalPages}
          className="flex items-center gap-1 px-4 py-2 bg-white/10 rounded-full text-[13px] text-white/80 active:scale-95 transition-transform disabled:opacity-30"
        >
          下一页 <ArrowRight size={16} />
        </button>
      </div>

      {/* ===== 查词弹窗 ===== */}
      {showWordPopup && selectedText && (
        <WordPopupPanel
          word={selectedText}
          onClose={() => { setShowWordPopup(false); setSelectedText('') }}
          onAddWord={addWord}
          dark
        />
      )}

      {/* ===== 页码跳转弹窗 ===== */}
      {showPageJump && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowPageJump(false)} />
          <div className="relative bg-[var(--color-background)] rounded-[var(--radius-md)] p-6 w-[280px]">
            <h3 className="text-[16px] font-bold text-[var(--color-foreground)] mb-3">跳转到页码</h3>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePageJump()}
              placeholder={`1 - ${totalPages}`}
              className="w-full px-4 py-2.5 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)] text-[14px] text-[var(--color-foreground)] outline-none text-center"
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowPageJump(false)}
                className="flex-1 py-2 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)] text-[13px] text-[var(--color-foreground)]"
              >
                取消
              </button>
              <button
                onClick={handlePageJump}
                className="flex-1 py-2 bg-[var(--color-primary)] rounded-[var(--radius-sm)] text-[13px] text-white font-semibold"
              >
                跳转
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ========== 查词弹窗组件 ==========

interface WordPopupPanelProps {
  word: string
  onClose: () => void
  onAddWord: (data: { word: string; phonetic?: string; meaning?: string; source?: 'translate' | 'reading' | 'manual' | 'test' | 'ai' }) => Promise<any>
  dark?: boolean
}

function WordPopupPanel({ word, onClose, onAddWord, dark }: WordPopupPanelProps) {
  const [added, setAdded] = useState(false)

  // 简单的词汇释义（实际项目可接 AI 翻译 API）
  const isChinese = /[\u4e00-\u9fff]/.test(word)

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-40 p-4 ${
      dark ? 'bg-[#222] border-t border-white/10' : 'bg-[var(--color-card)] border-t border-[var(--color-border)]'
    }`} style={{ boxShadow: '0 -4px 20px rgba(0,0,0,0.2)' }}>
      <div className="max-w-[430px] mx-auto">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className={`text-[18px] font-bold ${dark ? 'text-white' : 'text-[var(--color-primary)]'}`}>
              {word}
            </h3>
            <p className={`text-[12px] ${dark ? 'text-white/50' : 'text-[var(--color-muted)]'}`}>
              选中的文本
            </p>
          </div>
          <button onClick={onClose} className="p-1">
            <X size={18} className={dark ? 'text-white/50' : 'text-[var(--color-muted)]'} />
          </button>
        </div>

        <div className="flex gap-2">
          {/* 朗读 */}
          <button
            onClick={() => isChinese ? speakAuto(word) : speakEnglish(word)}
            className={`p-2.5 rounded-full ${
              dark ? 'bg-white/10' : 'bg-[var(--color-background-secondary)]'
            } active:scale-90 transition-transform`}
          >
            <Volume2 size={16} className={dark ? 'text-white/60' : 'text-[var(--color-muted)]'} />
          </button>

          {/* 添加到词汇本 */}
          {!isChinese && (
            <button
              onClick={async () => {
                try {
                  await onAddWord({
                    word: word,
                    phonetic: '',
                    meaning: '从 PDF 阅读中标记',
                    source: 'reading',
                  })
                  setAdded(true)
                } catch {}
              }}
              disabled={added}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[var(--radius-xs)] text-[13px] font-semibold active:scale-[0.98] transition-transform ${
                added
                  ? 'bg-[var(--color-success)]/20 text-[var(--color-success)]'
                  : 'bg-[var(--color-primary)] text-white'
              }`}
            >
              {added ? <><Check size={14} /> 已收录</> : <><ChevronRight size={14} /> 收录到词汇本</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ========== 深色主题 Toggle 行组件 ==========

interface DarkToggleRowProps {
  label: string
  value: boolean
  onChange: () => void
}

function DarkToggleRow({ label, value, onChange }: DarkToggleRowProps) {
  return (
    <div className="flex items-center justify-between py-2.5 px-1">
      <span className="text-[13px] text-white/80">{label}</span>
      <button
        onClick={onChange}
        className={`w-[40px] h-[22px] rounded-full flex items-center transition-colors duration-200 ${
          value ? 'bg-[var(--color-primary)] justify-end' : 'bg-white/20 justify-start'
        }`}
      >
        <div className="w-[18px] h-[18px] rounded-full bg-white mx-[2px] shadow-sm" />
      </button>
    </div>
  )
}
