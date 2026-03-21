import { useCallback, useMemo, useState } from 'react'
import {
  Camera,
  Check,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Languages,
  Loader2,
  RefreshCcw,
} from 'lucide-react'
import {
  buildOverlayRegions,
  createOCRSession,
  fitTranslatedRegionText,
  recognizeCanvasWithLayout,
  type OverlayModel,
} from '../../lib/ocr'
import { sanitizeText, type OCRLayoutResult } from '../../lib/pdf'
import { translateBatch, type BatchTranslationResult } from '../../services/gemini'

const SCREENSHOT_OCR_LANG = 'eng+chi_sim'

function isDesktopScreenshotSupported() {
  return Boolean(window.electronShell?.isDesktop && window.electronShell?.captureScreenshot)
}

async function loadImageToCanvas(dataUrl: string) {
  const image = new Image()
  image.src = dataUrl
  await image.decode()

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('截图画布初始化失败')
  }

  context.drawImage(image, 0, 0)
  return canvas
}

function normalizeRegionTexts(model: OverlayModel | null) {
  if (!model) return []
  return model.translationRegions
    .map((region) => sanitizeText(region.text).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function buildTranslationStatus(result: BatchTranslationResult, regionCount: number, targetLang: string) {
  const changedPart = result.changedCount > 0
    ? `已翻译 ${result.changedCount}/${regionCount} 个区域`
    : `已完成 ${regionCount} 个区域的翻译检查`

  if (result.fallbackUsed) {
    return `${changedPart}，部分区域保留原文。目标语言：${targetLang}`
  }

  return `${changedPart}，目标语言：${targetLang}`
}

interface DesktopScreenshotTranslatorProps {
  targetLang: string
  onUseExtractedText: (text: string) => void
}

export default function DesktopScreenshotTranslator({
  targetLang,
  onUseExtractedText,
}: DesktopScreenshotTranslatorProps) {
  const [screenshotDataUrl, setScreenshotDataUrl] = useState('')
  const [ocrLayoutData, setOcrLayoutData] = useState<OCRLayoutResult | null>(null)
  const [translatedLines, setTranslatedLines] = useState<string[]>([])
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrStatus, setOcrStatus] = useState('等待截图')
  const [translationStatus, setTranslationStatus] = useState('等待翻译')
  const [error, setError] = useState<string | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const [isTranslating, setIsTranslating] = useState(false)
  const [showOverlay, setShowOverlay] = useState(true)
  const [copiedSection, setCopiedSection] = useState<'ocr' | 'translation' | null>(null)

  const overlayModel = useMemo(
    () => (ocrLayoutData ? buildOverlayRegions(ocrLayoutData) : null),
    [ocrLayoutData]
  )

  const extractedText = useMemo(
    () => sanitizeText(ocrLayoutData?.text || '').replace(/\n{3,}/g, '\n\n').trim(),
    [ocrLayoutData]
  )

  const translationText = useMemo(() => {
    const sourceRegions = normalizeRegionTexts(overlayModel)
    if (translatedLines.length === 0 || sourceRegions.length === 0) return ''

    return translatedLines
      .map((line, index) => sanitizeText(line || sourceRegions[index] || '').trim())
      .filter(Boolean)
      .join('\n')
  }, [overlayModel, translatedLines])

  const fittedRegions = useMemo(() => {
    if (!overlayModel || translatedLines.length === 0) return []

    return overlayModel.translationRegions.map((region, index) => ({
      region,
      fitted: fitTranslatedRegionText(region, translatedLines[index] || region.text, {
        minFontSize: 11,
        maxFontSize: 30,
      }),
    }))
  }, [overlayModel, translatedLines])

  const copyText = useCallback(async (text: string, section: 'ocr' | 'translation') => {
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedSection(section)
      window.setTimeout(() => setCopiedSection((current) => (current === section ? null : current)), 1600)
    } catch {
      setError('复制失败，请稍后重试。')
    }
  }, [])

  const runTranslation = useCallback(async (layoutOverride?: OCRLayoutResult) => {
    const layout = layoutOverride || ocrLayoutData
    if (!layout) {
      setError('请先完成截图识别。')
      return
    }

    const model = buildOverlayRegions(layout)
    const sourceRegions = normalizeRegionTexts(model)
    if (sourceRegions.length === 0) {
      setError('没有识别到可翻译的文本区域。')
      return
    }

    setIsTranslating(true)
    setError(null)
    setTranslationStatus(`正在翻译 ${sourceRegions.length} 个区域...`)

    try {
      const batchResult = await translateBatch(sourceRegions, targetLang)
      const safeLines = batchResult.lines.map((line, index) => {
        const fallback = sourceRegions[index] || ''
        return sanitizeText(line || fallback).trim() || fallback
      })
      setTranslatedLines(safeLines)
      setTranslationStatus(buildTranslationStatus(batchResult, sourceRegions.length, targetLang))
    } catch (translationError) {
      setError(translationError instanceof Error ? translationError.message : 'AI 翻译失败')
      setTranslationStatus('翻译失败')
    } finally {
      setIsTranslating(false)
    }
  }, [ocrLayoutData, targetLang])

  const runOCR = useCallback(async (dataUrl?: string, autoTranslate = false) => {
    const imageDataUrl = dataUrl || screenshotDataUrl
    if (!imageDataUrl) {
      setError('请先截图。')
      return
    }

    setIsExtracting(true)
    setError(null)
    setTranslatedLines([])
    setOcrProgress(0)
    setOcrStatus('正在准备 OCR...')

    let session: Awaited<ReturnType<typeof createOCRSession>> | null = null

    try {
      const canvas = await loadImageToCanvas(imageDataUrl)
      session = await createOCRSession(SCREENSHOT_OCR_LANG, (update) => {
        setOcrProgress(update.progress ?? 0)
        setOcrStatus(update.statusText || '正在识别截图...')
      })

      const layout = await recognizeCanvasWithLayout(canvas, session)
      const cleanText = sanitizeText(layout.text).trim()
      setOcrLayoutData(layout)
      setOcrStatus(`识别完成 · ${layout.lines.length} 行 / ${cleanText.length} 字`)

      if (autoTranslate) {
        await runTranslation(layout)
      }
    } catch (ocrError) {
      setError(ocrError instanceof Error ? ocrError.message : '截图识别失败')
      setOcrStatus('识别失败')
    } finally {
      if (session) {
        await session.terminate().catch(() => {})
      }
      setIsExtracting(false)
    }
  }, [runTranslation, screenshotDataUrl])

  const handleCapture = useCallback(async () => {
    if (!window.electronShell?.captureScreenshot) {
      setError('当前环境不支持截图翻译。')
      return
    }

    setIsCapturing(true)
    setError(null)
    setScreenshotDataUrl('')
    setOcrLayoutData(null)
    setTranslatedLines([])
    setOcrProgress(0)
    setOcrStatus('等待截图')
    setTranslationStatus('等待翻译')

    try {
      const captureResult = await window.electronShell.captureScreenshot()
      if (!captureResult?.dataUrl) {
        setOcrStatus('已取消截图')
        return
      }

      setScreenshotDataUrl(captureResult.dataUrl)
      setOcrStatus('截图完成，开始识别...')
      await runOCR(captureResult.dataUrl, true)
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : '截图失败')
      setOcrStatus('截图失败')
    } finally {
      setIsCapturing(false)
    }
  }, [runOCR])

  if (!isDesktopScreenshotSupported()) return null

  return (
    <section
      className="mx-5 mb-4 rounded-[28px] border border-[#ffd9ef] bg-[linear-gradient(180deg,rgba(255,251,245,0.96),rgba(255,255,255,0.98))] p-4 shadow-[0_28px_60px_rgba(255,132,0,0.10)]"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-primary)]">
            Desktop Capture
          </p>
          <h2 className="mt-1 text-[18px] font-bold text-[var(--color-foreground)]">
            截图翻译
          </h2>
          <p className="mt-1 max-w-[720px] text-[13px] leading-6 text-[var(--color-muted)]">
            调用 macOS 系统选区截图，自动提取文字并翻译为 {targetLang}。适合看图、对话框、扫描件和无法复制的页面。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCapture}
            disabled={isCapturing || isExtracting || isTranslating}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-4 py-2 text-[13px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {isCapturing ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            选择截图区域
          </button>
          <button
            type="button"
            onClick={() => void runOCR(undefined, false)}
            disabled={!screenshotDataUrl || isExtracting}
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[var(--color-foreground)] ring-1 ring-[var(--color-border)] transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {isExtracting ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
            提取文字
          </button>
          <button
            type="button"
            onClick={() => void runTranslation()}
            disabled={!ocrLayoutData || isTranslating}
            className="inline-flex items-center gap-2 rounded-full bg-[#fff5fd] px-4 py-2 text-[13px] font-semibold text-[var(--color-primary)] ring-1 ring-[#ffd7ef] transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {isTranslating ? <Loader2 size={16} className="animate-spin" /> : <Languages size={16} />}
            AI 翻译
          </button>
          <button
            type="button"
            onClick={() => setShowOverlay((value) => !value)}
            disabled={!screenshotDataUrl}
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[var(--color-foreground)] ring-1 ring-[var(--color-border)] transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {showOverlay ? <Eye size={16} /> : <EyeOff size={16} />}
            {showOverlay ? '隐藏译文覆盖' : '显示译文覆盖'}
          </button>
        </div>
      </div>

      {(isCapturing || isExtracting || isTranslating || screenshotDataUrl) && (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-[#fffdfa]">
            {screenshotDataUrl ? (
              <div className="relative">
                <img
                  src={screenshotDataUrl}
                  alt="截图预览"
                  className="block h-auto w-full"
                />

                {showOverlay && overlayModel && translatedLines.length > 0 && (
                  <svg
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    viewBox={`0 0 ${overlayModel.imageWidth} ${overlayModel.imageHeight}`}
                    preserveAspectRatio="xMidYMid meet"
                  >
                    {fittedRegions.map(({ region, fitted }) => (
                      <g key={region.id}>
                        <rect
                          x={fitted.left}
                          y={region.bbox.y0}
                          width={fitted.width}
                          height={fitted.height}
                          rx={Math.max(6, fitted.fontSize * 0.4)}
                          fill="rgba(255,250,244,0.96)"
                          stroke="rgba(255,124,0,0.28)"
                          strokeWidth={1.5}
                        />
                        <text
                          x={fitted.left + fitted.paddingX}
                          y={region.bbox.y0 + fitted.paddingY + fitted.fontSize}
                          fontSize={fitted.fontSize}
                          fill="#1f1720"
                          fontWeight="600"
                        >
                          {fitted.lines.map((line, lineIndex) => (
                            <tspan
                              key={`${region.id}-${lineIndex}`}
                              x={fitted.left + fitted.paddingX}
                              dy={lineIndex === 0 ? 0 : fitted.lineHeight}
                            >
                              {line}
                            </tspan>
                          ))}
                        </text>
                      </g>
                    ))}
                  </svg>
                )}

                <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-[rgba(31,23,32,0.78)] px-3 py-1 text-[11px] font-semibold text-white">
                    OCR：{ocrStatus}
                  </span>
                  <span className="rounded-full bg-[rgba(255,132,0,0.84)] px-3 py-1 text-[11px] font-semibold text-white">
                    翻译：{translationStatus}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                <Camera size={28} className="text-[var(--color-primary)]" />
                <div>
                  <p className="text-[15px] font-semibold text-[var(--color-foreground)]">
                    还没有截图
                  </p>
                  <p className="mt-1 text-[13px] text-[var(--color-muted)]">
                    点击“选择截图区域”，框选要翻译的屏幕内容。
                  </p>
                </div>
              </div>
            )}

            {(isExtracting || ocrProgress > 0) && (
              <div className="border-t border-[var(--color-border)] px-4 py-3">
                <div className="h-2 overflow-hidden rounded-full bg-[var(--color-background-secondary)]">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#FF8400,#FF4FA2)] transition-all duration-300"
                    style={{ width: `${Math.max(6, ocrProgress)}%` }}
                  />
                </div>
                <p className="mt-2 text-[12px] text-[var(--color-muted)]">
                  OCR 进度 {Math.max(0, Math.min(100, Math.round(ocrProgress)))}%
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-4 shadow-[0_20px_40px_rgba(15,23,42,0.06)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                    OCR Text
                  </p>
                  <h3 className="mt-1 text-[16px] font-bold text-[var(--color-foreground)]">
                    提取文本
                  </h3>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onUseExtractedText(extractedText)}
                    disabled={!extractedText}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary-light)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-primary)] disabled:opacity-50"
                  >
                    <FileText size={14} />
                    放入文本翻译
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyText(extractedText, 'ocr')}
                    disabled={!extractedText}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--color-background-secondary)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-foreground)] disabled:opacity-50"
                  >
                    {copiedSection === 'ocr' ? <Check size={14} className="text-[var(--color-success)]" /> : <Copy size={14} />}
                    复制
                  </button>
                </div>
              </div>
              <pre className="max-h-[220px] overflow-y-auto whitespace-pre-wrap rounded-[18px] bg-[var(--color-background-secondary)] px-4 py-3 text-[13px] leading-6 text-[var(--color-foreground)]">
                {extractedText || '截图后会在这里显示 OCR 提取结果。'}
              </pre>
            </div>

            <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-4 shadow-[0_20px_40px_rgba(15,23,42,0.06)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#ff4fa2]">
                    AI Translation
                  </p>
                  <h3 className="mt-1 text-[16px] font-bold text-[var(--color-foreground)]">
                    译文输出
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => void copyText(translationText, 'translation')}
                  disabled={!translationText}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--color-background-secondary)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-foreground)] disabled:opacity-50"
                >
                  {copiedSection === 'translation' ? <Check size={14} className="text-[var(--color-success)]" /> : <Copy size={14} />}
                  复制
                </button>
              </div>
              <pre className="max-h-[220px] overflow-y-auto whitespace-pre-wrap rounded-[18px] bg-[linear-gradient(180deg,#FFF7FC,#FFFDFE)] px-4 py-3 text-[13px] leading-6 text-[var(--color-foreground)]">
                {translationText || '完成 OCR 后，点击“AI 翻译”会在这里显示区域级翻译结果。'}
              </pre>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-[18px] bg-[rgba(255,90,96,0.08)] px-4 py-3 text-[13px] text-[#d82f4e]">
          {error}
        </div>
      )}
    </section>
  )
}
