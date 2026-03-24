import { useCallback, useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  Camera,
  Check,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Keyboard,
  Languages,
  Loader2,
  RefreshCcw,
} from 'lucide-react'
import { useVocabulary } from '../../hooks/useVocabulary'
import {
  buildOverlayRegions,
  createOCRSession,
  fitTranslatedRegionText,
  recognizeCanvasWithLayout,
  type OverlayModel,
} from '../../lib/ocr'
import { sanitizeText, type OCRLayoutResult } from '../../lib/pdf'
import {
  analyzeUnfamiliarWords,
  translateBatch,
  type BatchTranslationResult,
  type UnfamiliarWord,
} from '../../services/gemini'

const SCREENSHOT_OCR_LANG = 'eng+chi_sim'
const DESKTOP_SCREENSHOT_SHORTCUT_PLACEHOLDER = 'CommandOrControl+Shift+2'

interface DesktopScreenshotSettings {
  shortcut: string
  autoCopyText: boolean
  previewMode: 'side' | 'cover'
  smartWordsEnabled: boolean
  shortcutRegistered: boolean
}

const DEFAULT_DESKTOP_SCREENSHOT_SETTINGS: DesktopScreenshotSettings = {
  shortcut: DESKTOP_SCREENSHOT_SHORTCUT_PLACEHOLDER,
  autoCopyText: false,
  previewMode: 'side',
  smartWordsEnabled: true,
  shortcutRegistered: false,
}

const OVERLAY_TARGET_LANGUAGE_OPTIONS = ['简体中文', '繁體中文', 'English', '日本語'] as const

function formatOverlayLanguageLabel(targetLang: string) {
  return `英语 → ${targetLang === '简体中文' ? '中文(简)' : targetLang === '繁體中文' ? '中文(繁)' : targetLang}`
}

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

function formatShortcutFromEvent(event: ReactKeyboardEvent<HTMLInputElement>) {
  const modifiers: string[] = []
  if (event.metaKey) modifiers.push('CommandOrControl')
  else if (event.ctrlKey) modifiers.push('CommandOrControl')
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey) modifiers.push('Shift')

  const rawKey = event.key
  if (!rawKey) return ''

  const key = rawKey.length === 1
    ? rawKey.toUpperCase()
    : ({
        ' ': 'Space',
        ArrowUp: 'Up',
        ArrowDown: 'Down',
        ArrowLeft: 'Left',
        ArrowRight: 'Right',
      }[rawKey] || rawKey)

  const ignored = new Set(['Meta', 'Control', 'Alt', 'Shift', 'CapsLock', 'Tab'])
  const parts = [...modifiers]
  if (!ignored.has(key)) {
    parts.push(key)
  }

  return parts.join('+')
}

interface DesktopScreenshotTranslatorProps {
  targetLang: string
  onUseExtractedText: (text: string) => void
  onTargetLangChange?: (targetLang: string) => void
}

