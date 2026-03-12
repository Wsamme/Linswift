import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ChevronLeft, ZoomIn, ZoomOut, ChevronRight, Volume2,
  Settings, Loader2, BookOpen, ScanSearch, ArrowLeft, ArrowRight,
  Maximize2, X, Check, Languages,
} from 'lucide-react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import {
  loadPDFDocument,
  renderPageToCanvas,
  isScannedPDF,
  ocrPageWithLayout,
  getTextLayerData,
  extractTextFromPDF,
  getPDFMetadata,
  sanitizeText,
  groupItemsIntoLines,
  type OCRLayoutResult,
  type PDFTextLayerItem,
  type TextLine,
} from '../lib/pdf'
import { translateBatch } from '../services/gemini'
import { speakEnglish, speakAuto } from '../lib/tts'
import { supabase, uploadFile, type UserBook } from '../lib/supabase'
import { useVocabulary } from '../hooks/useVocabulary'
import { useAuth } from '../contexts/AuthContext'

// ===== 阅读器设置类型 =====
const READER_SETTINGS_KEY = 'linswift_reader_settings'

interface ReaderSettings {
  // 语言设置
  ttsLang: string          // TTS 朗读语言
  ocrLang: string          // OCR 识别语言
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

const DEFAULT_READER_SETTINGS: ReaderSettings = {
  ttsLang: 'en-US',
  ocrLang: 'eng',
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
  { value: 'en-US', label: '🇺🇸 美式英语' },
  { value: 'en-GB', label: '🇬🇧 英式英语' },
  { value: 'en-AU', label: '🇦🇺 澳洲英语' },
  { value: 'zh-CN', label: '🇨🇳 简体中文' },
  { value: 'ja-JP', label: '🇯🇵 日语' },
  { value: 'ko-KR', label: '🇰🇷 韩语' },
  { value: 'fr-FR', label: '🇫🇷 法语' },
  { value: 'de-DE', label: '🇩🇪 德语' },
  { value: 'es-ES', label: '🇪🇸 西班牙语' },
]

// OCR 语言选项
const OCR_LANG_OPTIONS = [
  { value: 'eng', label: '🇬🇧 English' },
  { value: 'chi_sim', label: '🇨🇳 简体中文' },
  { value: 'chi_tra', label: '🇹🇼 繁体中文' },
  { value: 'jpn', label: '🇯🇵 日本語' },
  { value: 'kor', label: '🇰🇷 한국어' },
  { value: 'fra', label: '🇫🇷 Français' },
  { value: 'deu', label: '🇩🇪 Deutsch' },
  { value: 'spa', label: '🇪🇸 Español' },
]

// 翻译目标语言选项
const TRANSLATE_LANG_OPTIONS = [
  { value: 'zh-CN', label: '🇨🇳 中文' },
  { value: 'en', label: '🇺🇸 English' },
  { value: 'ja', label: '🇯🇵 日本語' },
  { value: 'ko', label: '🇰🇷 한국어' },
  { value: 'fr', label: '🇫🇷 Français' },
  { value: 'de', label: '🇩🇪 Deutsch' },
  { value: 'es', label: '🇪🇸 Español' },
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
    const raw = localStorage.getItem(READER_SETTINGS_KEY)
    return raw ? { ...DEFAULT_READER_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_READER_SETTINGS }
  } catch {
    return { ...DEFAULT_READER_SETTINGS }
  }
}

function saveReaderSettings(s: ReaderSettings) {
  localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(s))
  // 同时写入旧的学习设置 key（保持兼容）
  localStorage.setItem('linswift_learn_settings', JSON.stringify({
    dailyGoal: s.dailyGoal,
    learningMode: s.learningMode,
    showExamples: s.showExamples,
    reviewReminder: s.reviewReminder,
  }))
}

/**
 * PDF 阅读器 —— 真正的 PDF 渲染阅读体验
 *
 * 功能：
 *  1. 用 Canvas 渲染 PDF 原始页面（保留排版、图片等）
 *  2. 自动检测扫描版 PDF → 提供 OCR 文字识别
 *  3. 翻页（上一页/下一页）+ 页码跳转
 *  4. 缩放（放大/缩小/适应屏幕）
 *  5. 文本选择 → 查词释义 + TTS 朗读
 *  6. OCR 模式：逐页识别并显示提取文本
 *  7. 阅读进度自动保存到数据库
 *  8. 支持两种来源：
 *     - bookId 参数 → 从数据库加载（file_path 或 content_text）
 *     - 本地文件选择器（无 bookId 时）
 *
 * 技术方案：
 *  - pdfjs-dist 渲染 PDF Canvas
 *  - tesseract.js 做 OCR（按需动态加载）
 *  - Canvas + 文本层叠加做选词
 */

// ===== 阅读模式 =====
type ReadMode = 'pdf' | 'text' | 'ocr'

export default function PDFReaderPage() {
  const navigate = useNavigate()
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
  const [isScanned, setIsScanned] = useState(false)

  // ===== OCR 状态 =====
  const [ocrText, setOcrText] = useState('')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrPageText, setOcrPageText] = useState('')

  // ===== 文本叠加层状态 =====
  const [pdfTextItems, setPdfTextItems] = useState<PDFTextLayerItem[]>([])
  const [pdfTextViewport, setPdfTextViewport] = useState({ w: 0, h: 0 })
  const [ocrLayoutData, setOcrLayoutData] = useState<OCRLayoutResult | null>(null)
  const [textLayerEnabled, setTextLayerEnabled] = useState(true)

  // 叠加层显示模式
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('select')

  // 合并后的文本行（用于翻译模式和遮盖模式）
  const [pageLines, setPageLines] = useState<TextLine[]>([])
  // 翻译结果（与 pageLines 一一对应，null 表示未翻译）
  const [translatedLines, setTranslatedLines] = useState<(string | null)[]>([])
  // 翻译进行中
  const [translating, setTranslating] = useState(false)
  // hover 状态：当前 hover 的行索引（用于显示原文）
  const [hoveredLineIdx, setHoveredLineIdx] = useState<number | null>(null)

  // ===== 文本模式（从数据库 content_text） =====
  const [contentText, setContentText] = useState('')
  const [book, setBook] = useState<UserBook | null>(null)

  // ===== 阅读器设置 =====
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(loadReaderSettings)
  const updateReaderSettings = (partial: Partial<ReaderSettings>) => {
    setReaderSettings(prev => {
      const next = { ...prev, ...partial }
      saveReaderSettings(next)
      return next
    })
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
  const [textLayerScale, setTextLayerScale] = useState(0)

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

  // ================================================================
  // 加载 PDF（从数据库或本地文件）
  // ================================================================
  useEffect(() => {
    async function loadFromDB() {
      if (!bookId) {
        setLoading(false)
        return
      }

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
  }, [bookId])

  // ================================================================
  // 本地文件导入（没有 bookId 时可以直接选文件阅读）
  // ================================================================
  const handleLocalFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[DEBUG] handleLocalFile called')
    const file = e.target.files?.[0]
    console.log('[DEBUG] file:', file?.name, file?.size)
    if (!file) {
      console.log('[DEBUG] No file selected')
      return
    }

    setLoading(true)
    setSavedToShelf(false)
    try {
      console.log('[DEBUG] Loading PDF document...')
      const pdf = await loadPDFDocument(file)
      console.log('[DEBUG] PDF loaded, numPages:', pdf.numPages)
      setPdfDoc(pdf)
      setTotalPages(pdf.numPages)
      setCurrentPage(1)
      setHasAutoFitted(false)
      setReadMode('pdf')
      setLocalFile(file) // 保存文件引用，用于后续"保存到书架"
      console.log('[DEBUG] PDF state updated')

      // 检测是否是扫描版
      try {
        const scanned = await isScannedPDF(file)
        setIsScanned(scanned)
        if (scanned) setShowSettings(true)
      } catch {
        // 扫描检测失败不影响阅读
      }
    } catch (err: any) {
      console.error('[DEBUG] PDF load error:', err)
      alert(`打开 PDF 失败: ${err.message || '格式不支持'}`)
    }
    setLoading(false)
    console.log('[DEBUG] handleLocalFile completed')
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
  // 渲染当前页到 Canvas + 提取文本层数据
  // ================================================================
  const renderCurrentPage = useCallback(async () => {
    console.log('[DEBUG] renderCurrentPage called', {
      hasPdfDoc: !!pdfDoc,
      hasCanvas: !!canvasRef.current,
      readMode,
      currentPage,
      scale
    })
    if (!pdfDoc || !canvasRef.current || readMode !== 'pdf') {
      console.log('[DEBUG] renderCurrentPage skipped - missing requirements')
      return
    }

    const taskId = ++renderTaskRef.current
    setRendering(true)
    console.log('[DEBUG] Starting render, taskId:', taskId)

    try {
      console.log('[DEBUG] Calling renderPageToCanvas...')
      await renderPageToCanvas(pdfDoc, currentPage, canvasRef.current, scale)
      console.log('[DEBUG] renderPageToCanvas completed')

      if (textLayerEnabled) {
        try {
          const { items, viewportWidth, viewportHeight } = await getTextLayerData(pdfDoc, currentPage, scale)
          if (taskId === renderTaskRef.current) {
            setPdfTextItems(items)
            setPdfTextViewport({ w: viewportWidth, h: viewportHeight })
            const lines = groupItemsIntoLines(items)
            setPageLines(lines)
            setTranslatedLines(new Array(lines.length).fill(null))

            // 首页关键：canvas 已渲染完毕，立即算出正确的缩放比
            // 避免 ResizeObserver 异步延迟导致第一帧用错误的 textLayerScale=1
            requestAnimationFrame(() => {
              const wrapper = overlayWrapperRef.current
              if (wrapper && viewportWidth > 0) {
                const w = wrapper.clientWidth
                if (w > 0) setTextLayerScale(w / viewportWidth)
              }
            })
          }
        } catch {
          if (taskId === renderTaskRef.current) {
            setPdfTextItems([])
            setPageLines([])
          }
        }
      }
    } catch (err) {
      console.error('渲染页面失败:', err)
    }

    if (taskId === renderTaskRef.current) {
      setRendering(false)
    }
  }, [pdfDoc, currentPage, scale, readMode, textLayerEnabled])

  // 每次页码或缩放变化时重新渲染
  useEffect(() => {
    renderCurrentPage()
  }, [renderCurrentPage])

  // 当canvas元素首次可用且有PDF文档时，触发渲染
  // 这解决了PDF加载时canvas还未渲染到DOM的时序问题
  // 使用setTimeout确保在React完成DOM更新和ref赋值后再检查
  useEffect(() => {
    if (pdfDoc && readMode === 'pdf') {
      console.log('[DEBUG] PDF loaded, waiting for canvas ref...')
      // 使用setTimeout确保ref已经被设置
      const timer = setTimeout(() => {
        if (canvasRef.current) {
          console.log('[DEBUG] Canvas now available, triggering render')
          renderCurrentPage()
        } else {
          console.log('[DEBUG] Canvas ref still null after timeout')
        }
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [pdfDoc, readMode, renderCurrentPage])

  // ================================================================
  // 翻页操作
  // ================================================================
  const goToPage = useCallback((page: number) => {
    const safePage = Math.max(1, Math.min(page, totalPages))
    setCurrentPage(safePage)
    setOcrLayoutData(null)
    setOcrPageText('')
    setTranslatedLines([])
    setHoveredLineIdx(null)

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
  }, [totalPages, bookId, user])

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

  // 追踪 Canvas 实际显示宽度，计算文本叠加层的精确缩放比
  // 关键：在 ResizeObserver 回调之前就同步计算一次，避免首页首帧错位
  useEffect(() => {
    const wrapper = overlayWrapperRef.current
    if (!wrapper) return

    const naturalWidth = ocrLayoutData
      ? ocrLayoutData.imageWidth
      : pdfTextViewport.w

    if (naturalWidth <= 0) return

    // 立即同步计算（读取 clientWidth 会强制浏览器 reflow，保证拿到最新尺寸）
    const immediateW = wrapper.clientWidth
    if (immediateW > 0) {
      setTextLayerScale(immediateW / naturalWidth)
    }

    // ResizeObserver 持续监听后续尺寸变化（窗口缩放等）
    const ro = new ResizeObserver((entries) => {
      const actualW = entries[0]?.contentRect.width
      if (actualW && actualW > 0) {
        setTextLayerScale(actualW / naturalWidth)
      }
    })
    ro.observe(wrapper)
    return () => ro.disconnect()
  }, [pdfTextViewport.w, ocrLayoutData])

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
  // 当前页 OCR 识别 —— 带布局保留
  // ================================================================
  const handleOCRCurrentPage = async () => {
    if (!canvasRef.current) return

    setOcrLoading(true)
    setOcrPageText('')
    setOcrLayoutData(null)

    try {
      // 使用带布局的 OCR，返回每行每词的位置信息
      const result = await ocrPageWithLayout(canvasRef.current, readerSettings.ocrLang)
      setOcrPageText(result.text)
      setOcrLayoutData(result)
      // 保持 PDF 模式，切换到遮盖叠加
      setOverlayMode('cover')
    } catch (err: any) {
      alert(`OCR 识别失败: ${err.message || '未知错误'}`)
    }

    setOcrLoading(false)
  }

  // ================================================================
  // 翻译当前页（按行翻译 + 覆盖显示）
  // ================================================================
  const handleTranslatePage = async () => {
    // 优先用 PDF 原生行，其次用 OCR 行
    let linesToTranslate: string[] = []

    if (pageLines.length > 0) {
      linesToTranslate = pageLines.map(l => l.text)
    } else if (ocrLayoutData && ocrLayoutData.lines.length > 0) {
      linesToTranslate = ocrLayoutData.lines.map(l => l.text)
    }

    if (linesToTranslate.length === 0) {
      alert('当前页没有可翻译的文本。如果是扫描版 PDF，请先 OCR 识别。')
      return
    }

    setTranslating(true)
    try {
      const targetLang = readerSettings.translateTo === 'zh-CN' ? '中文'
        : readerSettings.translateTo === 'en' ? 'English'
        : readerSettings.translateTo === 'ja' ? '日语'
        : readerSettings.translateTo === 'ko' ? '韩语'
        : readerSettings.translateTo === 'fr' ? '法语'
        : readerSettings.translateTo === 'de' ? '德语'
        : readerSettings.translateTo === 'es' ? '西班牙语'
        : '中文'

      const results = await translateBatch(linesToTranslate, targetLang)
      setTranslatedLines(results)
      setOverlayMode('translate')
    } catch (err: any) {
      alert(`翻译失败: ${err.message || '未知错误'}`)
    }
    setTranslating(false)
  }

  // ================================================================
  // 全书 OCR 提取
  // ================================================================
  const handleFullOCR = async () => {
    if (!pdfDoc) return

    // 需要从原始文件触发，因为 pdfDoc 已经在内存中
    setOcrLoading(true)
    setOcrText('')
    setOcrProgress(0)

    try {
      // 使用临时 canvas 逐页渲染 + OCR
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker(readerSettings.ocrLang)
      const pageTexts: string[] = []

      for (let i = 1; i <= pdfDoc.numPages; i++) {
        setOcrProgress(Math.round(((i - 1) / pdfDoc.numPages) * 100))

        // 临时 Canvas
        const tempCanvas = document.createElement('canvas')
        await renderPageToCanvas(pdfDoc, i, tempCanvas, 2.0)

        const imageData = tempCanvas.toDataURL('image/png')
        const { data } = await worker.recognize(imageData)
        pageTexts.push(data.text || '')

        setOcrProgress(Math.round((i / pdfDoc.numPages) * 100))
      }

      await worker.terminate()
      const fullText = pageTexts.join('\n\n')
      setOcrText(fullText)
      setContentText(fullText)
      setReadMode('ocr')

      // 保存 OCR 文本到数据库
      if (bookId) {
        await supabase
          .from('user_books')
          .update({ content_text: fullText.slice(0, 500000) })
          .eq('id', parseInt(bookId))
      }
    } catch (err: any) {
      alert(`OCR 提取失败: ${err.message || '未知错误'}`)
    }

    setOcrLoading(false)
  }

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
          <button onClick={() => navigate(-1)} className="p-1">
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
            支持标准 PDF 和扫描版 PDF（OCR 识别）<br />
            <span className="text-[11px]">打开后可一键保存到书架</span>
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-8 py-3 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-[15px] font-semibold active:scale-95 transition-transform"
          >
            选择 PDF 文件
          </button>
          <button
            onClick={() => navigate('/bookshelf')}
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
          <button onClick={() => navigate(-1)} className="p-1">
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
            onClick={() => navigate('/bookshelf')}
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
          <button onClick={() => navigate(-1)} className="p-1">
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
    <div className="min-h-screen bg-[#333] flex flex-col">
      {/* ===== 顶部工具栏 ===== */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#222] text-white">
        {/* 左侧：返回 */}
        <button onClick={() => navigate(-1)} className="p-1 active:scale-90 transition-transform">
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
          {/* OCR 识别 */}
          <button
            onClick={handleOCRCurrentPage}
            disabled={ocrLoading}
            className={`p-1.5 active:scale-90 transition-transform ${ocrLayoutData ? 'bg-orange-500/30 rounded' : ''}`}
            title="OCR 识别当前页"
          >
            {ocrLoading
              ? <Loader2 size={18} className="text-white/60 animate-spin" />
              : <ScanSearch size={18} className={ocrLayoutData ? 'text-orange-400' : 'text-white/70'} />
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
                      {(ocrText || ocrPageText) && (
                        <button
                          onClick={() => setReadMode('ocr')}
                          className={`flex-1 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                            readMode === 'ocr' ? 'bg-orange-500 text-white' : 'bg-white/10 text-white/60'
                          }`}
                        >
                          OCR
                        </button>
                      )}
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

                  {/* OCR 工具 + 叠加层控制 */}
                  <div>
                    <p className="text-[12px] text-white/50 mb-2 uppercase tracking-wide">OCR 识别</p>
                    <button
                      onClick={() => { handleOCRCurrentPage(); setShowSettings(false) }}
                      disabled={ocrLoading}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/10 rounded-lg text-[13px] text-white/70 active:scale-95 disabled:opacity-50 mb-2"
                    >
                      <ScanSearch size={14} /> 识别当前页（保留布局）
                    </button>
                    {isScanned && (
                      <button
                        onClick={() => { handleFullOCR(); setShowSettings(false) }}
                        disabled={ocrLoading}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-orange-500/80 rounded-lg text-[13px] text-white active:scale-95 disabled:opacity-50"
                      >
                        {ocrLoading
                          ? <><Loader2 size={14} className="animate-spin" /> OCR 中 {ocrProgress}%</>
                          : <><ScanSearch size={14} /> 全书 OCR 识别</>
                        }
                      </button>
                    )}
                  </div>

                  {/* 文本叠加层模式 */}
                  <div>
                    <p className="text-[12px] text-white/50 mb-2 uppercase tracking-wide">叠加层模式</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {([
                        { key: 'off' as const, label: '关闭', desc: '无叠加' },
                        { key: 'select' as const, label: '可选', desc: '透明可选文字' },
                        { key: 'cover' as const, label: '遮盖', desc: '白底覆盖原文' },
                        { key: 'translate' as const, label: '翻译', desc: '翻译覆盖原文' },
                      ] as const).map(m => (
                        <button
                          key={m.key}
                          onClick={() => {
                            setOverlayMode(m.key)
                            if (m.key === 'translate' && translatedLines.every(l => l === null)) {
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
                    <DarkToggleRow
                      label="启用文本层提取"
                      value={textLayerEnabled}
                      onChange={() => setTextLayerEnabled(!textLayerEnabled)}
                    />
                    {pageLines.length > 0 && (
                      <p className="mt-2 text-[10px] text-blue-300/70">
                        已提取 {pageLines.length} 行文字
                        {translatedLines.some(l => l !== null) && '（已翻译）'}
                      </p>
                    )}
                    {ocrLayoutData && (
                      <p className="mt-1 text-[10px] text-orange-300/70">
                        OCR 已识别 {ocrLayoutData.lines.length} 行
                      </p>
                    )}
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

                  {/* OCR 识别语言 */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <ScanSearch size={14} className="text-white/50" />
                      <p className="text-[12px] text-white/50 uppercase tracking-wide">OCR 识别语言</p>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {OCR_LANG_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => updateReaderSettings({ ocrLang: opt.value })}
                          className={`py-2 px-2.5 rounded-lg text-[12px] text-left transition-colors ${
                            readerSettings.ocrLang === opt.value
                              ? 'bg-orange-500 text-white'
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
          <div className="relative py-4 flex justify-center">
            {rendering && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-10">
                <Loader2 size={24} className="text-white animate-spin" />
              </div>
            )}
            {/* 外层 wrapper：inline-block 收缩到和 canvas 一样大，用于 ResizeObserver 测量 */}
            <div ref={overlayWrapperRef} className="relative inline-block" style={{ maxWidth: '100%' }}>
              <canvas
                ref={canvasRef}
                className="shadow-lg block"
                style={{ maxWidth: '100%', height: 'auto' }}
              />

              {/* ===== 文本叠加层（仅在 scale 已计算后渲染，防止首帧闪烁） ===== */}
              {textLayerEnabled && overlayMode !== 'off' && textLayerScale > 0 && (
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{
                    pointerEvents: overlayMode === 'select' ? 'none' : 'auto',
                    userSelect: 'text',
                    WebkitUserSelect: 'text',
                    zIndex: 2,
                  }}
                  onMouseUp={handleTextSelect}
                >
                  {/* 使用合并后的行数据渲染（遮盖/翻译模式） */}
                  {(overlayMode === 'cover' || overlayMode === 'translate') && pageLines.length > 0 && pdfTextViewport.w > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0, left: 0,
                        width: pdfTextViewport.w,
                        height: pdfTextViewport.h,
                        transformOrigin: '0 0',
                        transform: `scale(${textLayerScale})`,
                      }}
                    >
                      {pageLines.map((line, i) => {
                        const isHovered = hoveredLineIdx === i
                        const hasTranslation = translatedLines[i] != null && translatedLines[i] !== line.text
                        const showOriginal = isHovered && overlayMode === 'translate' && hasTranslation
                        const displayText = (overlayMode === 'translate' && hasTranslation && !showOriginal)
                          ? translatedLines[i]!
                          : line.text

                        return (
                          <div
                            key={`line-${i}`}
                            onMouseEnter={() => setHoveredLineIdx(i)}
                            onMouseLeave={() => setHoveredLineIdx(null)}
                            style={{
                              position: 'absolute',
                              left: line.x,
                              top: line.y,
                              minWidth: line.width,
                              height: line.height,
                              backgroundColor: showOriginal ? '#FFF8E1' : 'white',
                              color: '#1a1a1a',
                              fontSize: line.fontSize,
                              lineHeight: `${line.height}px`,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              cursor: hasTranslation ? 'pointer' : 'default',
                              borderBottom: showOriginal ? '2px solid #FFA000' : 'none',
                              transition: 'background-color 0.15s',
                            }}
                          >
                            {displayText}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* OCR 行遮盖/翻译模式 */}
                  {(overlayMode === 'cover' || overlayMode === 'translate') && ocrLayoutData && ocrLayoutData.lines.length > 0 && pageLines.length === 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0, left: 0,
                        width: ocrLayoutData.imageWidth,
                        height: ocrLayoutData.imageHeight,
                        transformOrigin: '0 0',
                        transform: `scale(${textLayerScale})`,
                      }}
                    >
                      {ocrLayoutData.lines.map((line, i) => {
                        const isHovered = hoveredLineIdx === i
                        const hasTranslation = translatedLines[i] != null && translatedLines[i] !== line.text
                        const showOriginal = isHovered && overlayMode === 'translate' && hasTranslation
                        const displayText = (overlayMode === 'translate' && hasTranslation && !showOriginal)
                          ? translatedLines[i]!
                          : line.text

                        return (
                          <div
                            key={`ocr-cover-${i}`}
                            onMouseEnter={() => setHoveredLineIdx(i)}
                            onMouseLeave={() => setHoveredLineIdx(null)}
                            style={{
                              position: 'absolute',
                              left: line.bbox.x0 - 2,
                              top: line.bbox.y0 - 1,
                              minWidth: line.bbox.x1 - line.bbox.x0 + 4,
                              height: line.bbox.y1 - line.bbox.y0 + 2,
                              backgroundColor: showOriginal ? '#FFF8E1' : 'white',
                              color: '#1a1a1a',
                              fontSize: Math.max(10, (line.bbox.y1 - line.bbox.y0) * 0.85),
                              lineHeight: `${line.bbox.y1 - line.bbox.y0 + 2}px`,
                              padding: '0 3px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              cursor: hasTranslation ? 'pointer' : 'default',
                              borderBottom: showOriginal ? '2px solid #FFA000' : 'none',
                              transition: 'background-color 0.15s',
                            }}
                          >
                            {displayText}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* 透明选择模式（select/debug）：仍用原始 items 逐个定位 */}
                  {(overlayMode === 'select' || overlayMode === 'debug') && pdfTextItems.length > 0 && pdfTextViewport.w > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0, left: 0,
                        width: pdfTextViewport.w,
                        height: pdfTextViewport.h,
                        transformOrigin: '0 0',
                        transform: `scale(${textLayerScale})`,
                        pointerEvents: 'auto',
                      }}
                    >
                      {pdfTextItems.map((item, i) => (
                        <span
                          key={`pdf-${i}`}
                          style={{
                            position: 'absolute',
                            left: item.x,
                            top: item.y,
                            fontSize: item.fontSize,
                            color: overlayMode === 'debug' ? 'rgba(0, 80, 255, 0.35)' : 'transparent',
                            whiteSpace: 'pre',
                            lineHeight: 1,
                            transformOrigin: '0% 0%',
                            transform: item.cssTransform || undefined,
                          }}
                        >
                          {item.str}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <style>{`
                .absolute span::selection,
                .absolute div::selection {
                  background: rgba(59, 130, 246, 0.3);
                  color: #000;
                }
              `}</style>
            </div>
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
                  如果这是扫描版 PDF，请使用 OCR 功能提取文字
                </p>
              </div>
            )}
          </div>
        )}

        {/* OCR 模式（OCR 识别的文本） */}
        {readMode === 'ocr' && (
          <div className="w-full max-w-[650px] px-5 py-6">
            {ocrLoading && (
              <div className="text-center py-8">
                <Loader2 size={24} className="text-white/60 animate-spin mx-auto mb-3" />
                <p className="text-[13px] text-white/60">正在 OCR 识别... {ocrProgress}%</p>
                <div className="w-48 h-1.5 mx-auto mt-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-400 rounded-full transition-all duration-300"
                    style={{ width: `${ocrProgress}%` }}
                  />
                </div>
              </div>
            )}
            {(ocrPageText || ocrText) && (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <ScanSearch size={16} className="text-orange-400" />
                  <span className="text-[12px] text-orange-400 font-semibold">OCR 识别结果</span>
                </div>
                {(ocrPageText || ocrText).split(/\n+/).map((line, i) => (
                  <p key={i} className="text-white/90 leading-[1.8] mb-2" style={{ fontSize: `${readerSettings.fontSize}px` }}>
                    {line.trim() || '\u00A0'}
                  </p>
                ))}
              </>
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