export default function DesktopScreenshotTranslator({
  targetLang,
  onUseExtractedText,
  onTargetLangChange,
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
  const [settings, setSettings] = useState<DesktopScreenshotSettings>(DEFAULT_DESKTOP_SCREENSHOT_SETTINGS)
  const [shortcutDraft, setShortcutDraft] = useState(DEFAULT_DESKTOP_SCREENSHOT_SETTINGS.shortcut)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [captureAnchorPoint, setCaptureAnchorPoint] = useState<{ x: number; y: number } | null>(null)
  const [captureSelectionRect, setCaptureSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [activeTargetLang, setActiveTargetLang] = useState(targetLang)
  const { addWords } = useVocabulary()

  const isPopupPreview = settings.previewMode === 'side'

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

  const numberedRegions = useMemo(() => {
    if (!overlayModel) return []

    return overlayModel.translationRegions.map((region, index) => ({
      id: region.id,
      index,
      orderLabel: `${index + 1}`,
      text: sanitizeText(translatedLines[index] || region.text || '').trim() || `区域 ${index + 1}`,
      sourceText: sanitizeText(region.text || '').trim(),
      topPercent: Math.max(0, Math.min(96, ((region.bbox.y0 + region.bbox.y1) / 2 / overlayModel.imageHeight) * 100)),
      badgeX: region.bbox.x1 - 14,
      badgeY: region.bbox.y0 + 14,
    }))
  }, [overlayModel, translatedLines])

  useEffect(() => {
    setActiveTargetLang(targetLang)
  }, [targetLang])

  useEffect(() => {
    let cancelled = false

    async function syncSettings() {
      const loaded = await window.electronShell?.getDesktopScreenshotSettings?.()
      if (!loaded || cancelled) return
      setSettings(loaded)
      setShortcutDraft(loaded.shortcut)
    }

    void syncSettings()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (settings.previewMode === 'cover') {
      void window.electronShell?.hideDesktopTranslationOverlay?.()
    }
  }, [settings.previewMode])

  const copyText = useCallback(async (text: string, section: 'ocr' | 'translation') => {
    if (!text.trim()) return
    try {
      if (window.electronShell?.writeClipboardText) {
        await window.electronShell.writeClipboardText(text)
      } else {
        await navigator.clipboard.writeText(text)
      }
      setCopiedSection(section)
      window.setTimeout(() => setCopiedSection((current) => (current === section ? null : current)), 1600)
    } catch {
      setError('复制失败，请稍后重试。')
    }
  }, [])

  const saveDesktopSettings = useCallback(async (partial: Partial<DesktopScreenshotSettings>) => {
    if (!window.electronShell?.updateDesktopScreenshotSettings) return

    setIsSavingSettings(true)
    setError(null)

    try {
      const next = await window.electronShell.updateDesktopScreenshotSettings(partial)
      setSettings(next)
      setShortcutDraft(next.shortcut)
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : '保存桌面截图设置失败')
    } finally {
      setIsSavingSettings(false)
    }
  }, [])

  const runTranslation = useCallback(async (layoutOverride?: OCRLayoutResult, targetLangOverride?: string) => {
    const layout = layoutOverride || ocrLayoutData
    if (!layout) {
      setError('请先完成截图识别。')
      return
    }
    const nextTargetLang = targetLangOverride || activeTargetLang

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
      const batchResult = await translateBatch(sourceRegions, nextTargetLang)
      const safeLines = batchResult.lines.map((line, index) => {
        const fallback = sourceRegions[index] || ''
        return sanitizeText(line || fallback).trim() || fallback
      })
      const combinedSourceText = sourceRegions.join(' ').trim()
      const nextLearningWords: UnfamiliarWord[] = settings.smartWordsEnabled && combinedSourceText
        ? await analyzeUnfamiliarWords(combinedSourceText, 5).catch(() => [])
        : []
      setTranslatedLines(safeLines)
      let nextStatus = buildTranslationStatus(batchResult, sourceRegions.length, nextTargetLang)

      if (isPopupPreview && window.electronShell?.showDesktopTranslationOverlay) {
        await window.electronShell.showDesktopTranslationOverlay({
          targetLang: nextTargetLang,
          ocrText: combinedSourceText,
          translatedText: safeLines.join('\n').trim(),
          words: nextLearningWords.map((item) => ({
            word: sanitizeText(item.word || '').trim(),
            meaning: sanitizeText(item.meaning || '').trim(),
          })).filter((item) => item.word && item.meaning).slice(0, 5),
          statusLabel: 'OCR 已完成',
          languageLabel: formatOverlayLanguageLabel(nextTargetLang),
          smartWordsEnabled: settings.smartWordsEnabled,
          anchorPoint: captureAnchorPoint || undefined,
          selectionRect: captureSelectionRect || undefined,
        })
        nextStatus += ' · 已在桌面旁侧弹出译文'
      }

      void window.electronShell?.hideCaptureIndicator?.()
      setTranslationStatus(nextStatus)
    } catch (translationError) {
      setError(translationError instanceof Error ? translationError.message : 'AI 翻译失败')
      setTranslationStatus('翻译失败')
      void window.electronShell?.hideCaptureIndicator?.()
    } finally {
      setIsTranslating(false)
    }
  }, [activeTargetLang, captureAnchorPoint, captureSelectionRect, isPopupPreview, ocrLayoutData, settings.smartWordsEnabled])

  useEffect(() => {
    const unsubscribeSettings = window.electronShell?.onScreenshotSettingsUpdated?.((next) => {
      setSettings(next)
      setShortcutDraft(next.shortcut)
    })

    const unsubscribeCollect = window.electronShell?.onCollectOverlayWords?.(async (words) => {
      const payload = Array.isArray(words) ? words : []
      if (!payload.length) return
      const result = await addWords(
        payload.map((item) => ({
          word: item.word,
          meaning: item.meaning,
          example_sentence: extractedText || undefined,
          source: 'translate',
        }))
      )

      if (result.error) {
        setError(result.error)
        return
      }

      setTranslationStatus(`已收录 ${payload.length} 个陌生词汇`)
    })

    const unsubscribeOverlayTargetLanguage = window.electronShell?.onOverlayTargetLanguageChange?.((nextTargetLang) => {
      const safeNextLang = String(nextTargetLang || '').trim()
      if (!safeNextLang) return

      const resolvedTargetLang = OVERLAY_TARGET_LANGUAGE_OPTIONS.includes(
        safeNextLang as (typeof OVERLAY_TARGET_LANGUAGE_OPTIONS)[number]
      )
        ? safeNextLang
        : '简体中文'

      setActiveTargetLang(resolvedTargetLang)
      onTargetLangChange?.(resolvedTargetLang)

      if (ocrLayoutData) {
        void runTranslation(ocrLayoutData, resolvedTargetLang)
      }
    })

    return () => {
      unsubscribeSettings?.()
      unsubscribeCollect?.()
      unsubscribeOverlayTargetLanguage?.()
    }
  }, [addWords, extractedText, ocrLayoutData, onTargetLangChange, runTranslation])

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
        if (captureSelectionRect) {
          const percent = typeof update.progress === 'number' ? Math.round(update.progress * 100) : null
          void window.electronShell?.showCaptureIndicator?.({
            selectionRect: captureSelectionRect,
            status: percent ? `OCR 识别中 ${percent}%` : (update.statusText || 'OCR 识别中…'),
          })
        }
      })

      const layout = await recognizeCanvasWithLayout(canvas, session)
      const cleanText = sanitizeText(layout.text).trim()
      setOcrLayoutData(layout)
      if (settings.autoCopyText && cleanText) {
        if (window.electronShell?.writeClipboardText) {
          await window.electronShell.writeClipboardText(cleanText)
        } else {
          await navigator.clipboard.writeText(cleanText)
        }
        setOcrStatus(`识别完成 · ${layout.lines.length} 行 / ${cleanText.length} 字 · 已复制到剪贴板`)
      } else {
        setOcrStatus(`识别完成 · ${layout.lines.length} 行 / ${cleanText.length} 字`)
      }

      if (autoTranslate) {
        if (captureSelectionRect) {
          void window.electronShell?.showCaptureIndicator?.({
            selectionRect: captureSelectionRect,
            status: '翻译中…',
          })
        }
        await runTranslation(layout)
      }
    } catch (ocrError) {
      setError(ocrError instanceof Error ? ocrError.message : '截图识别失败')
      setOcrStatus('识别失败')
      void window.electronShell?.hideCaptureIndicator?.()
    } finally {
      if (session) {
        await session.terminate().catch(() => {})
      }
      setIsExtracting(false)
    }
  }, [captureSelectionRect, runTranslation, screenshotDataUrl, settings.autoCopyText])

  const handleCapture = useCallback(async () => {
    if (!window.electronShell?.captureScreenshot) {
      setError('当前环境不支持截图翻译。')
      return
    }

    setIsCapturing(true)
    setError(null)
    void window.electronShell?.hideDesktopTranslationOverlay?.()
    setScreenshotDataUrl('')
    setCaptureAnchorPoint(null)
    setCaptureSelectionRect(null)
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
      setCaptureAnchorPoint(captureResult.anchorPoint || null)
      setCaptureSelectionRect(captureResult.selectionRect || null)
      setOcrStatus('截图完成，开始识别...')
      if (captureResult.selectionRect) {
        void window.electronShell?.showCaptureIndicator?.({
          selectionRect: captureResult.selectionRect,
          status: 'OCR 识别中…',
        })
      }
      await runOCR(captureResult.dataUrl, true)
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : '截图失败')
      setOcrStatus('截图失败')
      void window.electronShell?.hideCaptureIndicator?.()
    } finally {
      setIsCapturing(false)
    }
  }, [runOCR])

  useEffect(() => {
    const unsubscribe = window.electronShell?.onScreenshotShortcut?.(() => {
      void handleCapture()
    })

    return () => {
      unsubscribe?.()
    }
  }, [handleCapture])

  if (!isDesktopScreenshotSupported()) return null

  return (
    <section
      className="mx-5 mb-4 rounded-[28px] border border-[#ffd9ef] bg-[linear-gradient(180deg,rgba(255,251,245,0.96),rgba(255,255,255,0.98))] p-4 shadow-[0_28px_60px_rgba(255,132,0,0.10)]"
    >
      <div className="mb-4 rounded-[24px] border border-[#ffe6f4] bg-white/80 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-[720px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-primary)]">
              Capture Settings
            </p>
            <h3 className="mt-1 text-[16px] font-bold text-[var(--color-foreground)]">
              截图翻译设置
            </h3>
            <p className="mt-1 text-[13px] leading-6 text-[var(--color-muted)]">
              设置全局截图快捷键、译文显示方式，以及 OCR 完成后是否自动把提取文本放进剪贴板。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void saveDesktopSettings({ previewMode: 'side' })}
              disabled={isSavingSettings}
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-semibold transition-transform active:scale-[0.98] ${
                settings.previewMode === 'side'
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-white text-[var(--color-foreground)] ring-1 ring-[var(--color-border)]'
              }`}
            >
              <FileText size={14} />
              桌面弹窗
            </button>
            <button
              type="button"
              onClick={() => void saveDesktopSettings({ previewMode: 'cover' })}
              disabled={isSavingSettings}
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-semibold transition-transform active:scale-[0.98] ${
                settings.previewMode === 'cover'
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-white text-[var(--color-foreground)] ring-1 ring-[var(--color-border)]'
              }`}
            >
              <Eye size={14} />
              覆盖译文
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px_220px]">
          <label className="rounded-[18px] bg-[var(--color-background-secondary)] px-4 py-3">
            <span className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
              <Keyboard size={14} />
              快捷键
            </span>
            <input
              value={shortcutDraft}
              onChange={(event) => setShortcutDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Backspace' || event.key === 'Delete') {
                  event.preventDefault()
                  setShortcutDraft('')
                  return
                }

                const nextShortcut = formatShortcutFromEvent(event)
                if (!nextShortcut) return

                event.preventDefault()
                setShortcutDraft(nextShortcut)
              }}
              placeholder={DESKTOP_SCREENSHOT_SHORTCUT_PLACEHOLDER}
              className="w-full rounded-[14px] border border-[var(--color-border)] bg-white px-3 py-2 text-[13px] font-medium text-[var(--color-foreground)] outline-none"
            />
            <p className="mt-2 text-[11px] leading-5 text-[var(--color-muted)]">
              聚焦后直接按下你想绑定的组合键，例如：<code>CommandOrControl+Shift+2</code>
            </p>
          </label>

          <div className="rounded-[18px] bg-[var(--color-background-secondary)] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                  OCR 剪贴板
                </p>
                <p className="mt-2 text-[13px] leading-6 text-[var(--color-foreground)]">
                  识别完成后自动复制提取文本
                </p>
              </div>
              <button
                type="button"
                onClick={() => void saveDesktopSettings({ autoCopyText: !settings.autoCopyText })}
                disabled={isSavingSettings}
                className={`relative mt-1 h-7 w-12 rounded-full transition ${
                  settings.autoCopyText ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                    settings.autoCopyText ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="rounded-[18px] bg-[var(--color-background-secondary)] px-4 py-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
              快捷键状态
            </p>
            <p className="mt-2 text-[13px] leading-6 text-[var(--color-foreground)]">
              {settings.shortcutRegistered ? '已注册全局快捷键' : '当前快捷键未注册'}
            </p>
            <button
              type="button"
              onClick={() => void saveDesktopSettings({ shortcut: shortcutDraft.trim() })}
              disabled={isSavingSettings || !shortcutDraft.trim()}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-[12px] font-semibold text-[var(--color-foreground)] ring-1 ring-[var(--color-border)] disabled:opacity-50"
            >
              {isSavingSettings ? <Loader2 size={14} className="animate-spin" /> : <Keyboard size={14} />}
              应用快捷键
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-primary)]">
            Desktop Capture
          </p>
          <h2 className="mt-1 text-[18px] font-bold text-[var(--color-foreground)]">
            截图翻译
          </h2>
          <p className="mt-1 max-w-[720px] text-[13px] leading-6 text-[var(--color-muted)]">
            调用 macOS 系统选区截图，自动提取文字并翻译为 {targetLang}。适合看图、对话框、扫描件和无法复制的页面；桌面弹窗模式会把译文直接贴到截图区域旁边。
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
            选择截图区域{settings.shortcut ? ` · ${settings.shortcut}` : ''}
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
            disabled={!screenshotDataUrl || isPopupPreview}
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[var(--color-foreground)] ring-1 ring-[var(--color-border)] transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {showOverlay ? <Eye size={16} /> : <EyeOff size={16} />}
            {isPopupPreview ? '桌面弹窗中' : showOverlay ? '隐藏译文覆盖' : '显示译文覆盖'}
          </button>
        </div>
      </div>

      {(isCapturing || isExtracting || isTranslating || screenshotDataUrl) && (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-[#fffdfa]">
            {screenshotDataUrl ? (
              <div className={isPopupPreview && numberedRegions.length > 0 ? 'grid gap-0 lg:grid-cols-[minmax(0,1fr)_280px]' : 'relative'}>
                <div className="relative">
                  <img
                    src={screenshotDataUrl}
                    alt="截图预览"
                    className="block h-auto w-full"
                  />

                  {overlayModel && translatedLines.length > 0 && (
                    <svg
                      className="pointer-events-none absolute inset-0 h-full w-full"
                      viewBox={`0 0 ${overlayModel.imageWidth} ${overlayModel.imageHeight}`}
                      preserveAspectRatio="xMidYMid meet"
                    >
                      {isPopupPreview
                        ? numberedRegions.map((item) => (
                            <g key={item.id}>
                              <rect
                                x={overlayModel.translationRegions[item.index].bbox.x0}
                                y={overlayModel.translationRegions[item.index].bbox.y0}
                                width={overlayModel.translationRegions[item.index].bbox.x1 - overlayModel.translationRegions[item.index].bbox.x0}
                                height={overlayModel.translationRegions[item.index].bbox.y1 - overlayModel.translationRegions[item.index].bbox.y0}
                                rx={8}
                                fill="rgba(255,132,0,0.06)"
                                stroke="rgba(255,132,0,0.55)"
                                strokeWidth={2}
                                strokeDasharray="8 6"
                              />
                              <circle
                                cx={item.badgeX}
                                cy={item.badgeY}
                                r={17}
                                fill="rgba(255,132,0,0.92)"
                              />
                              <text
                                x={item.badgeX}
                                y={item.badgeY + 5}
                                textAnchor="middle"
                                fontSize={16}
                                fill="#ffffff"
                                fontWeight="700"
                              >
                                {item.orderLabel}
                              </text>
                            </g>
                          ))
                        : showOverlay && fittedRegions.map(({ region, fitted }) => (
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

                {isPopupPreview && numberedRegions.length > 0 && (
                  <aside className="border-t border-[var(--color-border)] bg-[linear-gradient(180deg,#fff8f2,#fffdfb)] p-3 lg:border-l lg:border-t-0">
                    <div className="mb-3 flex items-center gap-2">
                      <FileText size={16} className="text-[var(--color-primary)]" />
                      <p className="text-[13px] font-semibold text-[var(--color-foreground)]">
                        桌面弹窗预览
                      </p>
                    </div>
                    <div className="max-h-[640px] space-y-2 overflow-y-auto pr-1">
                      {numberedRegions.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-[16px] border border-[#ffd9ef] bg-white px-3 py-3 shadow-[0_12px_24px_rgba(255,132,0,0.08)]"
                        >
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--color-primary)] px-1.5 text-[11px] font-bold text-white">
                              {item.orderLabel}
                            </span>
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold leading-6 text-[var(--color-foreground)]">
                                {item.text}
                              </p>
                              {item.sourceText && (
                                <p className="mt-1 text-[11px] leading-5 text-[var(--color-muted)]">
                                  {item.sourceText}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </aside>
                )}
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
