if (!window.__LINSWIFT_CONTENT_SCRIPT__) {
  window.__LINSWIFT_CONTENT_SCRIPT__ = true

  const HIGHLIGHT_CLASS = 'linswift-word-highlight'
  const SELECTION_HIGHLIGHT_CLASS = 'linswift-selection-highlight'
  const SELECTION_HIGHLIGHT_OVERLAY_CLASS = 'linswift-selection-highlight-overlay'
  const SELECTION_HIGHLIGHT_ANCHOR_CLASS = 'linswift-selection-highlight-anchor'
  const PANEL_STYLE_ID = 'linswift-floating-style'
  const PANEL_ROOT_ID = 'linswift-floating-root'
  const PANEL_POSITION_STORAGE_KEY = 'linswift_floating_position_v2'
  const SETTINGS_STORAGE_KEY = 'linswift_extension_settings'
  const KNOWN_WORDS_STORAGE_KEY = 'linswift_known_words'
  const SAVED_WORDS_STORAGE_KEY = 'linswift_saved_words'
  const YOUTUBE_PAGE_BRIDGE_ID = 'linswift-youtube-page-bridge'
  const YOUTUBE_PAGE_BRIDGE_REQUEST_TYPE = 'linswift-youtube-page-request'
  const YOUTUBE_PAGE_BRIDGE_RESPONSE_TYPE = 'linswift-youtube-page-response'
  const YOUTUBE_PAGE_BRIDGE_RESPONSE_SOURCE = 'linswift-youtube-page-bridge'
  const highlightRecords = []
  const inlineAnnotationRecords = []
  const INLINE_ANNOTATION_LIMIT = 60
  const INLINE_TOOLTIP_HIDE_DELAY = 160
  const YOUTUBE_POLL_INTERVAL = 900
  const YOUTUBE_SUBTITLE_HISTORY_LIMIT = 180
  const YOUTUBE_MIN_SEGMENTS_FOR_SCAN = 3
  const YOUTUBE_TRANSLATION_BATCH_SIZE = 48
  const YOUTUBE_CUE_TIME_PADDING_MS = 220
  const YOUTUBE_CUE_PERSIST_MS = 1400
  const YOUTUBE_DEFAULT_CUE_DURATION_MS = 2600
  const YOUTUBE_PAGE_BRIDGE_TIMEOUT_MS = 12000
  const RUNTIME_MESSAGE_TIMEOUT_MS = 15000
  const SENTENCE_SELECTION_MAX_CHARS = 2400
  const TRANSLATION_LANGUAGE_OPTIONS = {
    'zh-CN': '简中',
    'zh-TW': '繁中',
    en: 'English',
    ja: '日本語',
    ko: '한국어',
  }
  const TRANSLATION_MODE_OPTIONS = {
    hybrid: '混合模式',
    deepl: 'DeepL',
    ai: 'AI',
  }
  const PRONUNCIATION_VARIANT_OPTIONS = {
    both: '音标展示 · 英 / 美',
    uk: '默认发音 · 英式',
    us: '默认发音 · 美式',
  }
  const UI_SCALE_STEPS = [
    { value: 0.48, scale: 0.88, label: '超紧凑' },
    { value: 0.56, scale: 0.94, label: '紧凑' },
    { value: 0.72, scale: 1, label: '标准' },
    { value: 0.88, scale: 1.08, label: '舒展' },
    { value: 1.04, scale: 1.14, label: '宽松' },
  ]
  const YOUTUBE_SUBTITLE_MODE_OPTIONS = {
    original: '原文',
    bilingual: '双语',
    vocab: '生词',
  }

  const panelState = {
    initialized: false,
    minimized: false,
    hidden: true,
    activePage: 'translate',
    sentenceDraft: null,
    showingSaved: false,
    loading: false,
    auth: {
      isAuthenticated: false,
      email: '',
      userId: '',
      expiresAt: null,
    },
    extensionState: {
      settings: {
        level: 'intermediate',
        maxResults: 18,
        inlineTranslateEnabled: false,
        autoTranslateOnLoad: true,
        translationLanguage: 'zh-CN',
        translationMode: 'ai',
        pronunciationVariant: 'both',
        disabledAutoTranslateHosts: [],
        youtubeSubtitleMode: 'vocab',
        sentenceSmartVocabEnabled: true,
        uiScale: 0.72,
      },
      knownWords: [],
      savedWords: {},
    },
    lastAnalysis: null,
    youtube: {
      enabled: false,
      videoId: '',
      title: '',
      channel: '',
      duration: 0,
      subtitleReady: false,
      captionsEnabled: false,
      subtitleLanguage: '',
      transcriptTrackKey: '',
      transcriptProvider: '',
      transcriptStatus: 'idle',
      transcriptTranslationStatus: 'idle',
      transcriptCues: [],
      currentCue: {
        text: '',
        lines: [],
        at: 0,
      },
      cues: [],
      translations: {},
      translationUnavailable: false,
      translationProvider: '',
      translationNote: '',
      lastStatusKey: '',
    },
    study: {
      active: false,
      currentIndex: 0,
      isFlipped: false,
      results: [],
      cards: [],
      returnToMinimized: false,
    },
  }

  let refs = null
  const wordDetailCache = new Map()
  let selectionHighlightRecord = null
  let inlineTooltipHideTimer = null
  let activeInlineWord = ''
  let activeTooltipSource = ''
  let inlineTooltipPinned = false
  let sentencePopupAnchor = null
  let sentencePopupRange = null
  let sentencePopupRect = null
  let sentencePopupVisible = false
  let lastSelectionTooltipOpenedAt = 0
  let youtubePollTimer = null
  let youtubeBoundVideo = null
  let youtubeVideoSyncHandler = null
  let youtubePageBridgeRequestId = 0
  const youtubePageBridgePendingRequests = new Map()
  let youtubeTranslationRequestKey = ''
  let youtubeTranscriptRequestKey = ''
  let youtubeTranscriptTranslationRequestKey = ''
  let youtubeAutoCaptionRequestKey = ''
  let residentPanelBootstrapped = false
  let floatingPositionLoaded = false
  let floatingPositionState = null
  let pendingPanelSizeSaveTimer = null

  const PANEL_MIN_WIDTH = 340
  const PANEL_MAX_WIDTH = 520
  const PANEL_MIN_HEIGHT = 560
  const PANEL_MAX_HEIGHT = 920

  function shouldAutoOpenDemoPanel() {
    return document.querySelector('meta[name="linswift-demo-auto-open"][content="1"]') !== null
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max)
  }

  function getPanelResizeBounds() {
    const scale = getUiScale()
    const maxWidth = Math.min(PANEL_MAX_WIDTH, Math.floor((window.innerWidth - 24) / scale))
    const maxHeight = Math.min(PANEL_MAX_HEIGHT, Math.floor((window.innerHeight - 24) / scale))
    return {
      minWidth: Math.min(PANEL_MIN_WIDTH, maxWidth),
      maxWidth: Math.max(PANEL_MIN_WIDTH, maxWidth),
      minHeight: Math.min(PANEL_MIN_HEIGHT, maxHeight),
      maxHeight: Math.max(PANEL_MIN_HEIGHT, maxHeight),
    }
  }

  function getPanelSizeSettings() {
    const settings = panelState.extensionState?.settings || {}
    const bounds = getPanelResizeBounds()
    return {
      width: clamp(Number(settings.panelWidth) || 380, bounds.minWidth, bounds.maxWidth),
      height: clamp(Number(settings.panelHeight) || 760, bounds.minHeight, bounds.maxHeight),
    }
  }

  function applyPanelSize() {
    if (!refs?.panel) return
    const { width, height } = getPanelSizeSettings()
    const bounds = getPanelResizeBounds()
    const clampedWidth = clamp(width, bounds.minWidth, bounds.maxWidth)
    const clampedHeight = clamp(height, bounds.minHeight, bounds.maxHeight)
    refs.panel.style.width = `${clampedWidth}px`
    refs.panel.style.height = `${clampedHeight}px`
    refs.panel.style.maxHeight = `${clampedHeight}px`
  }

  async function persistPanelSize() {
    if (!panelState.extensionState?.settings) return
    const nextSettings = {
      ...panelState.extensionState.settings,
      panelWidth: Number(panelState.extensionState.settings.panelWidth) || 380,
      panelHeight: Number(panelState.extensionState.settings.panelHeight) || 760,
    }
    const response = await sendRuntimeMessage({
      type: 'panel-save-settings',
      settings: nextSettings,
    })
    panelState.extensionState.settings = response.settings
    applyPanelSize()
  }

  function schedulePersistPanelSize() {
    if (pendingPanelSizeSaveTimer) {
      clearTimeout(pendingPanelSizeSaveTimer)
    }
    pendingPanelSizeSaveTimer = window.setTimeout(() => {
      pendingPanelSizeSaveTimer = null
      void persistPanelSize()
    }, 180)
  }

  function getVisibleFloatingElement() {
    if (!refs) return null
    if (!panelState.minimized && !refs.panel.classList.contains('linswift-hidden')) {
      return refs.panel
    }
    if (!refs.bubble.classList.contains('linswift-hidden')) {
      return refs.bubble
    }
    return refs.panel
  }

  async function loadFloatingPosition() {
    if (floatingPositionLoaded) return floatingPositionState
    floatingPositionLoaded = true
    try {
      const stored = await chrome.storage.local.get([PANEL_POSITION_STORAGE_KEY])
      floatingPositionState = stored?.[PANEL_POSITION_STORAGE_KEY] || null
    } catch {
      floatingPositionState = null
    }
    return floatingPositionState
  }

  async function saveFloatingPosition(position) {
    floatingPositionState = position
    try {
      await chrome.storage.local.set({
        [PANEL_POSITION_STORAGE_KEY]: position,
      })
    } catch {}
  }

  function computeFloatingPositionForRect(rect, position) {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const width = Math.min(rect.width || 0, viewportWidth - 24)
    const height = Math.min(rect.height || 0, viewportHeight - 24)

    if (!position) {
      return {
        left: clamp(viewportWidth - width - 24, 12, Math.max(12, viewportWidth - width - 12)),
        top: clamp(viewportHeight - height - 24, 12, Math.max(12, viewportHeight - height - 12)),
      }
    }

    const anchorX = position.anchorX === 'left' ? 'left' : 'right'
    const anchorY = position.anchorY === 'top' ? 'top' : 'bottom'
    const offsetX = Math.max(12, Number(position.offsetX) || 24)
    const offsetY = Math.max(12, Number(position.offsetY) || 24)
    const unclampedLeft =
      anchorX === 'left' ? offsetX : viewportWidth - width - offsetX
    const unclampedTop =
      anchorY === 'top' ? offsetY : viewportHeight - height - offsetY

    return {
      left: clamp(unclampedLeft, 12, Math.max(12, viewportWidth - width - 12)),
      top: clamp(unclampedTop, 12, Math.max(12, viewportHeight - height - 12)),
    }
  }

  function applyFloatingPosition(position) {
    if (!refs?.root) return
    const target = getVisibleFloatingElement()
    if (!target) return
    const rect = target.getBoundingClientRect()
    const next = computeFloatingPositionForRect(rect, position)
    refs.root.style.left = `${next.left}px`
    refs.root.style.top = `${next.top}px`
    refs.root.style.right = 'auto'
    refs.root.style.bottom = 'auto'
  }

  function snapshotFloatingPosition() {
    const target = getVisibleFloatingElement()
    if (!target) return null
    const rect = target.getBoundingClientRect()
    const rightGap = Math.max(12, window.innerWidth - rect.right)
    const bottomGap = Math.max(12, window.innerHeight - rect.bottom)
    const leftGap = Math.max(12, rect.left)
    const topGap = Math.max(12, rect.top)

    return {
      anchorX: rightGap < leftGap ? 'right' : 'left',
      anchorY: bottomGap < topGap ? 'bottom' : 'top',
      offsetX: Math.round(rightGap < leftGap ? rightGap : leftGap),
      offsetY: Math.round(bottomGap < topGap ? bottomGap : topGap),
    }
  }

  async function persistCurrentFloatingPosition() {
    const position = snapshotFloatingPosition()
    if (!position) return
    await saveFloatingPosition(position)
  }

  function injectStyles() {
    if (document.getElementById(PANEL_STYLE_ID)) return

    const style = document.createElement('style')
    style.id = PANEL_STYLE_ID
    style.textContent = `
      .${HIGHLIGHT_CLASS} {
        background: linear-gradient(180deg, rgba(255, 132, 0, 0.22), rgba(255, 132, 0, 0.46));
        color: inherit;
        border-radius: 0.35em;
        box-shadow: 0 0 0 1px rgba(255, 132, 0, 0.18);
        padding: 0 0.08em;
      }

      .${SELECTION_HIGHLIGHT_CLASS} {
        display: inline;
        background: linear-gradient(180deg, rgba(255, 132, 0, 0.14), rgba(255, 132, 0, 0.28));
        border-bottom: 2px solid rgba(255, 132, 0, 0.82);
        box-shadow: inset 0 -1px 0 rgba(255, 132, 0, 0.16);
        border-radius: 0.32em;
        padding: 0 0.08em;
      }

      .${SELECTION_HIGHLIGHT_OVERLAY_CLASS} {
        position: fixed;
        z-index: 2147483000;
        pointer-events: none;
        background: linear-gradient(180deg, rgba(255, 132, 0, 0.14), rgba(255, 132, 0, 0.28));
        border-bottom: 2px solid rgba(255, 132, 0, 0.82);
        box-shadow: inset 0 -1px 0 rgba(255, 132, 0, 0.16);
        border-radius: 0.32em;
      }

      .${SELECTION_HIGHLIGHT_ANCHOR_CLASS} {
        position: fixed;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
        z-index: 2147483000;
      }

      .linswift-inline-annotation {
        ruby-position: under;
        ruby-align: center;
        line-height: 1.6;
        vertical-align: baseline;
        cursor: pointer;
      }

      .linswift-inline-word {
        display: inline;
        border-bottom: 2px solid rgba(255, 132, 0, 0.78);
        background: linear-gradient(180deg, rgba(255, 132, 0, 0.1), rgba(255, 132, 0, 0.24));
        border-radius: 0.32em;
        padding: 0 0.08em;
      }

      .linswift-inline-translation {
        display: ruby-text;
        color: #ff8400;
        font-size: 0.72em;
        line-height: 1.1;
        font-weight: 700;
        letter-spacing: 0.01em;
        user-select: none;
        padding-top: 2px;
        white-space: nowrap;
      }

      .linswift-inline-annotation:hover .linswift-inline-word,
      .linswift-inline-annotation[data-active="true"] .linswift-inline-word {
        background: linear-gradient(180deg, rgba(255, 132, 0, 0.18), rgba(255, 132, 0, 0.32));
        box-shadow: 0 0 0 1px rgba(255, 132, 0, 0.18);
      }

      .linswift-word-tooltip {
        position: fixed;
        width: min(320px, calc(100vw - 24px));
        padding: 14px;
        border-radius: 18px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.8), rgba(255, 247, 240, 0.72));
        border: 1px solid rgba(255, 255, 255, 0.34);
        box-shadow:
          0 24px 60px rgba(31, 26, 22, 0.22),
          0 8px 22px rgba(255, 132, 0, 0.12),
          inset 0 1px 0 rgba(255, 255, 255, 0.36);
        color: #2e241d;
        backdrop-filter: blur(20px) saturate(1.08);
      }

      .linswift-word-tooltip[data-loading="true"] {
        pointer-events: none;
      }

      .linswift-sentence-popup {
        position: fixed;
        width: min(324px, calc(100vw - 24px));
        display: grid;
        gap: 8px;
        padding: 10px;
        border-radius: 20px;
        max-height: min(70vh, 540px);
        overflow: hidden;
        overflow-y: auto;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 250, 245, 0.9));
        border: 1px solid rgba(255, 255, 255, 0.82);
        box-shadow:
          0 24px 64px rgba(31, 26, 22, 0.18),
          0 8px 22px rgba(255, 132, 0, 0.08),
          inset 0 1px 0 rgba(255, 255, 255, 0.5);
        color: #2e241d;
        backdrop-filter: blur(18px) saturate(1.04);
        z-index: 2147483642;
      }

      .linswift-sentence-popup-card {
        display: grid;
        gap: 7px;
        min-width: 0;
        padding: 10px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.72);
        border: 1px solid rgba(244, 228, 213, 0.92);
      }

      .linswift-sentence-popup-context {
        gap: 8px;
      }

      .linswift-sentence-popup-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
      }

      .linswift-sentence-popup-title {
        margin: 0;
        font-size: 10px;
        line-height: 1.4;
        color: #8d7f73;
        font-weight: 800;
      }

      .linswift-sentence-popup-highlight {
        margin: 0;
        padding: 10px 11px;
        min-width: 0;
        max-height: 30vh;
        border-radius: 14px;
        background: rgba(255, 222, 194, 0.88);
        color: #3a2c24;
        font-size: 13px;
        line-height: 1.45;
        font-weight: 700;
        display: block;
        white-space: normal;
        overflow: auto;
        text-overflow: clip;
        overflow-wrap: anywhere;
        word-break: break-word;
        -webkit-line-clamp: unset;
        -webkit-box-orient: unset;
      }

      .linswift-sentence-popup-copy {
        margin: 0;
        min-width: 0;
        color: #66594e;
        font-size: 11px;
        line-height: 1.45;
        display: block;
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
        overflow-wrap: anywhere;
        word-break: break-word;
        -webkit-line-clamp: unset;
        -webkit-box-orient: unset;
      }

      .linswift-sentence-popup-heading {
        margin: 0;
        font-size: 16px;
        line-height: 1.28;
        font-weight: 800;
        color: #2e241d;
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .linswift-sentence-popup-translation {
        display: grid;
        gap: 6px;
        min-width: 0;
        max-height: 26vh;
        padding: 10px 11px;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.92);
        border: 1px solid rgba(245, 234, 223, 1);
        overflow: auto;
      }

      .linswift-sentence-popup-translation strong {
        font-size: 11px;
        color: #b28b67;
        letter-spacing: 0.04em;
      }

      .linswift-sentence-popup-translation p {
        margin: 0;
        color: #43362e;
        font-size: 13px;
        line-height: 1.5;
        display: block;
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
        overflow-wrap: anywhere;
        word-break: break-word;
        -webkit-line-clamp: unset;
        -webkit-box-orient: unset;
      }

      .linswift-sentence-popup-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
      }

      .linswift-sentence-popup .linswift-button,
      .linswift-sentence-popup .linswift-chip {
        min-height: 36px;
        border-radius: 14px;
        font-size: 12px;
      }

      .linswift-sentence-popup-vocab {
        display: grid;
        gap: 6px;
        padding: 10px;
        border-radius: 14px;
        background: rgba(247, 241, 234, 0.94);
        border: 1px solid rgba(242, 230, 217, 0.92);
      }

      .linswift-sentence-popup-vocab-title {
        margin: 0;
        color: #77685b;
        font-size: 10px;
        line-height: 1.45;
      }

      .linswift-tooltip-top,
      .linswift-tooltip-meta,
      .linswift-tooltip-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .linswift-tooltip-top {
        align-items: flex-start;
      }

      .linswift-tooltip-title-wrap {
        min-width: 0;
        display: grid;
        gap: 4px;
      }

      .linswift-tooltip-top-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        flex: 0 0 auto;
      }

      .linswift-tooltip-icon-button {
        width: 28px;
        height: 28px;
        padding: 0;
        border: 0;
        background: transparent;
        color: #9a9086;
        font-size: 22px;
        line-height: 1;
        cursor: pointer;
      }

      .linswift-tooltip-divider {
        margin: 12px 0 0;
        height: 1px;
        background: rgba(233, 223, 212, 0.92);
      }

      .linswift-tooltip-word {
        margin: 0;
        font-size: 24px;
        line-height: 1.1;
        font-weight: 800;
      }

      .linswift-tooltip-phonetic {
        margin: 6px 0 0;
        color: #8e8377;
        font-size: 14px;
        line-height: 1.5;
      }

      .linswift-tooltip-pronunciations {
        margin-top: 14px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        align-items: start;
      }

      .linswift-tooltip-pronunciation-list {
        min-width: 0;
        display: grid;
        gap: 10px;
      }

      .linswift-tooltip-pronunciation {
        display: grid;
        grid-template-columns: 28px minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
      }

      .linswift-tooltip-pronunciation-label {
        color: #6f655c;
        font-size: 16px;
        font-weight: 700;
      }

      .linswift-tooltip-pronunciation-value {
        min-width: 0;
        color: #6f655c;
        font-size: 16px;
        line-height: 1.4;
      }

      .linswift-tooltip-audio {
        min-width: 34px;
        height: 34px;
        padding: 0;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: #8e8377;
        font-size: 18px;
        cursor: pointer;
      }

      .linswift-tooltip-save {
        width: 44px;
        height: 44px;
        padding: 0;
        border: 0;
        background: transparent;
        color: #a1978d;
        font-size: 34px;
        line-height: 1;
        cursor: pointer;
        align-self: center;
      }

      .linswift-tooltip-save[data-active="true"] {
        color: #ff8a1d;
      }

      .linswift-tooltip-meanings {
        margin-top: 14px;
        display: grid;
        gap: 14px;
      }

      .linswift-tooltip-meaning-row {
        margin: 0;
        font-size: 16px;
        line-height: 1.7;
        color: #2f261f;
      }

      .linswift-tooltip-meaning-pos {
        margin-right: 6px;
        font-weight: 500;
      }

      .linswift-tooltip-note {
        margin: 8px 0 0;
        color: #7e7267;
        font-size: 12px;
        line-height: 1.45;
      }

      .linswift-tooltip-meta {
        margin-top: 10px;
        justify-content: flex-start;
        flex-wrap: wrap;
      }

      .linswift-tooltip-chip {
        display: inline-flex;
        align-items: center;
        min-height: 30px;
        padding: 0 12px;
        border-radius: 999px;
        background: #fff4e8;
        color: #ff8400;
        font-size: 12px;
        font-weight: 800;
      }

      .linswift-tooltip-examples {
        margin: 10px 0 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 6px;
      }

      .linswift-tooltip-example {
        margin: 0;
        padding: 8px 10px;
        border-radius: 12px;
        background: rgba(255, 250, 245, 0.62);
        color: #6b6055;
        font-size: 12px;
        line-height: 1.45;
      }

      .linswift-tooltip-actions {
        margin-top: 12px;
      }

      .linswift-tooltip-actions .linswift-button {
        min-height: 38px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 800;
        padding: 0 10px;
        flex: 1;
      }

      .linswift-tooltip-loading,
      .linswift-tooltip-empty {
        margin: 12px 0 0;
        color: #8d8176;
        font-size: 13px;
        line-height: 1.55;
      }

      .linswift-study-overlay {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        z-index: 2147483641;
      }

      .linswift-study-backdrop {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at top, rgba(255, 132, 0, 0.12), transparent 36%),
          rgba(22, 18, 14, 0.68);
        backdrop-filter: blur(12px);
      }

      .linswift-study-shell {
        position: relative;
        width: min(460px, calc(100vw - 24px));
        min-height: min(760px, calc(100vh - 32px));
        max-height: calc(100vh - 32px);
        padding: 24px;
        display: flex;
        flex-direction: column;
        border-radius: 34px;
        background: rgba(255, 252, 248, 0.98);
        border: 1px solid rgba(255, 255, 255, 0.28);
        box-shadow:
          0 32px 80px rgba(22, 18, 14, 0.34),
          0 8px 24px rgba(255, 132, 0, 0.16);
        overflow: hidden;
      }

      .linswift-study-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .linswift-study-title {
        margin: 0;
        font-size: 22px;
        font-weight: 800;
        color: #261d17;
      }

      .linswift-study-subtitle {
        margin: 6px 0 0;
        font-size: 13px;
        color: #8d8176;
      }

      .linswift-study-progress {
        margin-top: 18px;
        height: 7px;
        border-radius: 999px;
        background: rgba(255, 132, 0, 0.12);
        overflow: hidden;
      }

      .linswift-study-progress-bar {
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(135deg, #ff8a00, #ff7a00);
        transition: width 180ms ease;
      }

      .linswift-study-stage {
        flex: 1;
        min-height: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px 0;
      }

      .linswift-study-stack {
        position: relative;
        width: 100%;
        max-width: 340px;
        perspective: 1000px;
      }

      .linswift-study-shadow-card {
        position: absolute;
        inset: 0;
        border-radius: 30px;
        background: rgba(255, 255, 255, 0.84);
        border: 1px solid rgba(255, 132, 0, 0.12);
      }

      .linswift-study-shadow-card--back {
        transform: translateY(16px) scale(0.95);
        opacity: 0.38;
      }

      .linswift-study-shadow-card--mid {
        transform: translateY(8px) scale(0.975);
        opacity: 0.62;
      }

      .linswift-study-card {
        position: relative;
        min-height: 430px;
        padding: 28px 24px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        gap: 14px;
        border-radius: 30px;
        background: linear-gradient(180deg, #fffdf9, #fff7ef);
        border: 1px solid rgba(255, 132, 0, 0.14);
        box-shadow: 0 20px 48px rgba(255, 132, 0, 0.12);
        cursor: pointer;
        text-align: center;
      }

      .linswift-study-word {
        margin: 0;
        font-size: 34px;
        line-height: 1.08;
        font-weight: 800;
        color: #241b16;
      }

      .linswift-study-phonetic {
        margin: 0;
        color: #8d8176;
        font-size: 15px;
      }

      .linswift-study-meaning {
        margin: 4px 0 0;
        color: #ff7a00;
        font-size: 20px;
        font-weight: 800;
        line-height: 1.45;
      }

      .linswift-study-note-card {
        width: 100%;
        padding: 14px 16px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(255, 132, 0, 0.08);
        color: #6f6358;
        font-size: 14px;
        line-height: 1.65;
      }

      .linswift-study-hint {
        margin: 2px 0 0;
        color: #a09286;
        font-size: 12px;
      }

      .linswift-study-audio {
        width: 54px;
        height: 54px;
        border: 0;
        border-radius: 999px;
        background: rgba(255, 132, 0, 0.12);
        color: #ff8400;
        font-size: 18px;
        font-weight: 800;
        cursor: pointer;
      }

      .linswift-study-actions {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }

      .linswift-study-action {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        border: 0;
        background: transparent;
        cursor: pointer;
        color: #7c6f63;
        font: inherit;
      }

      .linswift-study-action-icon {
        width: 58px;
        height: 58px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 22px;
        font-weight: 800;
      }

      .linswift-study-action--unknown .linswift-study-action-icon {
        background: rgba(255, 89, 94, 0.12);
        color: #ff595e;
      }

      .linswift-study-action--vague .linswift-study-action-icon {
        background: rgba(255, 132, 0, 0.12);
        color: #ff8400;
      }

      .linswift-study-action--know .linswift-study-action-icon,
      .linswift-study-action--mastered .linswift-study-action-icon {
        background: rgba(25, 185, 122, 0.12);
        color: #19b97a;
      }

      .linswift-study-summary {
        width: 100%;
        max-width: 340px;
        text-align: center;
      }

      .linswift-study-summary-grid {
        margin: 22px 0;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .linswift-study-summary-card {
        padding: 18px 14px;
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(255, 132, 0, 0.1);
      }

      .linswift-study-summary-card strong {
        display: block;
        font-size: 28px;
        line-height: 1;
        color: #241b16;
      }

      .linswift-study-summary-card span {
        display: block;
        margin-top: 10px;
        color: #8d8176;
        font-size: 12px;
      }

      .linswift-study-summary-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .linswift-youtube-overlay {
        position: absolute;
        left: 50%;
        top: 0;
        width: min(720px, calc(100% - 32px));
        max-width: calc(100% - 32px);
        transform: translateX(-50%);
        z-index: 2147483639;
        pointer-events: none;
      }

      .linswift-youtube-overlay-card {
        pointer-events: auto;
        padding: 12px 14px;
        border-radius: 20px;
        background: linear-gradient(180deg, rgba(20, 20, 24, 0.76), rgba(20, 20, 24, 0.66));
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28);
        backdrop-filter: blur(16px) saturate(1.04);
        color: #f6f4f1;
      }

      .linswift-youtube-overlay-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
        color: rgba(255, 255, 255, 0.74);
        font-size: 11px;
        line-height: 1.3;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .linswift-youtube-overlay-line {
        margin: 0;
        font-size: 20px;
        line-height: 1.45;
        font-weight: 700;
        text-align: center;
        text-wrap: balance;
      }

      .linswift-youtube-overlay-line + .linswift-youtube-overlay-line {
        margin-top: 6px;
      }

      .linswift-youtube-overlay-line--translation {
        font-size: 15px;
        line-height: 1.5;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.86);
      }

      .linswift-youtube-overlay-line--hint {
        font-size: 13px;
        line-height: 1.5;
        font-weight: 600;
        color: rgba(255, 213, 168, 0.92);
      }

      .linswift-youtube-word {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin: 0 2px;
        padding: 0 6px;
        border: 0;
        border-radius: 10px;
        background: rgba(255, 132, 0, 0.18);
        box-shadow: inset 0 0 0 1px rgba(255, 132, 0, 0.24);
        color: #ffe2c1;
        font: inherit;
        cursor: pointer;
      }

      .linswift-youtube-word::after {
        content: attr(data-short-meaning);
        font-size: 11px;
        font-weight: 700;
        color: #ffb369;
      }

      .linswift-youtube-word:hover {
        background: rgba(255, 132, 0, 0.26);
      }

      .linswift-youtube-chip-row {
        margin-top: 10px;
        display: flex;
        justify-content: center;
        flex-wrap: wrap;
        gap: 8px;
      }

      .linswift-youtube-chip {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 0 10px;
        border-radius: 999px;
        background: rgba(255, 132, 0, 0.14);
        color: #ffd4a7;
        font-size: 11px;
        font-weight: 700;
      }

      .linswift-youtube-card {
        display: grid;
        gap: 10px;
        padding: 10px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.72);
        border: 1px solid rgba(255, 255, 255, 0.34);
      }

      .linswift-youtube-card-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }

      .linswift-youtube-title {
        margin: 0;
        font-size: 13px;
        line-height: 1.45;
        font-weight: 800;
        color: #241b16;
      }

      .linswift-youtube-meta {
        margin: 4px 0 0;
        color: #8d8176;
        font-size: 11px;
        line-height: 1.45;
      }

      .linswift-youtube-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      .linswift-youtube-grid .linswift-select,
      .linswift-youtube-grid .linswift-button {
        width: 100%;
      }

      #${PANEL_ROOT_ID} {
        position: fixed;
        right: 24px;
        bottom: 24px;
        z-index: 2147483640;
        color: #1f1a16;
        font-family: "SF Pro Text", "PingFang SC", "Noto Sans SC", sans-serif;
        --linswift-ui-scale: 1;
      }

      #${PANEL_ROOT_ID} * {
        box-sizing: border-box;
      }

      .linswift-hidden {
        display: none !important;
      }

      .linswift-dragging,
      .linswift-dragging * {
        user-select: none !important;
      }

      .linswift-panel {
        width: 380px;
        height: 760px;
        max-height: 760px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border-radius: 30px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.24), rgba(255, 248, 242, 0.18));
        box-shadow:
          0 22px 36px rgba(42, 29, 20, 0.12),
          0 -2px 10px rgba(255, 255, 255, 0.4);
        border: 1.4px solid rgba(255, 255, 255, 0.82);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        zoom: var(--linswift-ui-scale);
        transform-origin: right bottom;
      }

      .linswift-resize-handle {
        position: absolute;
        right: 10px;
        bottom: 10px;
        width: 22px;
        height: 22px;
        border: 0;
        border-radius: 10px;
        background:
          linear-gradient(135deg, rgba(255, 255, 255, 0) 0 44%, rgba(255, 255, 255, 0.9) 44% 52%, rgba(255, 255, 255, 0) 52% 64%, rgba(255, 255, 255, 0.9) 64% 72%, rgba(255, 255, 255, 0) 72%),
          rgba(247, 237, 227, 0.84);
        border: 1px solid rgba(236, 224, 212, 0.96);
        box-shadow: 0 6px 14px rgba(42, 29, 20, 0.08);
        cursor: nwse-resize;
        z-index: 4;
      }

      .linswift-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 18px 20px 14px;
        min-height: 102px;
        background: linear-gradient(180deg, #ffb14b 0%, #ff8a1d 100%);
        color: #fff;
        cursor: move;
        border-bottom: 1px solid rgba(255, 255, 255, 0.45);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.3),
          0 10px 18px rgba(197, 107, 17, 0.14);
      }

      .linswift-brand {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .linswift-header-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .linswift-brand-badge {
        width: 52px;
        height: 52px;
        border-radius: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.18);
        border: 1.2px solid rgba(255, 255, 255, 0.54);
        font-size: 26px;
        font-weight: 800;
      }

      .linswift-header-title {
        margin: 0;
        font-size: 22px;
        font-weight: 800;
        letter-spacing: 0.01em;
      }

      .linswift-header-subtitle {
        margin: 4px 0 0;
        font-size: 13px;
        line-height: 1.5;
        color: #fff2e7;
        opacity: 1;
      }

      .linswift-close {
        width: 46px;
        height: 46px;
        border: 1.2px solid rgba(255, 255, 255, 0.5);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.16);
        color: #fff;
        font-size: 24px;
        cursor: pointer;
      }

      .linswift-minimize {
        width: 46px;
        height: 46px;
        border: 1.2px solid rgba(255, 255, 255, 0.5);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.16);
        color: #fff;
        font-size: 24px;
        line-height: 1;
        cursor: pointer;
      }

      .linswift-body {
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-height: 0;
        padding: 12px 14px 16px;
        overflow-y: auto;
        overscroll-behavior: contain;
        background: linear-gradient(180deg, #fffaf5 0%, #fdf8f3 100%);
      }

      .linswift-page-tabs {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      .linswift-page {
        display: grid;
        gap: 12px;
        min-height: 0;
      }

      .linswift-translate-actions,
      .linswift-settings-stack {
        display: grid;
        gap: 12px;
      }

      .linswift-translate-actions {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .linswift-kicker {
        margin: 0;
        font-size: 11px;
        color: #a59687;
        font-weight: 700;
      }

      .linswift-headline {
        margin: 4px 0 0;
        font-size: 15px;
        line-height: 1.35;
        font-weight: 800;
      }

      .linswift-page-meta {
        margin: 6px 0 0;
        font-size: 12px;
        line-height: 1.55;
        color: #9c8f81;
      }

      .linswift-metrics {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      .linswift-metric {
        padding: 12px 14px;
        border-radius: 18px;
        border: 1.2px solid rgba(255, 255, 255, 0.82);
        background: rgba(255, 255, 255, 0.42);
      }

      .linswift-metric--warm {
        background: rgba(255, 255, 255, 0.42);
      }

      .linswift-metric--cool {
        background: rgba(255, 255, 255, 0.34);
      }

      .linswift-metric strong {
        display: block;
        font-size: 22px;
        font-weight: 800;
        line-height: 1;
      }

      .linswift-metric--warm strong {
        color: #ff8400;
      }

      .linswift-metric--cool strong {
        color: #2e241d;
      }

      .linswift-metric span {
        display: block;
        margin-top: 4px;
        color: #8a7e72;
        font-size: 11px;
      }

      .linswift-cta-row {
        display: grid;
        grid-template-columns: 1fr;
        gap: 8px;
      }

      .linswift-cta,
      .linswift-button,
      .linswift-tab,
      .linswift-select,
      .linswift-input {
        font: inherit;
      }

      .linswift-cta,
      .linswift-button,
      .linswift-tab {
        min-height: 44px;
        border-radius: 16px;
        border: 1.2px solid transparent;
        font-size: 13px;
        font-weight: 800;
        cursor: pointer;
      }

      .linswift-cta--ghost {
        background: rgba(238, 232, 225, 0.5);
        border-color: rgba(255, 255, 255, 0.95);
        color: #3a2e27;
      }

      .linswift-cta--primary,
      .linswift-button--primary,
      .linswift-tab--active {
        background: rgba(255, 138, 29, 0.9);
        border-color: rgba(255, 210, 165, 1);
        color: #fff;
        box-shadow: 0 10px 18px rgba(255, 154, 42, 0.18);
      }

      .linswift-button {
        border: 1px solid rgba(255, 255, 255, 0.95);
        background: rgba(238, 232, 225, 0.5);
        backdrop-filter: blur(8px);
        color: #342b23;
        padding: 0 14px;
      }

      .linswift-button--soft {
        background: rgba(255, 255, 255, 0.56);
        border-color: rgba(255, 255, 255, 0.98);
        box-shadow: 0 10px 18px rgba(42, 29, 20, 0.05);
      }

      .linswift-button[disabled] {
        opacity: 0.55;
        cursor: progress;
      }

      .linswift-auth-card,
      .linswift-overview,
      .linswift-sentence-context,
      .linswift-sentence-card {
        padding: 16px;
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.28);
        border: 1.2px solid rgba(255, 255, 255, 0.78);
        backdrop-filter: blur(10px);
        box-shadow: 0 16px 28px rgba(42, 29, 20, 0.06);
      }

      .linswift-settings-group,
      .linswift-login-shell {
        display: grid;
        gap: 12px;
        padding: 16px 16px 18px;
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.36);
        border: 1.2px solid rgba(255, 255, 255, 0.86);
        box-shadow: 0 16px 26px rgba(42, 29, 20, 0.06);
      }

      .linswift-settings-header,
      .linswift-login-header {
        display: grid;
        gap: 4px;
      }

      .linswift-settings-title,
      .linswift-login-kicker {
        margin: 0;
        font-size: 14px;
        line-height: 1.3;
        font-weight: 800;
        color: #2e241d;
      }

      .linswift-settings-desc,
      .linswift-login-desc {
        margin: 0;
        color: #8d8176;
        font-size: 10px;
        line-height: 1.5;
      }

      .linswift-page[data-panel-page="settings"] .linswift-section-label {
        font-size: 9px;
      }

      .linswift-page[data-panel-page="settings"] .linswift-settings-title {
        font-size: 12px;
      }

      .linswift-page[data-panel-page="settings"] .linswift-settings-desc,
      .linswift-page[data-panel-page="settings"] .linswift-settings-note,
      .linswift-page[data-panel-page="settings"] .linswift-page-meta {
        font-size: 9px;
        line-height: 1.45;
      }

      .linswift-page[data-panel-page="settings"] .linswift-toolbar-row {
        gap: 6px;
      }

      .linswift-page[data-panel-page="settings"] .linswift-select,
      .linswift-page[data-panel-page="settings"] .linswift-button,
      .linswift-page[data-panel-page="settings"] .linswift-tag {
        min-height: 42px;
        font-size: 11px;
      }

      .linswift-page[data-panel-page="settings"] .linswift-scale-control {
        min-height: 42px;
      }

      .linswift-translate-shell {
        display: grid;
        gap: 12px;
      }

      .linswift-translate-dashboard,
      .linswift-translate-results-shell {
        display: grid;
        gap: 10px;
        padding: 15px;
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.36);
        border: 1.2px solid rgba(255, 255, 255, 0.86);
        box-shadow: 0 16px 26px rgba(42, 29, 20, 0.06);
      }

      .linswift-translate-dashboard.linswift-translate-dashboard--compact {
        gap: 8px;
        padding: 12px 15px;
      }

      .linswift-translate-dashboard.linswift-translate-dashboard--compact .linswift-translate-spotlight {
        grid-template-columns: 56px minmax(0, 1fr);
        gap: 10px;
      }

      .linswift-translate-dashboard.linswift-translate-dashboard--compact .linswift-translate-meta {
        gap: 8px;
      }

      .linswift-translate-dashboard.linswift-translate-dashboard--compact .linswift-translate-count strong {
        font-size: 28px;
      }

      .linswift-translate-dashboard.linswift-translate-dashboard--compact .linswift-headline {
        font-size: 13px;
        line-height: 1.3;
      }

      .linswift-translate-dashboard.linswift-translate-dashboard--compact .linswift-translate-note,
      .linswift-translate-dashboard.linswift-translate-dashboard--compact .linswift-translate-summary-line {
        font-size: 10px;
      }

      .linswift-translate-dashboard.linswift-translate-dashboard--compact .linswift-cta,
      .linswift-translate-dashboard.linswift-translate-dashboard--compact .linswift-button {
        min-height: 38px;
        font-size: 12px;
      }

      .linswift-translate-dashboard.linswift-translate-dashboard--compact .linswift-cta-row {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .linswift-translate-dashboard.linswift-translate-dashboard--compact .linswift-translate-links .linswift-chip-button {
        min-height: 24px;
        padding: 3px 8px;
        font-size: 8px;
      }

      .linswift-translate-dashboard.linswift-translate-dashboard--compact .linswift-metrics {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
      }

      .linswift-translate-dashboard.linswift-translate-dashboard--compact .linswift-metric {
        padding: 10px 10px 9px;
      }

      .linswift-translate-dashboard.linswift-translate-dashboard--compact .linswift-metric strong {
        font-size: 18px;
      }

      .linswift-translate-dashboard.linswift-translate-dashboard--compact .linswift-metric span {
        font-size: 10px;
      }

      .linswift-translate-summary-line {
        margin: 0;
        color: #8a7e72;
        font-size: 11px;
        font-weight: 600;
      }

      .linswift-translate-spotlight {
        display: grid;
        grid-template-columns: 72px minmax(0, 1fr);
        gap: 12px;
        align-items: start;
      }

      .linswift-translate-meta {
        min-width: 0;
        display: grid;
        gap: 10px;
        align-content: start;
      }

      .linswift-translate-meta-top {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
      }

      .linswift-translate-meta .linswift-kicker {
        font-size: 12px;
        color: #8a7e72;
      }

      .linswift-translate-count {
        display: grid;
        gap: 4px;
        align-content: start;
      }

      .linswift-translate-count strong {
        display: block;
        color: #ff8a1d;
        font-size: 36px;
        line-height: 1;
        font-weight: 800;
      }

      .linswift-translate-count span {
        color: #8a7e72;
        font-size: 11px;
        font-weight: 700;
      }

      .linswift-translate-note {
        margin: 0;
        color: #9c8f81;
        font-size: 11px;
        line-height: 1.5;
      }

      .linswift-translate-links {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
      }

      .linswift-translate-links .linswift-chip-button {
        min-height: 28px;
        padding: 4px 8px;
        font-size: 9px;
        border-color: rgba(235, 224, 212, 0.7);
        background: rgba(255, 255, 255, 0.18);
        color: #8a7e72;
      }

      .linswift-translate-dashboard.linswift-translate-dashboard--compact .linswift-translate-links {
        display: none;
      }

      .linswift-result-title {
        margin: 0;
        font-size: 15px;
        font-weight: 800;
        color: #2b221c;
      }

      .linswift-result-copy {
        margin: -2px 0 0;
        color: #9c8f81;
        font-size: 11px;
        line-height: 1.5;
      }

      .linswift-results-list {
        display: grid;
        gap: 10px;
      }

      .linswift-results-list .linswift-empty {
        padding: 18px 14px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.5);
      }

      .linswift-auth-top,
      .linswift-auth-actions,
      .linswift-toolbar-row,
      .linswift-card-actions,
      .linswift-tabs {
        display: grid;
        gap: 10px;
      }

      .linswift-auth-top {
        grid-template-columns: 1fr auto;
        align-items: center;
      }

      .linswift-auth-label,
      .linswift-section-label {
        margin: 0;
        font-size: 10px;
        font-weight: 700;
        color: #9b8d82;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .linswift-auth-email {
        margin: 3px 0 0;
        font-size: 14px;
        font-weight: 700;
      }

      .linswift-auth-note,
      .linswift-status,
      .linswift-card-note,
      .linswift-card-meta {
        margin: 0;
        color: #8d8176;
        font-size: 12px;
        line-height: 1.45;
      }

      .linswift-status {
        min-height: 16px;
      }

      .linswift-auth-actions {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .linswift-toolbar-row {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        align-items: center;
        gap: 8px;
      }

      .linswift-toolbar-row--secondary {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      }

      .linswift-toolbar-row--full {
        grid-template-columns: minmax(0, 1fr);
      }

      .linswift-toolbar-row--full .linswift-button {
        width: 100%;
      }

      .linswift-settings-note {
        margin: 0;
        color: #8d8176;
        font-size: 10px;
        line-height: 1.45;
      }

      .linswift-scale-control {
        --linswift-scale-progress: 50%;
        position: relative;
        min-width: 0;
        min-height: 42px;
        display: grid;
        gap: 8px;
        padding: 11px 14px 10px;
        border-radius: 18px;
        border: 1.2px solid rgba(255, 255, 255, 0.82);
        background: rgba(255, 255, 255, 0.52);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.46);
      }

      .linswift-scale-track {
        position: relative;
        height: 8px;
        border-radius: 999px;
        background: rgba(228, 217, 205, 0.68);
        overflow: hidden;
      }

      .linswift-scale-track-fill {
        position: absolute;
        inset: 0 auto 0 0;
        width: var(--linswift-scale-progress);
        border-radius: inherit;
        background: linear-gradient(90deg, rgba(255, 177, 97, 0.98), rgba(255, 138, 29, 0.95));
        box-shadow: 0 4px 10px rgba(255, 154, 42, 0.2);
      }

      .linswift-scale-stop {
        position: absolute;
        top: 50%;
        width: 10px;
        height: 10px;
        border-radius: 999px;
        border: 2px solid rgba(255, 255, 255, 0.96);
        background: rgba(252, 247, 241, 0.98);
        transform: translate(-50%, -50%);
        box-shadow: 0 2px 6px rgba(74, 55, 38, 0.08);
      }

      .linswift-scale-stop:nth-child(2) {
        left: 0%;
      }

      .linswift-scale-stop:nth-child(3) {
        left: 25%;
      }

      .linswift-scale-stop:nth-child(4) {
        left: 50%;
      }

      .linswift-scale-stop:nth-child(5) {
        left: 75%;
      }

      .linswift-scale-stop:nth-child(6) {
        left: 100%;
      }

      .linswift-scale-range {
        position: absolute;
        inset: 8px 10px auto 10px;
        width: calc(100% - 20px);
        height: 16px;
        margin: 0;
        appearance: none;
        background: transparent;
        cursor: pointer;
      }

      .linswift-scale-range::-webkit-slider-runnable-track {
        appearance: none;
        height: 16px;
        background: transparent;
      }

      .linswift-scale-range::-webkit-slider-thumb {
        appearance: none;
        width: 18px;
        height: 18px;
        margin-top: -1px;
        border-radius: 999px;
        border: 1.6px solid rgba(255, 255, 255, 0.98);
        background: linear-gradient(180deg, rgba(255, 255, 255, 1), rgba(255, 240, 225, 0.98));
        box-shadow: 0 6px 16px rgba(255, 138, 29, 0.18);
      }

      .linswift-scale-range::-moz-range-track {
        height: 16px;
        background: transparent;
        border: 0;
      }

      .linswift-scale-range::-moz-range-thumb {
        width: 18px;
        height: 18px;
        border-radius: 999px;
        border: 1.6px solid rgba(255, 255, 255, 0.98);
        background: linear-gradient(180deg, rgba(255, 255, 255, 1), rgba(255, 240, 225, 0.98));
        box-shadow: 0 6px 16px rgba(255, 138, 29, 0.18);
      }

      .linswift-scale-range:focus-visible {
        outline: none;
      }

      .linswift-scale-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        min-width: 0;
      }

      .linswift-scale-title {
        color: #9b8d82;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.03em;
      }

      .linswift-scale-value {
        color: #2e241d;
        font-size: 11px;
        font-weight: 800;
        white-space: nowrap;
      }

      .linswift-auth-form {
        display: grid;
        gap: 12px;
      }

      .linswift-select,
      .linswift-input {
        width: 100%;
        min-height: 48px;
        padding: 0 15px;
        border-radius: 18px;
        border: 1.2px solid rgba(255, 255, 255, 0.72);
        background: rgba(255, 255, 255, 0.46);
        color: #2a221c;
        outline: none;
      }

      .linswift-tabs {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .linswift-list-wrap {
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding-right: 2px;
      }

      .linswift-card {
        display: grid;
        gap: 12px;
        padding: 18px;
        border-radius: 24px;
        border: 1.2px solid rgba(255, 255, 255, 0.86);
        background: rgba(255, 255, 255, 0.44);
        backdrop-filter: blur(10px);
        box-shadow: 0 16px 24px rgba(42, 29, 20, 0.05);
      }

      .linswift-card--featured {
        gap: 14px;
        padding: 20px 20px 18px;
        border-radius: 26px;
        background: rgba(255, 255, 255, 0.6);
        border-color: rgba(255, 255, 255, 0.94);
        box-shadow: 0 18px 28px rgba(42, 29, 20, 0.06);
      }

      .linswift-card-feature-copy {
        display: grid;
        gap: 10px;
      }

      .linswift-card-feature-meaning {
        padding: 14px 14px 13px;
        border-radius: 18px;
        border: 1px solid rgba(255, 255, 255, 0.92);
        background: rgba(255, 255, 255, 0.62);
      }

      .linswift-card-feature-meaning .linswift-card-meaning {
        margin: 0;
      }

      .linswift-card-feature-note {
        margin: 0;
        color: #8d8176;
        font-size: 11px;
        line-height: 1.55;
      }

      .linswift-card-top {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        align-items: start;
      }

      .linswift-card-top-main {
        min-width: 0;
        display: grid;
        gap: 6px;
      }

      .linswift-card-top-side {
        display: flex;
        align-items: flex-start;
        justify-content: flex-end;
      }

      .linswift-card-word {
        margin: 0;
        font-size: 22px;
        font-weight: 800;
      }

      .linswift-card--featured .linswift-card-word {
        font-size: 24px;
        line-height: 1.12;
      }

      .linswift-card-meaning,
      .linswift-card-snippet {
        margin: 0;
        font-size: 13px;
        line-height: 1.58;
      }

      .linswift-card--featured .linswift-card-meaning {
        font-size: 14px;
        line-height: 1.62;
      }

      .linswift-card-snippet {
        color: #6c6259;
      }

      .linswift-tag {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 52px;
        min-height: 34px;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.92);
        background: rgba(247, 239, 230, 0.86);
        color: #ff8400;
        font-size: 11px;
        font-weight: 800;
      }

      .linswift-card--featured .linswift-tag {
        min-width: 56px;
        min-height: 36px;
        background: rgba(255, 243, 231, 0.98);
        color: #ff8a1d;
      }

      .linswift-save-star {
        flex: 0 0 auto;
        width: 36px;
        height: 36px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.92);
        background: rgba(247, 239, 230, 0.86);
        color: #b8aa9e;
        cursor: pointer;
        transition: color 120ms ease, background 120ms ease, transform 120ms ease;
      }

      .linswift-save-star:hover {
        transform: translateY(-1px);
      }

      .linswift-save-star svg {
        width: 18px;
        height: 18px;
        display: block;
        fill: currentColor;
      }

      .linswift-save-star--active {
        background: rgba(255, 243, 231, 0.98);
        color: #ff8a1d;
      }

      .linswift-card-actions {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-top: 0;
      }

      .linswift-card .linswift-button {
        min-height: 36px;
        padding: 0 10px;
        font-size: 12px;
      }

      .linswift-card--featured .linswift-card-actions {
        margin-top: 12px;
      }

      .linswift-card--featured .linswift-button {
        min-height: 38px;
        font-size: 12px;
      }

      .linswift-card--featured .linswift-button[data-action="save"] {
        background: rgba(255, 138, 29, 0.9);
        border-color: rgba(255, 210, 165, 1);
        color: #fff;
      }

      .linswift-card .linswift-button[disabled],
      .linswift-card-inline-link[disabled] {
        opacity: 0.72;
        cursor: default;
      }

      .linswift-footer-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .linswift-empty {
        padding: 16px;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.42);
        border: 1px dashed rgba(232, 221, 208, 1);
        font-size: 12px;
        color: #8c8176;
        line-height: 1.65;
        text-align: center;
      }

      .linswift-overview {
        display: grid;
        gap: 12px;
      }

      .linswift-overview-top,
      .linswift-sync-line,
      .linswift-result-head,
      .linswift-chip-row,
      .linswift-divider-row,
      .linswift-oauth-row,
      .linswift-register-row,
      .linswift-sentence-top,
      .linswift-sentence-actions,
      .linswift-sentence-vocab {
        display: flex;
        gap: 8px;
      }

      .linswift-overview-top,
      .linswift-result-head,
      .linswift-sentence-top {
        align-items: flex-start;
        justify-content: space-between;
      }

      .linswift-sync-line,
      .linswift-chip-row,
      .linswift-register-row {
        flex-wrap: wrap;
        align-items: center;
      }

      .linswift-login-page,
      .linswift-sentence-page {
        display: grid;
        gap: 16px;
        min-width: 0;
      }

      .linswift-login-alt {
        display: grid;
        gap: 14px;
      }

      .linswift-login-title,
      .linswift-sentence-title {
        margin: 0;
        font-size: 22px;
        line-height: 1.28;
        font-weight: 800;
        color: #2e241d;
      }

      .linswift-login-shell--secondary {
        gap: 16px;
        background: rgba(255, 255, 255, 0.18);
        border-color: rgba(237, 225, 212, 0.92);
        box-shadow: none;
      }

      .linswift-inline-link {
        padding: 0;
        border: 0;
        background: transparent;
        color: #ff8a1d;
        font-size: 14px;
        font-weight: 800;
        cursor: pointer;
      }

      .linswift-divider-row {
        align-items: center;
      }

      .linswift-divider-row span {
        flex: 1;
        height: 1px;
        background: #e8ddd0;
      }

      .linswift-divider-row em {
        color: #a59a90;
        font-style: normal;
        font-size: 12px;
        font-weight: 700;
      }

      .linswift-oauth-row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .linswift-oauth-button {
        min-height: 50px;
        border-radius: 18px;
        font-size: 15px;
        font-weight: 800;
      }

      .linswift-oauth-button--google {
        border: 1px solid #eee3d6;
        background: rgba(255, 255, 255, 0.8);
        color: #2f251f;
      }

      .linswift-oauth-button--apple {
        border: 1px solid #353230;
        background: #353230;
        color: #fff;
      }

      .linswift-result-head {
        margin-bottom: 0;
        padding-top: 0;
      }

      .linswift-result-tools {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-end;
      }

      .linswift-chip-button,
      .linswift-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 40px;
        padding: 8px 12px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.78);
        background: rgba(255, 255, 255, 0.34);
        color: #2e241d;
        font-size: 12px;
        font-weight: 800;
        text-align: center;
      }

      .linswift-page-tabs .linswift-tab {
        min-height: 38px;
        font-size: 12px;
        background: rgba(235, 234, 234, 0.9);
        color: #2e241d;
        border-color: rgba(234, 224, 214, 0.88);
      }

      .linswift-tabs .linswift-tab {
        min-height: 38px;
        font-size: 12px;
      }

      .linswift-page-tabs .linswift-tab.linswift-tab--active {
        background: rgba(255, 138, 29, 0.92);
        border-color: rgba(255, 210, 165, 1);
        color: #fff;
        box-shadow: 0 10px 18px rgba(255, 154, 42, 0.16);
      }

      .linswift-chip--accent {
        background: rgba(255, 241, 227, 0.78);
        color: #ff8a1d;
      }

      .linswift-card-note {
        margin: 0;
        font-size: 12px;
        color: #b09d8e;
      }

      .linswift-card-inline-links {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }

      .linswift-card-inline-link {
        padding: 0;
        border: 0;
        background: transparent;
        font-size: 11px;
        font-weight: 700;
        color: #4c7ee9;
        cursor: pointer;
        white-space: nowrap;
      }

      .linswift-card-inline-link--warm {
        color: #ff8a1d;
      }

      .linswift-sentence-context {
        display: grid;
        gap: 12px;
        min-width: 0;
      }

      .linswift-sentence-mode {
        align-self: flex-start;
      }

      .linswift-sentence-copy {
        margin: 0;
        display: block;
        min-width: 0;
        color: #332823;
        font-size: 16px;
        line-height: 1.45;
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      .linswift-sentence-highlight {
        min-width: 0;
        max-height: 32vh;
        padding: 14px;
        border-radius: 18px;
        background: rgba(255, 220, 192, 0.82);
        overflow: auto;
      }

      .linswift-sentence-highlight p {
        margin: 0;
        display: block;
        color: #3a2c24;
        font-size: 20px;
        line-height: 1.3;
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
        overflow-wrap: anywhere;
        word-break: break-word;
        -webkit-line-clamp: unset;
        -webkit-box-orient: unset;
      }

      .linswift-sentence-translation {
        min-width: 0;
        max-height: 28vh;
        padding: 14px;
        border-radius: 18px;
        border: 1px solid rgba(255, 255, 255, 0.94);
        background: rgba(255, 255, 255, 0.44);
        overflow: auto;
      }

      .linswift-sentence-translation strong {
        display: block;
        margin-bottom: 8px;
        color: #b28b67;
        font-size: 13px;
      }

      .linswift-sentence-translation p {
        margin: 0;
        display: block;
        color: #43362e;
        font-size: 17px;
        line-height: 1.55;
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
        overflow-wrap: anywhere;
        word-break: break-word;
        -webkit-line-clamp: unset;
        -webkit-box-orient: unset;
      }

      .linswift-sentence-vocab {
        flex-direction: column;
        padding: 12px;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.35);
        background: rgba(244, 236, 224, 0.8);
      }

      .linswift-sentence-vocab-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .linswift-sentence-vocab-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.45);
        background: rgba(255, 247, 238, 0.8);
        font-size: 12px;
        font-weight: 700;
      }

      .linswift-sentence-vocab-chip strong,
      .linswift-sentence-vocab-chip span:last-child {
        color: #f28a1d;
      }

      .linswift-sentence-vocab-chip span {
        color: #6b5a4f;
      }

      .linswift-bubble {
        position: relative;
        width: 78px;
        height: 78px;
        border: 0;
        border-radius: 999px;
        background:
          linear-gradient(135deg, rgba(255, 138, 0, 0.92), rgba(255, 122, 0, 0.82)),
          rgba(255, 255, 255, 0.14);
        color: #fff;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-shadow:
          0 24px 54px rgba(255, 132, 0, 0.28),
          inset 0 1px 0 rgba(255, 255, 255, 0.28);
        cursor: pointer;
        zoom: var(--linswift-ui-scale);
        transform-origin: right bottom;
        touch-action: none;
        backdrop-filter: blur(18px);
      }

      .linswift-bubble span {
        font-size: 30px;
        font-weight: 800;
        line-height: 1;
      }

      .linswift-bubble-badge {
        position: absolute;
        top: -2px;
        right: -2px;
        min-width: 34px;
        height: 34px;
        padding: 0 10px;
        border-radius: 999px;
        background: #ff4d4f;
        color: #fff;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        font-weight: 800;
        box-shadow: 0 10px 20px rgba(255, 77, 79, 0.28);
      }

      @media (max-width: 640px) {
        #${PANEL_ROOT_ID} {
          right: 12px;
          left: 12px;
          bottom: 12px;
        }

        .linswift-panel {
          width: auto;
        }

        .linswift-body,
        .linswift-header {
          padding-left: 18px;
          padding-right: 18px;
        }

        .linswift-metrics,
        .linswift-cta-row,
        .linswift-auth-actions,
        .linswift-page-tabs,
        .linswift-tabs,
        .linswift-translate-actions,
        .linswift-toolbar-row,
        .linswift-card-actions {
          grid-template-columns: 1fr;
        }

        .linswift-bubble {
          width: 90px;
          height: 90px;
          margin-left: auto;
        }

        .linswift-bubble span {
          font-size: 32px;
        }

        .linswift-study-overlay {
          padding: 12px;
        }

        .linswift-study-shell {
          min-height: calc(100vh - 24px);
          max-height: calc(100vh - 24px);
          padding: 18px;
          border-radius: 26px;
        }

        .linswift-study-actions,
        .linswift-study-summary-actions,
        .linswift-study-summary-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .linswift-study-card {
          min-height: 360px;
        }
      }
    `

    document.documentElement.appendChild(style)
  }

  function isElementVisible(element) {
    if (!(element instanceof Element)) return false

    let current = element
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current)
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false
      }
      current = current.parentElement
    }

    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  function shouldIgnoreNode(parentElement) {
    if (!parentElement) return true
    if (parentElement.closest(`#${PANEL_ROOT_ID}`)) return true
    if (parentElement.closest('.linswift-inline-translation')) return true
    if (parentElement.closest(`.${SELECTION_HIGHLIGHT_CLASS}`)) return true
    const tagName = parentElement.tagName
    if (parentElement.closest('[contenteditable="true"]')) return true
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'SELECT'].includes(tagName)) {
      return true
    }
    return !isElementVisible(parentElement)
  }

  function extractVisibleSegments() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parentElement = node.parentElement
        if (shouldIgnoreNode(parentElement)) return NodeFilter.FILTER_REJECT

        const text = node.textContent?.replace(/\s+/g, ' ').trim() || ''
        if (text.length < 18) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      },
    })

    const segments = []
    const seen = new Set()
    let node = walker.nextNode()

    while (node && segments.length < 260) {
      const text = node.textContent.replace(/\s+/g, ' ').trim()
      if (!seen.has(text)) {
        seen.add(text)
        segments.push({
          text,
          tagName: node.parentElement?.tagName?.toLowerCase() || 'text',
        })
      }
      node = walker.nextNode()
    }

    return segments
  }

  function isYouTubeWatchPage() {
    try {
      const url = new URL(window.location.href)
      return /(^|\.)youtube\.com$/i.test(url.hostname) && url.pathname === '/watch' && url.searchParams.has('v')
    } catch {
      return false
    }
  }

  function getYouTubeVideoId() {
    try {
      return new URL(window.location.href).searchParams.get('v') || ''
    } catch {
      return ''
    }
  }

  function getYouTubeSubtitleMode() {
    const mode = panelState.extensionState.settings.youtubeSubtitleMode || 'vocab'
    return YOUTUBE_SUBTITLE_MODE_OPTIONS[mode] ? mode : 'vocab'
  }

  function getYouTubeSubtitleModeLabel() {
    return YOUTUBE_SUBTITLE_MODE_OPTIONS[getYouTubeSubtitleMode()] || '生词'
  }

  function readYouTubeMeta() {
    const video = document.querySelector('video')
    const title =
      document.querySelector('ytd-watch-metadata h1 yt-formatted-string')?.textContent?.trim() ||
      document.querySelector('h1.title yt-formatted-string')?.textContent?.trim() ||
      document.title.replace(/\s*-\s*YouTube\s*$/i, '').trim() ||
      'YouTube 视频'
    const channel =
      document.querySelector('ytd-channel-name a')?.textContent?.trim() ||
      document.querySelector('#owner #channel-name a')?.textContent?.trim() ||
      ''

    return {
      title,
      channel,
      duration: Number(video?.duration || 0),
      currentTime: Number(video?.currentTime || 0),
    }
  }

  function areYouTubeCaptionsEnabled() {
    const button = document.querySelector('.ytp-subtitles-button')
    return button?.getAttribute('aria-pressed') === 'true'
  }

  async function ensureYouTubeCaptionsEnabled() {
    if (!panelState.youtube.enabled || !panelState.youtube.videoId) return false
    if (areYouTubeCaptionsEnabled()) return true
    if (youtubeAutoCaptionRequestKey === panelState.youtube.videoId) return false

    const subtitleButton = document.querySelector('.ytp-subtitles-button')
    if (!(subtitleButton instanceof HTMLElement)) return false

    youtubeAutoCaptionRequestKey = panelState.youtube.videoId

    try {
      subtitleButton.click()
      await new Promise((resolve) => {
        window.setTimeout(resolve, 260)
      })
      const enabled = areYouTubeCaptionsEnabled()
      panelState.youtube.captionsEnabled = enabled
      return enabled
    } catch {
      return false
    } finally {
      if (youtubeAutoCaptionRequestKey === panelState.youtube.videoId) {
        youtubeAutoCaptionRequestKey = ''
      }
    }
  }

  function collectYouTubeCaptionLines() {
    const segments = Array.from(document.querySelectorAll('.ytp-caption-segment'))
      .map((item) => item.textContent?.replace(/\s+/g, ' ').trim() || '')
      .filter(Boolean)

    if (segments.length > 0) return segments

    const fallbackText =
      document.querySelector('.ytp-caption-window-container')?.textContent?.replace(/\s+/g, ' ').trim() ||
      ''

    return fallbackText ? [fallbackText] : []
  }

  function buildYouTubeTrackKey(track) {
    if (!track) return ''
    return [
      String(track.vssId || '').trim(),
      String(track.languageCode || '').trim(),
      String(track.kind || '').trim(),
    ]
      .filter(Boolean)
      .join('::')
  }

  function normalizeYouTubeTranscriptCues(cues) {
    const normalized = Array.isArray(cues)
      ? cues
          .map((cue) => {
            const text = String(cue?.text || '')
              .replace(/\s+/g, ' ')
              .trim()
            if (!text) return null

            const lines = Array.isArray(cue?.lines)
              ? cue.lines
                  .map((line) => String(line || '').replace(/\s+/g, ' ').trim())
                  .filter(Boolean)
              : [text]
            const startMs = Math.max(0, Math.round(Number(cue?.startMs || 0)))
            const rawEndMs = Math.max(0, Math.round(Number(cue?.endMs || 0)))
            const rawDurationMs = Math.max(0, Math.round(Number(cue?.durationMs || 0)))
            const endMs = rawEndMs > startMs ? rawEndMs : startMs + rawDurationMs

            return {
              text,
              lines: lines.length > 0 ? lines : [text],
              startMs,
              endMs,
              durationMs: Math.max(0, endMs - startMs),
            }
          })
          .filter(Boolean)
      : []

    normalized.sort((left, right) => left.startMs - right.startMs)

    const deduped = []
    const seen = new Set()
    normalized.forEach((cue, index) => {
      const nextCue = normalized[index + 1] || null
      let endMs = cue.endMs

      if (endMs <= cue.startMs) {
        const nextStartMs = Number(nextCue?.startMs || 0)
        const fallbackDurationMs =
          nextStartMs > cue.startMs
            ? Math.max(900, nextStartMs - cue.startMs - 40)
            : Math.max(
                1800,
                Math.min(
                  5200,
                  Math.round(cue.text.split(/\s+/).filter(Boolean).length * 420)
                )
              )
        endMs = cue.startMs + fallbackDurationMs
      }

      const key = `${cue.startMs}::${cue.text}`
      if (seen.has(key)) return
      seen.add(key)
      deduped.push({
        ...cue,
        endMs,
        durationMs: Math.max(
          YOUTUBE_DEFAULT_CUE_DURATION_MS,
          Math.round(endMs - cue.startMs)
        ),
      })
    })

    return deduped
  }

  function extractBalancedObject(source, marker) {
    const markerIndex = source.indexOf(marker)
    if (markerIndex < 0) return null

    const startIndex = source.indexOf('{', markerIndex + marker.length)
    if (startIndex < 0) return null

    let depth = 0
    let inString = false
    let escaped = false

    for (let index = startIndex; index < source.length; index += 1) {
      const char = source[index]

      if (inString) {
        if (escaped) {
          escaped = false
        } else if (char === '\\') {
          escaped = true
        } else if (char === '"') {
          inString = false
        }
        continue
      }

      if (char === '"') {
        inString = true
        continue
      }

      if (char === '{') {
        depth += 1
      } else if (char === '}') {
        depth -= 1
        if (depth === 0) {
          return source.slice(startIndex, index + 1)
        }
      }
    }

    return null
  }

  function parseYouTubeCaptionTracklistFromSource(source) {
    if (!source) return null

    const playerResponseMarkers = [
      'ytInitialPlayerResponse = ',
      'var ytInitialPlayerResponse = ',
      'window["ytInitialPlayerResponse"] = ',
    ]

    for (const marker of playerResponseMarkers) {
      const objectText = extractBalancedObject(source, marker)
      if (!objectText) continue

      try {
        const payload = JSON.parse(objectText)
        const tracklist = payload?.captions?.playerCaptionsTracklistRenderer || null
        if (Array.isArray(tracklist?.captionTracks) && tracklist.captionTracks.length > 0) {
          return tracklist
        }
      } catch {}
    }

    const tracklistMarkers = ['"playerCaptionsTracklistRenderer":']
    for (const marker of tracklistMarkers) {
      const objectText = extractBalancedObject(source, marker)
      if (!objectText) continue

      try {
        const tracklist = JSON.parse(objectText)
        if (Array.isArray(tracklist?.captionTracks) && tracklist.captionTracks.length > 0) {
          return tracklist
        }
      } catch {}
    }

    return null
  }

  function readYouTubeCaptionTracklistFromScripts() {
    const scripts = Array.from(document.scripts || [])
    for (const script of scripts) {
      const text = script.textContent || ''
      if (!text || !text.includes('playerCaptionsTracklistRenderer')) continue
      const tracklist = parseYouTubeCaptionTracklistFromSource(text)
      if (tracklist) return tracklist
    }

    return null
  }

  async function readYouTubeCaptionTracklistFromPage() {
    const tracklistFromDom = readYouTubeCaptionTracklistFromScripts()
    if (tracklistFromDom) return tracklistFromDom

    try {
      const response = await fetch(window.location.href, {
        credentials: 'same-origin',
      })
      if (!response.ok) return null

      const html = await response.text()
      return parseYouTubeCaptionTracklistFromSource(html)
    } catch {
      return null
    }
  }

  function chooseYouTubeCaptionTrack(tracklist) {
    const tracks = Array.isArray(tracklist?.captionTracks) ? tracklist.captionTracks : []
    if (tracks.length === 0) return null

    const scoreTrack = (track) => {
      const languageCode = String(track?.languageCode || '').toLowerCase()
      const vssId = String(track?.vssId || '').toLowerCase()
      const kind = String(track?.kind || '').toLowerCase()
      let score = 0

      if (!kind || kind !== 'asr') score += 3
      if (languageCode.startsWith('en')) score += 5
      if (vssId.includes('.en')) score += 3
      if (track?.isTranslatable) score += 1

      return score
    }

    return tracks
      .slice()
      .sort((left, right) => scoreTrack(right) - scoreTrack(left))[0]
  }

  function ensureYouTubePageBridgeInjected() {
    if (!panelState.youtube.enabled) return false
    if (document.getElementById(YOUTUBE_PAGE_BRIDGE_ID)) return true

    const host = document.head || document.documentElement
    if (!(host instanceof HTMLElement)) return false

    const script = document.createElement('script')
    script.id = YOUTUBE_PAGE_BRIDGE_ID
    script.src = chrome.runtime.getURL('youtube-page-bridge.js')
    script.async = false
    host.appendChild(script)
    return true
  }

  function handleYouTubePageBridgeMessage(event) {
    if (event.source !== window) return

    const payload = event.data
    if (
      payload?.source !== YOUTUBE_PAGE_BRIDGE_RESPONSE_SOURCE ||
      payload?.type !== YOUTUBE_PAGE_BRIDGE_RESPONSE_TYPE
    ) {
      return
    }

    const requestId = String(payload.requestId || '')
    const pendingRequest = youtubePageBridgePendingRequests.get(requestId)
    if (!pendingRequest) return

    youtubePageBridgePendingRequests.delete(requestId)
    window.clearTimeout(pendingRequest.timeoutId)

    if (payload.ok) {
      pendingRequest.resolve(payload.payload || null)
      return
    }

    pendingRequest.reject(new Error(payload.error || 'YouTube 页面桥接失败'))
  }

  async function requestYouTubeTranscriptFromPage() {
    if (!ensureYouTubePageBridgeInjected()) return null

    return new Promise((resolve, reject) => {
      youtubePageBridgeRequestId += 1
      const requestId = `${panelState.youtube.videoId || 'youtube'}-${youtubePageBridgeRequestId}`
      const timeoutId = window.setTimeout(() => {
        youtubePageBridgePendingRequests.delete(requestId)
        reject(new Error('YouTube 页面 transcript 请求超时'))
      }, YOUTUBE_PAGE_BRIDGE_TIMEOUT_MS)

      youtubePageBridgePendingRequests.set(requestId, {
        resolve,
        reject,
        timeoutId,
      })

      window.postMessage(
        {
          source: 'linswift-content-script',
          type: YOUTUBE_PAGE_BRIDGE_REQUEST_TYPE,
          requestId,
          action: 'get-transcript',
          videoId: panelState.youtube.videoId,
        },
        window.location.origin
      )
    })
  }

  function applyYouTubeTranscriptResult(cues, options = {}) {
    const normalizedCues = normalizeYouTubeTranscriptCues(cues)
    const nextTrackKey = String(options.trackKey || '').trim()

    if (nextTrackKey && nextTrackKey !== panelState.youtube.transcriptTrackKey) {
      panelState.youtube.transcriptTranslationStatus = 'idle'
      panelState.youtube.translations = {}
    }

    if (nextTrackKey) {
      panelState.youtube.transcriptTrackKey = nextTrackKey
    }

    if (options.languageCode) {
      panelState.youtube.subtitleLanguage = String(options.languageCode || '').trim()
    }

    if (options.provider) {
      panelState.youtube.transcriptProvider = String(options.provider || '').trim()
    }

    panelState.youtube.transcriptCues = normalizedCues
    panelState.youtube.transcriptStatus = normalizedCues.length > 0 ? 'ready' : 'empty'
    panelState.youtube.subtitleReady = normalizedCues.length > 0 || panelState.youtube.subtitleReady
  }

  async function fetchYouTubeTranscriptCues(track) {
    if (!track?.baseUrl) return []

    const url = new URL(track.baseUrl)
    if (!url.searchParams.has('fmt')) {
      url.searchParams.set('fmt', 'json3')
    }

    const response = await fetch(url.toString())
    if (!response.ok) return []

    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('json')) {
      const payload = await response.json()
      const events = Array.isArray(payload?.events) ? payload.events : []
      return normalizeYouTubeTranscriptCues(
        events
          .map((event) => {
            const lines = Array.isArray(event?.segs)
              ? event.segs
                  .map((segment) => String(segment?.utf8 || '').replace(/\u200b/g, '').trim())
                  .join('')
                  .split('\n')
                  .map((line) => line.replace(/\s+/g, ' ').trim())
                  .filter(Boolean)
              : []
            const text = lines.join(' ').trim()
            if (!text) return null
            const startMs = Number(event?.tStartMs || 0)
            const durationMs = Number(event?.dDurationMs || 0)
            return {
              text,
              lines,
              startMs,
              durationMs,
              endMs: startMs + durationMs,
            }
          })
          .filter(Boolean)
      )
    }

    const xmlText = await response.text()
    const xml = new DOMParser().parseFromString(xmlText, 'text/xml')
    return normalizeYouTubeTranscriptCues(
      Array.from(xml.querySelectorAll('text'))
        .map((node) => {
          const text = node.textContent?.replace(/\s+/g, ' ').trim() || ''
          if (!text) return null
          const startMs = Math.round(Number(node.getAttribute('start') || 0) * 1000)
          const durationMs = Math.round(Number(node.getAttribute('dur') || 0) * 1000)
          return {
            text,
            lines: [text],
            startMs,
            durationMs,
            endMs: startMs + durationMs,
          }
        })
        .filter(Boolean)
    )
  }

  function getYouTubeCueFromTranscript(currentTimeSeconds) {
    const currentTimeMs = Math.max(0, Math.round(Number(currentTimeSeconds || 0) * 1000))
    if (!Array.isArray(panelState.youtube.transcriptCues) || panelState.youtube.transcriptCues.length === 0) {
      return null
    }

    for (let index = panelState.youtube.transcriptCues.length - 1; index >= 0; index -= 1) {
      const cue = panelState.youtube.transcriptCues[index]
      const startMs = Number(cue?.startMs || 0) - YOUTUBE_CUE_TIME_PADDING_MS
      const endMs =
        Number(cue?.endMs || cue?.startMs || 0) +
        YOUTUBE_CUE_TIME_PADDING_MS +
        YOUTUBE_CUE_PERSIST_MS
      if (currentTimeMs >= startMs && currentTimeMs <= endMs) {
        return cue
      }
    }

    return null
  }

  function ensureYouTubeVideoListeners() {
    const video = document.querySelector('video')
    if (!(video instanceof HTMLVideoElement)) return
    if (youtubeBoundVideo === video) return

    if (youtubeBoundVideo instanceof HTMLVideoElement) {
      youtubeBoundVideo.removeEventListener('timeupdate', youtubeVideoSyncHandler)
      youtubeBoundVideo.removeEventListener('seeked', youtubeVideoSyncHandler)
      youtubeBoundVideo.removeEventListener('playing', youtubeVideoSyncHandler)
      youtubeBoundVideo.removeEventListener('pause', youtubeVideoSyncHandler)
      youtubeBoundVideo.removeEventListener('ratechange', youtubeVideoSyncHandler)
    }

    youtubeVideoSyncHandler = () => {
      try {
        syncYouTubePageState()
      } catch {}
    }
    youtubeBoundVideo = video
    video.addEventListener('timeupdate', youtubeVideoSyncHandler)
    video.addEventListener('seeked', youtubeVideoSyncHandler)
    video.addEventListener('playing', youtubeVideoSyncHandler)
    video.addEventListener('pause', youtubeVideoSyncHandler)
    video.addEventListener('ratechange', youtubeVideoSyncHandler)
  }

  function resetYouTubeSession(options = {}) {
    panelState.youtube.videoId = options.videoId || ''
    panelState.youtube.title = ''
    panelState.youtube.channel = ''
    panelState.youtube.duration = 0
    panelState.youtube.subtitleReady = false
    panelState.youtube.captionsEnabled = false
    panelState.youtube.subtitleLanguage = ''
    panelState.youtube.transcriptTrackKey = ''
    panelState.youtube.transcriptProvider = ''
    panelState.youtube.transcriptStatus = 'idle'
    panelState.youtube.transcriptTranslationStatus = 'idle'
    panelState.youtube.transcriptCues = []
    panelState.youtube.currentCue = {
      text: '',
      lines: [],
      at: 0,
    }
    panelState.youtube.cues = []
    panelState.youtube.translations = {}
    panelState.youtube.translationUnavailable = false
    panelState.youtube.translationProvider = ''
    panelState.youtube.translationNote = ''
    panelState.youtube.lastStatusKey = ''
    youtubeTranslationRequestKey = ''
    youtubeTranscriptRequestKey = ''
    youtubeTranscriptTranslationRequestKey = ''
    youtubeAutoCaptionRequestKey = ''
    if (!options.keepAnalysis) {
      panelState.lastAnalysis = null
    }
    hideInlineTooltip(true)
    if (refs?.youtubeOverlay) {
      refs.youtubeOverlay.classList.add('linswift-hidden')
      refs.youtubeOverlay.innerHTML = ''
      refs.youtubeOverlay.style.top = ''
    }
    if (refs && !options.keepAnalysis) {
      renderResults([])
    }
  }

  function buildYouTubeSegments(limit = 120) {
    const sourceCues =
      Array.isArray(panelState.youtube.transcriptCues) && panelState.youtube.transcriptCues.length > 0
        ? panelState.youtube.transcriptCues
        : panelState.youtube.cues
    const cues = sourceCues.slice(-limit)
    return cues.map((cue) => ({
      text: cue.text,
      tagName: 'subtitle',
    }))
  }

  function shouldPretranslateYouTubeTranscript() {
    return Boolean(
      panelState.youtube.enabled &&
      panelState.extensionState.settings.inlineTranslateEnabled &&
      Array.isArray(panelState.youtube.transcriptCues) &&
      panelState.youtube.transcriptCues.length > 0
    )
  }

  function getCurrentYouTubeCueWordEntries() {
    const cueText = String(panelState.youtube.currentCue.text || '')
    if (!cueText || !Array.isArray(panelState.lastAnalysis?.results)) return []

    const uniqueEntries = new Map()
    const words = cueText.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []
    words.forEach((rawWord) => {
      const normalizedWord = String(rawWord || '').trim().toLowerCase().replace(/[’]/g, "'")
      const entry = panelState.lastAnalysis.results.find(
        (item) => String(item.word || '').trim().toLowerCase() === normalizedWord
      )
      if (entry && !isKnownWord(normalizedWord)) {
        uniqueEntries.set(normalizedWord, entry)
      }
    })

    return Array.from(uniqueEntries.values())
  }

  function buildYouTubeOverlayHtml() {
    const cueLines = Array.isArray(panelState.youtube.currentCue.lines)
      ? panelState.youtube.currentCue.lines.filter(Boolean)
      : []
    const cueText = cueLines.join(' ').trim()
    if (!cueText) return ''

    const mode = getYouTubeSubtitleMode()
    const cueWordEntries = getCurrentYouTubeCueWordEntries()
    if (mode === 'vocab' && cueWordEntries.length === 0) return ''
    const entryMap = new Map(
      cueWordEntries.map((entry) => [String(entry.word || '').trim().toLowerCase(), entry])
    )
    const rawTranslation = panelState.youtube.translations[cueText] || ''
    const translation = rawTranslation && rawTranslation !== cueText ? rawTranslation : ''

    const renderInteractiveLine = (line) => {
      const parts = String(line || '').split(/([A-Za-z]+(?:['’-][A-Za-z]+)*)/g)
      return parts
        .map((part) => {
          const normalizedPart = String(part || '').trim().toLowerCase().replace(/[’]/g, "'")
          const entry = entryMap.get(normalizedPart)
          if (!entry) return escapeHtml(part)
          return `<button class="linswift-youtube-word" type="button" data-youtube-word="${escapeHtml(normalizedPart)}" data-short-meaning="${escapeHtml(shortMeaning(entry.meaning || entry.note || '释义'))}">${escapeHtml(part)}</button>`
        })
        .join('')
    }

    const originalHtml =
      mode === 'vocab'
        ? cueLines
            .map(
              (line) =>
                `<p class="linswift-youtube-overlay-line">${renderInteractiveLine(line)}</p>`
            )
            .join('')
        : cueLines
            .map(
              (line) =>
                `<p class="linswift-youtube-overlay-line">${escapeHtml(line)}</p>`
            )
            .join('')

    const translationHtml =
      mode === 'bilingual' && translation
        ? `<p class="linswift-youtube-overlay-line linswift-youtube-overlay-line--translation">${escapeHtml(translation)}</p>`
        : mode === 'bilingual' && panelState.youtube.translationUnavailable
          ? `<p class="linswift-youtube-overlay-line linswift-youtube-overlay-line--hint">当前视频的整条字幕翻译暂不可用，先显示原文字幕。</p>`
          : mode === 'bilingual' && panelState.youtube.transcriptTranslationStatus === 'loading'
            ? `<p class="linswift-youtube-overlay-line linswift-youtube-overlay-line--hint">正在批量翻译整条字幕，完成后会直接命中缓存。</p>`
          : mode === 'bilingual'
            ? `<p class="linswift-youtube-overlay-line linswift-youtube-overlay-line--hint">等待整条字幕翻译结果同步到当前时间点。</p>`
            : ''

    const chipEntries = cueWordEntries.slice(0, 4)
    const chipHtml =
      mode === 'vocab' && chipEntries.length
        ? `
          <div class="linswift-youtube-chip-row">
            ${chipEntries
              .map(
                (entry) =>
                  `<span class="linswift-youtube-chip">${escapeHtml(entry.word)} · ${escapeHtml(shortMeaning(entry.meaning || entry.note || '释义'))}</span>`
              )
              .join('')}
          </div>
        `
        : ''

    return `
      <div class="linswift-youtube-overlay-card">
        <div class="linswift-youtube-overlay-meta">
          <span>YouTube · ${escapeHtml(getYouTubeSubtitleModeLabel())}</span>
          <span>${escapeHtml(getTranslationLanguageLabel())} · ${escapeHtml(getTranslationModeLabel())}</span>
        </div>
        ${originalHtml}
        ${translationHtml}
        ${chipHtml}
      </div>
    `
  }

  function positionYouTubeOverlay() {
    if (!refs?.youtubeOverlay || refs.youtubeOverlay.classList.contains('linswift-hidden')) return
    const overlayHost = refs.youtubeOverlay.parentElement
    const hostRect = overlayHost?.getBoundingClientRect?.() || {
      top: 0,
      left: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    }
    const captionContainer =
      overlayHost?.querySelector?.('.caption-window.ytp-caption-window-container, .ytp-caption-window-container') ||
      document.querySelector('.caption-window.ytp-caption-window-container, .ytp-caption-window-container')
    const rect = captionContainer?.getBoundingClientRect?.()
    if (rect && rect.width > 0) {
      const nextTop = Math.min(
        Math.max(16, rect.bottom - hostRect.top + 10),
        Math.max(16, hostRect.height - 180)
      )
      refs.youtubeOverlay.style.top = `${Math.round(nextTop)}px`
      return
    }

    refs.youtubeOverlay.style.top = `${Math.max(16, hostRect.height - 220)}px`
  }

  function getFloatingHostElement() {
    const fullscreenElement = document.fullscreenElement
    if (panelState.youtube.enabled && fullscreenElement instanceof HTMLElement) {
      return fullscreenElement
    }

    return document.documentElement
  }

  function getYouTubeOverlayHostElement() {
    if (!panelState.youtube.enabled) return refs?.root || document.getElementById(PANEL_ROOT_ID)

    const videoPlayer =
      document.querySelector('#movie_player.html5-video-player') ||
      document.querySelector('#movie_player') ||
      document.querySelector('.html5-video-player')

    const fullscreenElement = document.fullscreenElement
    if (fullscreenElement instanceof HTMLElement) {
      if (fullscreenElement.matches?.('#movie_player, .html5-video-player, ytd-player')) {
        return fullscreenElement
      }

      const nestedPlayer =
        fullscreenElement.querySelector?.('#movie_player, .html5-video-player') ||
        fullscreenElement.closest?.('#movie_player, .html5-video-player')
      if (nestedPlayer instanceof HTMLElement) {
        return nestedPlayer
      }
    }

    return videoPlayer || refs?.root || document.getElementById(PANEL_ROOT_ID)
  }

  function syncYouTubeOverlayHostElement() {
    if (!refs?.youtubeOverlay) return

    const nextHost = getYouTubeOverlayHostElement()
    if (!nextHost || refs.youtubeOverlay.parentElement === nextHost) return

    refs.youtubeOverlay.remove()
    nextHost.appendChild(refs.youtubeOverlay)
    positionYouTubeOverlay()
  }

  function syncFloatingHostElement() {
    const root = refs?.root || document.getElementById(PANEL_ROOT_ID)
    if (!root) return

    const nextHost = getFloatingHostElement()
    if (!nextHost || root.parentElement === nextHost) return

    nextHost.appendChild(root)
    syncYouTubeOverlayHostElement()
    positionYouTubeOverlay()
  }

  async function pretranslateYouTubeTranscript(cues) {
    if (!Array.isArray(cues) || cues.length === 0) return
    const requestKey = [
      panelState.youtube.videoId,
      panelState.youtube.transcriptTrackKey,
      getTranslationLanguage(),
      getTranslationMode(),
    ].join('::')

    if (
      youtubeTranscriptTranslationRequestKey === requestKey &&
      panelState.youtube.transcriptTranslationStatus === 'loading'
    ) {
      return
    }

    const uniqueLines = Array.from(
      new Set(
        cues
          .map((cue) => String(cue?.text || '').trim())
          .filter(Boolean)
      )
    )

    if (uniqueLines.length === 0) return

    youtubeTranscriptTranslationRequestKey = requestKey
    panelState.youtube.transcriptTranslationStatus = 'loading'
    panelState.youtube.translationProvider = ''
    panelState.youtube.translationNote = ''
    renderSummary()

    let translatedAny = false
    let unavailable = false

    try {
      for (let start = 0; start < uniqueLines.length; start += YOUTUBE_TRANSLATION_BATCH_SIZE) {
        if (youtubeTranscriptTranslationRequestKey !== requestKey) return

        const batch = uniqueLines.slice(start, start + YOUTUBE_TRANSLATION_BATCH_SIZE)
        const response = await sendRuntimeMessage({
          type: 'panel-translate-lines',
          lines: batch,
          targetLanguage: getTranslationLanguage(),
          translationMode: getTranslationMode(),
        })
        panelState.youtube.translationProvider = String(response.provider || '')
        panelState.youtube.translationNote = String(response.note || '')

        const translatedLines = Array.isArray(response.lines) ? response.lines : []
        let batchUpdated = false

        batch.forEach((line, index) => {
          const translated = String(translatedLines[index] || '').trim()
          if (translated && translated !== line) {
            panelState.youtube.translations[line] = translated
            translatedAny = true
            batchUpdated = true
          }
        })

        unavailable = unavailable || Boolean(response.unavailable)

        if (batchUpdated && batch.includes(panelState.youtube.currentCue.text)) {
          renderYouTubeOverlay()
        }

        renderSummary()
      }

      if (youtubeTranscriptTranslationRequestKey !== requestKey) return

      panelState.youtube.translationUnavailable = unavailable && !translatedAny
      panelState.youtube.transcriptTranslationStatus = 'ready'
      renderYouTubeOverlay()
      renderSummary()
    } catch {
      if (youtubeTranscriptTranslationRequestKey !== requestKey) return
      panelState.youtube.translationUnavailable = true
      panelState.youtube.transcriptTranslationStatus = 'error'
      renderYouTubeOverlay()
      renderSummary()
    }
  }

  async function ensureYouTubeTranscriptPrefetch() {
    if (!panelState.youtube.enabled || !panelState.youtube.videoId) return
    if (youtubeTranscriptRequestKey === panelState.youtube.videoId) return
    if (panelState.youtube.transcriptStatus === 'ready' && panelState.youtube.transcriptCues.length > 0) {
      return
    }

    youtubeTranscriptRequestKey = panelState.youtube.videoId
    panelState.youtube.transcriptStatus = 'loading'
    renderSummary()

    try {
      const bridgedTranscript = await requestYouTubeTranscriptFromPage().catch(() => null)
      if (Array.isArray(bridgedTranscript?.cues) && bridgedTranscript.cues.length > 0) {
        applyYouTubeTranscriptResult(bridgedTranscript.cues, {
          trackKey:
            bridgedTranscript.trackKey || `page-transcript::${panelState.youtube.videoId}`,
          languageCode: bridgedTranscript.languageCode || panelState.youtube.subtitleLanguage,
          provider: bridgedTranscript.provider || '页面 transcript',
        })
        syncYouTubePageState()
        renderSummary()

        if (shouldPretranslateYouTubeTranscript()) {
          void pretranslateYouTubeTranscript(panelState.youtube.transcriptCues)
        }
        return
      }

      const tracklist = await readYouTubeCaptionTracklistFromPage()
      const selectedTrack = chooseYouTubeCaptionTrack(tracklist)

      if (!selectedTrack) {
        panelState.youtube.transcriptStatus = 'empty'
        panelState.youtube.subtitleLanguage = ''
        panelState.youtube.transcriptProvider = ''
        renderSummary()
        return
      }

      const cues = await fetchYouTubeTranscriptCues(selectedTrack)
      applyYouTubeTranscriptResult(cues, {
        trackKey: buildYouTubeTrackKey(selectedTrack),
        languageCode: selectedTrack.languageCode,
        provider: '字幕轨道',
      })
      syncYouTubePageState()
      renderSummary()

      if (panelState.youtube.transcriptCues.length > 0 && shouldPretranslateYouTubeTranscript()) {
        void pretranslateYouTubeTranscript(panelState.youtube.transcriptCues)
      }
    } catch {
      panelState.youtube.transcriptStatus = 'error'
      panelState.youtube.transcriptProvider = ''
      renderSummary()
    } finally {
      if (youtubeTranscriptRequestKey === panelState.youtube.videoId) {
        youtubeTranscriptRequestKey = ''
      }
    }
  }

  async function queueYouTubeCueTranslation(cueText) {
    if (!cueText || panelState.youtube.translations[cueText]) return
    if (youtubeTranslationRequestKey === cueText) return

    youtubeTranslationRequestKey = cueText
    try {
      const response = await sendRuntimeMessage({
        type: 'panel-translate-lines',
        lines: [cueText],
        targetLanguage: getTranslationLanguage(),
        translationMode: getTranslationMode(),
      })
      panelState.youtube.translationProvider = String(response.provider || '')
      panelState.youtube.translationNote = String(response.note || '')

      const translatedLine = Array.isArray(response.lines) ? String(response.lines[0] || '') : ''
      panelState.youtube.translationUnavailable = Boolean(response.unavailable)
      if (translatedLine && translatedLine !== cueText) {
        panelState.youtube.translations[cueText] = translatedLine
      }
      if (panelState.youtube.currentCue.text === cueText) {
        renderYouTubeOverlay()
      }
    } catch {
      panelState.youtube.translationUnavailable = true
      if (panelState.youtube.currentCue.text === cueText) {
        renderYouTubeOverlay()
      }
    } finally {
      if (youtubeTranslationRequestKey === cueText) {
        youtubeTranslationRequestKey = ''
      }
    }
  }

  function renderYouTubeOverlay() {
    if (!refs?.youtubeOverlay) return
    syncYouTubeOverlayHostElement()
    if (
      !panelState.youtube.enabled ||
      !panelState.extensionState.settings.inlineTranslateEnabled ||
      getYouTubeSubtitleMode() === 'original'
    ) {
      refs.youtubeOverlay.classList.add('linswift-hidden')
      refs.youtubeOverlay.innerHTML = ''
      return
    }

    const cueText = String(panelState.youtube.currentCue.text || '').trim()
    const html = buildYouTubeOverlayHtml()
    if (!cueText || !html) {
      refs.youtubeOverlay.classList.add('linswift-hidden')
      refs.youtubeOverlay.innerHTML = ''
      return
    }

    refs.youtubeOverlay.innerHTML = html
    refs.youtubeOverlay.classList.remove('linswift-hidden')
    refs.youtubeOverlay.querySelectorAll('[data-youtube-word]').forEach((button) => {
      button.addEventListener('click', () => {
        const word = button.getAttribute('data-youtube-word') || ''
        void showInlineTooltipForWord(word, button, { pinned: true })
      })
    })
    positionYouTubeOverlay()

    if (
      getYouTubeSubtitleMode() === 'bilingual' &&
      panelState.youtube.transcriptCues.length === 0
    ) {
      void queueYouTubeCueTranslation(cueText)
    }
  }

  function syncYouTubePageState() {
    const enabled = isYouTubeWatchPage()
    syncFloatingHostElement()
    ensureYouTubeVideoListeners()

    if (!enabled) {
      if (panelState.youtube.enabled) {
        panelState.youtube.enabled = false
        resetYouTubeSession()
        renderSummary()
      }
      return
    }

    const previousStateKey = JSON.stringify({
      enabled: panelState.youtube.enabled,
      videoId: panelState.youtube.videoId,
      captionsEnabled: panelState.youtube.captionsEnabled,
      subtitleReady: panelState.youtube.subtitleReady,
      cueText: panelState.youtube.currentCue.text,
      cueCount: panelState.youtube.cues.length,
    })
    const nextVideoId = getYouTubeVideoId()
    if (!panelState.youtube.enabled) {
      panelState.youtube.enabled = true
    }

    if (nextVideoId && nextVideoId !== panelState.youtube.videoId) {
      resetYouTubeSession({ videoId: nextVideoId })
    }

    const meta = readYouTubeMeta()
    panelState.youtube.videoId = nextVideoId
    panelState.youtube.title = meta.title
    panelState.youtube.channel = meta.channel
    panelState.youtube.duration = meta.duration
    panelState.youtube.captionsEnabled = areYouTubeCaptionsEnabled()

    const transcriptCue = getYouTubeCueFromTranscript(meta.currentTime)
    const liveCueLines = collectYouTubeCaptionLines()
    const liveCueText = liveCueLines.join(' ').replace(/\s+/g, ' ').trim()
    const cueLines =
      Array.isArray(transcriptCue?.lines) && transcriptCue.lines.length > 0
        ? transcriptCue.lines
        : liveCueLines
    const cueText =
      String(transcriptCue?.text || '').trim() ||
      liveCueText
    panelState.youtube.subtitleReady =
      panelState.youtube.transcriptCues.length > 0 ||
      (panelState.youtube.captionsEnabled && (cueLines.length > 0 || panelState.youtube.cues.length > 0))

    if (
      cueText &&
      cueText !== panelState.youtube.currentCue.text
    ) {
      panelState.youtube.currentCue = {
        text: cueText,
        lines: cueLines,
        at: meta.currentTime,
      }

      const lastCue = panelState.youtube.cues[panelState.youtube.cues.length - 1]
      if (!lastCue || lastCue.text !== cueText) {
        panelState.youtube.cues.push({
          text: cueText,
          lines: cueLines,
          at: meta.currentTime,
        })
        if (panelState.youtube.cues.length > YOUTUBE_SUBTITLE_HISTORY_LIMIT) {
          panelState.youtube.cues.shift()
        }
      }

      renderYouTubeOverlay()
      renderSummary()
    } else if (!cueText && panelState.youtube.currentCue.text) {
      panelState.youtube.currentCue = {
        text: '',
        lines: [],
        at: meta.currentTime,
      }
      renderYouTubeOverlay()
    }

    if (
      panelState.youtube.transcriptStatus === 'idle' ||
      (panelState.youtube.transcriptStatus === 'ready' &&
        panelState.youtube.transcriptCues.length === 0 &&
        panelState.youtube.videoId)
    ) {
      void ensureYouTubeTranscriptPrefetch()
    }

    const nextStateKey = JSON.stringify({
      enabled: panelState.youtube.enabled,
      videoId: panelState.youtube.videoId,
      captionsEnabled: panelState.youtube.captionsEnabled,
      subtitleReady: panelState.youtube.subtitleReady,
      cueText: panelState.youtube.currentCue.text,
      cueCount: panelState.youtube.cues.length,
    })
    if (nextStateKey !== previousStateKey) {
      renderSummary()
    }
  }

  function ensureYouTubePolling() {
    if (youtubePollTimer) return
    youtubePollTimer = window.setInterval(() => {
      try {
        syncYouTubePageState()
      } catch {}
    }, YOUTUBE_POLL_INTERVAL)
    syncYouTubePageState()
  }

  async function bootstrapYouTubeSession() {
    syncYouTubePageState()
    if (!panelState.youtube.enabled) return

    await Promise.allSettled([ensureYouTubeTranscriptPrefetch()])
    syncYouTubePageState()
    renderSummary()
    renderYouTubeOverlay()
  }

  function clearHighlights() {
    while (highlightRecords.length > 0) {
      const item = highlightRecords.pop()
      if (!item?.mark?.isConnected) continue
      const textNode = document.createTextNode(item.mark.textContent || '')
      item.mark.replaceWith(textNode)
      item.parent?.normalize?.()
    }
  }

  function clearInlineTranslations() {
    hideInlineTooltip(true)
    while (inlineAnnotationRecords.length > 0) {
      const item = inlineAnnotationRecords.pop()
      if (!item?.wrapper?.isConnected) continue
      const textNode = document.createTextNode(
        item.text || item.word || item.wrapper.dataset.word || ''
      )
      item.wrapper.replaceWith(textNode)
      item.parent?.normalize?.()
    }
  }

  function clearSelectionHighlight() {
    selectionHighlightRecord?.overlays?.forEach((overlay) => {
      overlay?.remove?.()
    })
    selectionHighlightRecord?.anchor?.remove?.()
    selectionHighlightRecord?.parent?.normalize?.()
    selectionHighlightRecord = null
  }

  function normalizeSelectionWord(text) {
    const normalized = String(text || '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[^A-Za-z]+/, '')
      .replace(/[^A-Za-z'’-]+$/, '')

    if (!normalized || normalized.includes(' ')) return ''
    if (!/^[A-Za-z][A-Za-z'’-]{0,47}$/.test(normalized)) return ''

    return normalized
      .toLowerCase()
      .replace(/[’]/g, "'")
  }

  function collapseWhitespace(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function normalizeSentenceSelection(text) {
    const normalized = collapseWhitespace(text)
      .replace(/^[“"'\s(\[]+/, '')
      .replace(/[”"'\s)\].,;:!?]+$/, '')

    if (!normalized || normalizeSelectionWord(normalized)) return ''
    if (!/[A-Za-z]/.test(normalized)) return ''

    const tokenCount = (normalized.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []).length
    if (tokenCount < 3 || normalized.length < 14) return ''

    return normalized.slice(0, SENTENCE_SELECTION_MAX_CHARS)
  }

  function buildSentenceSelectionContext(range, sentence) {
    const baseElement =
      range.commonAncestorContainer instanceof Element
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement
    const scopeElement = baseElement?.closest('p, li, blockquote, article, section, div') || baseElement
    const scopeText = collapseWhitespace(scopeElement?.textContent || '')
    const normalizedSentence = collapseWhitespace(sentence)

    if (!scopeText || !normalizedSentence) {
      return { before: '', after: '' }
    }

    const index = scopeText.indexOf(normalizedSentence)
    if (index < 0) {
      return { before: '', after: '' }
    }

    const before = scopeText.slice(Math.max(0, index - 88), index).trim()
    const after = scopeText
      .slice(index + normalizedSentence.length, index + normalizedSentence.length + 88)
      .trim()

    return {
      before: before ? (index > 88 ? `…${before}` : before) : '',
      after: after
        ? index + normalizedSentence.length + 88 < scopeText.length
          ? `${after}…`
          : after
        : '',
    }
  }

  function applySelectionHighlight(range, word) {
    if (!range || range.collapsed) return null

    const rects = Array.from(range.getClientRects())
      .map((rect) => ({
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }))
      .filter((rect) => rect.width > 0 && rect.height > 0)

    if (rects.length === 0) {
      const fallback = range.getBoundingClientRect()
      if (fallback.width > 0 && fallback.height > 0) {
        rects.push({
          left: Math.round(fallback.left),
          top: Math.round(fallback.top),
          width: Math.round(fallback.width),
          height: Math.round(fallback.height),
        })
      }
    }

    if (rects.length === 0) return null

    const overlays = rects.map((rect) => {
      const overlay = document.createElement('span')
      overlay.className = `${SELECTION_HIGHLIGHT_CLASS} ${SELECTION_HIGHLIGHT_OVERLAY_CLASS}`
      overlay.dataset.word = word
      overlay.style.left = `${rect.left}px`
      overlay.style.top = `${rect.top}px`
      overlay.style.width = `${rect.width}px`
      overlay.style.height = `${rect.height}px`
      document.body.appendChild(overlay)
      return overlay
    })

    const anchorRect = rects[0]
    const anchor = document.createElement('span')
    anchor.className = `${SELECTION_HIGHLIGHT_CLASS} ${SELECTION_HIGHLIGHT_ANCHOR_CLASS}`
    anchor.dataset.word = word
    anchor.style.left = `${anchorRect.left}px`
    anchor.style.top = `${anchorRect.top + anchorRect.height}px`
    document.body.appendChild(anchor)

    selectionHighlightRecord = {
      overlays,
      anchor,
      word,
    }

    return anchor
  }

  function getSelectionLookupTarget() {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null

    const rawText = selection.toString()
    const range = selection.getRangeAt(0)
    const parentElement =
      range.commonAncestorContainer instanceof Element
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement

    if (!parentElement || shouldIgnoreNode(parentElement)) return null
    if (parentElement.closest('.linswift-inline-annotation')) return null

    const word = normalizeSelectionWord(rawText)
    if (word) {
      return { type: 'word', selection, range, word }
    }

    const sentence = normalizeSentenceSelection(rawText)
    if (!sentence) return null

    return {
      type: 'sentence',
      selection,
      range,
      sentence,
      ...buildSentenceSelectionContext(range, sentence),
    }
  }

  function removeInlineAnnotationsForWord(word) {
    const normalizedWord = String(word || '').trim().toLowerCase()
    if (!normalizedWord) return 0

    let removed = 0

    for (let index = inlineAnnotationRecords.length - 1; index >= 0; index -= 1) {
      const item = inlineAnnotationRecords[index]
      const currentWord = String(item?.word || item?.wrapper?.dataset.word || '').trim().toLowerCase()
      if (currentWord !== normalizedWord) continue

      inlineAnnotationRecords.splice(index, 1)
      if (!item?.wrapper?.isConnected) continue
      const textNode = document.createTextNode(
        item.text || item.word || item.wrapper.dataset.word || ''
      )
      item.wrapper.replaceWith(textNode)
      item.parent?.normalize?.()
      removed += 1
    }

    if (activeInlineWord === normalizedWord) {
      hideInlineTooltip(true)
    }

    return removed
  }

  function shortMeaning(meaning) {
    const raw = String(meaning || '')
      .replace(/^（|）$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!raw) return '释义'

    const firstPart = raw
      .split(/[；;。.!?\n]/)[0]
      .split(/[，,]/)[0]
      .trim()

    return firstPart.length > 18 ? `${firstPart.slice(0, 18)}…` : firstPart
  }

  function getTranslationLanguage() {
    const key = panelState.extensionState.settings.translationLanguage || 'zh-CN'
    return TRANSLATION_LANGUAGE_OPTIONS[key] ? key : 'zh-CN'
  }

  function getTranslationLanguageLabel() {
    return TRANSLATION_LANGUAGE_OPTIONS[getTranslationLanguage()] || '简中'
  }

  function getTranslationMode() {
    const key = panelState.extensionState.settings.translationMode || 'ai'
    return TRANSLATION_MODE_OPTIONS[key] ? key : 'ai'
  }

  function getTranslationModeLabel() {
    return TRANSLATION_MODE_OPTIONS[getTranslationMode()] || 'AI'
  }

  function getPronunciationVariant() {
    const key = panelState.extensionState.settings.pronunciationVariant || 'both'
    return PRONUNCIATION_VARIANT_OPTIONS[key] ? key : 'both'
  }

  function getWordDetailCacheKey(word, targetLanguage = getTranslationLanguage()) {
    const normalizedWord = String(word || '').trim().toLowerCase()
    const safeLanguage = TRANSLATION_LANGUAGE_OPTIONS[targetLanguage] ? targetLanguage : 'zh-CN'
    return `${safeLanguage}::${normalizedWord}`
  }

  function getCachedWordDetail(word, targetLanguage = getTranslationLanguage()) {
    return wordDetailCache.get(getWordDetailCacheKey(word, targetLanguage)) || null
  }

  function applyStoredExtensionState(storedState = {}, options = {}) {
    const { render = true } = options
    const previousLanguage = getTranslationLanguage()
    const previousMode = getTranslationMode()

    if (
      storedState &&
      typeof storedState[SETTINGS_STORAGE_KEY] === 'object' &&
      storedState[SETTINGS_STORAGE_KEY] !== null
    ) {
      panelState.extensionState.settings = {
        ...panelState.extensionState.settings,
        ...storedState[SETTINGS_STORAGE_KEY],
      }
    }

    if (Array.isArray(storedState?.[KNOWN_WORDS_STORAGE_KEY])) {
      panelState.extensionState.knownWords = storedState[KNOWN_WORDS_STORAGE_KEY]
    }

    if (
      storedState &&
      typeof storedState[SAVED_WORDS_STORAGE_KEY] === 'object' &&
      storedState[SAVED_WORDS_STORAGE_KEY] !== null
    ) {
      panelState.extensionState.savedWords = storedState[SAVED_WORDS_STORAGE_KEY]
    }

    const nextLanguage = getTranslationLanguage()
    const nextMode = getTranslationMode()

    if (previousLanguage !== nextLanguage || previousMode !== nextMode) {
      wordDetailCache.clear()
      hideInlineTooltip(true)
      hideSentencePopup(true)
    }

    applyUiScale()
    applyPanelSize()

    if (render && refs) {
      renderSummary()
      renderSavedWords()
    }
  }

  async function refreshExtensionStateFromStorage(options = {}) {
    try {
      const storedState = await chrome.storage.sync.get([
        SETTINGS_STORAGE_KEY,
        KNOWN_WORDS_STORAGE_KEY,
        SAVED_WORDS_STORAGE_KEY,
      ])
      applyStoredExtensionState(storedState, options)
    } catch {}
  }

  function updateInlineTranslationForWord(word, meaning) {
    const normalizedWord = String(word || '').trim().toLowerCase()
    if (!normalizedWord || !meaning) return 0

    let updated = 0
    inlineAnnotationRecords.forEach((item) => {
      if (!item?.wrapper?.isConnected) return
      const currentWord = String(item.word || item.wrapper.dataset.word || '').trim().toLowerCase()
      if (currentWord !== normalizedWord) return
      const translationNode = item.wrapper.querySelector('.linswift-inline-translation')
      if (!translationNode) return
      translationNode.textContent = shortMeaning(meaning)
      updated += 1
    })

    return updated
  }

  function syncInlineTranslationsFromCache(results) {
    if (!Array.isArray(results) || results.length === 0) return

    results.forEach((item) => {
      const normalizedWord = String(item?.word || '').trim().toLowerCase()
      if (!normalizedWord) return
      const cached = getCachedWordDetail(normalizedWord)
      const meaning = cached?.meaning || item?.meaning || item?.note || ''
      if (!meaning) return
      updateInlineTranslationForWord(normalizedWord, meaning)
    })
  }

  function buildStudyCards(results) {
    if (!Array.isArray(results)) return []
    return results.map((item, index) => ({
      id: `${String(item.word || '').trim().toLowerCase() || 'word'}-${index}`,
      word: String(item.word || '').trim(),
      phonetic: String(item.phonetic || '').trim(),
      meaning: String(item.meaning || '').trim(),
      note: String(item.note || '').trim(),
      example: String(item.snippet || '').trim(),
    }))
  }

  function getResultEntry(word) {
    const normalizedWord = String(word || '').trim().toLowerCase()
    return panelState.lastAnalysis?.results?.find(
      (item) => String(item.word || '').trim().toLowerCase() === normalizedWord
    ) || null
  }

  function getWordDetailFallback(word) {
    const resultEntry = getResultEntry(word)
    return {
      word,
      phonetic: resultEntry?.phonetic || '',
      phoneticUk: resultEntry?.phonetic || '',
      phoneticUs: resultEntry?.phonetic || '',
      audioUk: '',
      audioUs: '',
      meaning: resultEntry?.meaning || '正在补充详细释义...',
      note: resultEntry?.note || '悬浮查看完整词卡',
      senses: resultEntry?.meaning
        ? [{ partOfSpeech: '', definition: resultEntry.meaning, example: '' }]
        : [],
      examples: resultEntry?.snippet ? [resultEntry.snippet] : [],
    }
  }

  function primeWordDetailCache(results) {
    if (!Array.isArray(results)) return

    results.forEach((item) => {
      const normalizedWord = String(item?.word || '').trim().toLowerCase()
      if (!normalizedWord) return
      const cacheKey = getWordDetailCacheKey(normalizedWord)
      const existing = wordDetailCache.get(cacheKey) || {}
      wordDetailCache.set(cacheKey, {
        word: normalizedWord,
        phonetic: item?.phonetic || existing.phonetic || '',
        phoneticUk: item?.phoneticUk || existing.phoneticUk || item?.phonetic || '',
        phoneticUs: item?.phoneticUs || existing.phoneticUs || item?.phonetic || '',
        audioUk: item?.audioUk || existing.audioUk || '',
        audioUs: item?.audioUs || existing.audioUs || '',
        meaning: item?.meaning || existing.meaning || '暂无释义',
        note: item?.note || existing.note || '',
        senses:
          Array.isArray(item?.senses) && item.senses.length > 0
            ? item.senses
            : Array.isArray(existing.senses)
              ? existing.senses
              : [],
        examples:
          Array.isArray(existing.examples) && existing.examples.length > 0
            ? existing.examples
            : item?.snippet
              ? [item.snippet]
              : [],
      })
      updateInlineTranslationForWord(
        normalizedWord,
        item?.meaning || existing.meaning || item?.note || ''
      )
    })
  }

  function clearInlineTooltipHideTimer() {
    if (inlineTooltipHideTimer) {
      window.clearTimeout(inlineTooltipHideTimer)
      inlineTooltipHideTimer = null
    }
  }

  function getSavedEntryForWord(word) {
    return panelState.extensionState.savedWords[String(word || '').trim().toLowerCase()] || null
  }

  function isKnownWord(word) {
    const normalizedWord = String(word || '').trim().toLowerCase()
    return panelState.extensionState.knownWords.some((item) => item === normalizedWord)
  }

  function renderTooltipContent(detail) {
    if (!refs?.tooltip) return

    const normalizedWord = String(detail?.word || activeInlineWord || '').trim().toLowerCase()
    const savedEntry = getSavedEntryForWord(normalizedWord)
    const known = isKnownWord(normalizedWord)
    const examples = Array.isArray(detail?.examples) ? detail.examples.filter(Boolean).slice(0, 2) : []
    const senses = Array.isArray(detail?.senses) ? detail.senses.filter((item) => item?.definition).slice(0, 4) : []
    const phoneticUk = detail?.phoneticUk || detail?.phonetic || ''
    const phoneticUs = detail?.phoneticUs || detail?.phonetic || ''
    const note = detail?.note ? `<p class="linswift-tooltip-note">${escapeHtml(detail.note)}</p>` : ''
    const examplesHtml = examples.length
      ? `
        <ul class="linswift-tooltip-examples">
          ${examples
            .map(
              (example) => `<li class="linswift-tooltip-example">${escapeHtml(example)}</li>`
            )
            .join('')}
        </ul>
        `
        : ''
    const meaningsHtml = (senses.length ? senses : [{ partOfSpeech: '', definition: detail?.meaning || '暂无释义' }])
      .map((sense) => `
        <p class="linswift-tooltip-meaning-row">
          ${sense.partOfSpeech ? `<span class="linswift-tooltip-meaning-pos">${escapeHtml(`${sense.partOfSpeech}.`)}</span>` : ''}
          ${escapeHtml(sense.definition || '')}
        </p>
      `)
      .join('')
    const pronunciationRows = [
      phoneticUk
        ? `
          <div class="linswift-tooltip-pronunciation">
            <span class="linswift-tooltip-pronunciation-label">英</span>
            <span class="linswift-tooltip-pronunciation-value">${escapeHtml(phoneticUk)}</span>
            <button class="linswift-tooltip-audio" type="button" data-tooltip-action="speak-uk" aria-label="播放英式发音">🔊</button>
          </div>
        `
        : '',
      phoneticUs
        ? `
          <div class="linswift-tooltip-pronunciation">
            <span class="linswift-tooltip-pronunciation-label">美</span>
            <span class="linswift-tooltip-pronunciation-value">${escapeHtml(phoneticUs)}</span>
            <button class="linswift-tooltip-audio" type="button" data-tooltip-action="speak-us" aria-label="播放美式发音">🔊</button>
          </div>
        `
        : '',
    ].filter(Boolean).join('')

    refs.tooltip.dataset.loading = 'false'
    refs.tooltip.innerHTML = `
      <div class="linswift-tooltip-top">
        <div class="linswift-tooltip-title-wrap">
          <p class="linswift-tooltip-word">${escapeHtml(normalizedWord || detail?.word || '')}</p>
        </div>
        <div class="linswift-tooltip-top-actions">
          <button class="linswift-tooltip-icon-button" type="button" data-tooltip-action="close" aria-label="关闭">×</button>
          <button class="linswift-tooltip-icon-button" type="button" data-tooltip-action="search" aria-label="搜索">⌕</button>
        </div>
      </div>
      <div class="linswift-tooltip-divider"></div>
      ${pronunciationRows ? `
        <div class="linswift-tooltip-pronunciations">
          <div class="linswift-tooltip-pronunciation-list">${pronunciationRows}</div>
          <button class="linswift-tooltip-save" type="button" data-tooltip-action="save" data-active="${savedEntry ? 'true' : 'false'}" aria-label="${savedEntry ? '取消收藏' : '收藏'}">${savedEntry ? '★' : '☆'}</button>
        </div>
      ` : ''}
      <div class="linswift-tooltip-meanings">${meaningsHtml}</div>
      ${note}
      <div class="linswift-tooltip-meta">
        <span class="linswift-tooltip-chip">${known ? '已会' : activeTooltipSource === 'selection' ? '选词翻译' : '点击可定位与操作'}</span>
      </div>
      ${examplesHtml}
      <div class="linswift-tooltip-actions">
        <button class="linswift-button" type="button" data-tooltip-action="speak">默认发音</button>
        <button class="linswift-button ${known ? 'linswift-button--primary' : ''}" type="button" data-tooltip-action="known">
          ${known ? '已会' : '标记已会'}
        </button>
      </div>
    `

    refs.tooltip
      .querySelector('[data-tooltip-action="speak"]')
      ?.addEventListener('click', () => pronounceWord(normalizedWord, getPronunciationVariant(), detail))
    refs.tooltip
      .querySelector('[data-tooltip-action="speak-uk"]')
      ?.addEventListener('click', () => pronounceWord(normalizedWord, 'uk', detail))
    refs.tooltip
      .querySelector('[data-tooltip-action="speak-us"]')
      ?.addEventListener('click', () => pronounceWord(normalizedWord, 'us', detail))
    refs.tooltip
      .querySelector('[data-tooltip-action="save"]')
      ?.addEventListener('click', () => {
        void handleTooltipSave(normalizedWord)
      })
    refs.tooltip
      .querySelector('[data-tooltip-action="close"]')
      ?.addEventListener('click', () => {
        hideInlineTooltip(true)
      })
    refs.tooltip
      .querySelector('[data-tooltip-action="search"]')
      ?.addEventListener('click', () => {
        window.open(`https://www.google.com/search?q=${encodeURIComponent(`${normalizedWord} meaning`)}`, '_blank')
      })
    refs.tooltip
      .querySelector('[data-tooltip-action="known"]')
      ?.addEventListener('click', () => {
        void handleTooltipKnown(normalizedWord)
      })
  }

  function showTooltipLoading(word) {
    if (!refs?.tooltip) return

    const normalizedWord = String(word || '').trim().toLowerCase()
    refs.tooltip.dataset.loading = 'true'
    refs.tooltip.innerHTML = `
      <div class="linswift-tooltip-top">
        <div>
          <p class="linswift-tooltip-word">${escapeHtml(normalizedWord)}</p>
          <p class="linswift-tooltip-phonetic">正在加载详细词卡...</p>
        </div>
      </div>
      <p class="linswift-tooltip-loading">正在拉取释义、音标、例句和收藏状态。</p>
    `
  }

  function setActiveInlineAnnotation(word) {
    const normalizedWord = String(word || '').trim().toLowerCase()
    inlineAnnotationRecords.forEach((item) => {
      if (!item?.wrapper?.isConnected) return
      const currentWord = String(item.word || item.wrapper.dataset.word || '').trim().toLowerCase()
      if (currentWord === normalizedWord) {
        item.wrapper.dataset.active = 'true'
      } else {
        delete item.wrapper.dataset.active
      }
    })
  }

  function positionInlineTooltip(anchorElement) {
    if (!refs?.tooltip || !anchorElement?.isConnected) return

    positionFloatingCard(refs.tooltip, anchorElement)
  }

  function resolveFloatingAnchorRect(anchorTarget) {
    if (!anchorTarget) return null
    if (
      typeof anchorTarget?.left === 'number' &&
      typeof anchorTarget?.top === 'number' &&
      typeof anchorTarget?.width === 'number' &&
      typeof anchorTarget?.height === 'number'
    ) {
      return anchorTarget
    }
    if (anchorTarget instanceof Range) {
      const rect = anchorTarget.getBoundingClientRect()
      if (rect?.width > 0 || rect?.height > 0) return rect
      return null
    }
    if (anchorTarget?.isConnected && typeof anchorTarget.getBoundingClientRect === 'function') {
      return anchorTarget.getBoundingClientRect()
    }
    return null
  }

  function positionFloatingCard(cardElement, anchorTarget) {
    if (!cardElement) return

    const rect = resolveFloatingAnchorRect(anchorTarget)
    if (!rect) return
    const tooltipRect = cardElement.getBoundingClientRect()
    const gap = 10
    let left = rect.left
    let top = rect.bottom + gap

    if (left + tooltipRect.width > window.innerWidth - 12) {
      left = window.innerWidth - tooltipRect.width - 12
    }
    if (left < 12) left = 12

    if (top + tooltipRect.height > window.innerHeight - 12) {
      top = rect.top - tooltipRect.height - gap
    }
    if (top < 12) {
      top = Math.min(window.innerHeight - tooltipRect.height - 12, rect.bottom + gap)
    }

    cardElement.style.left = `${Math.round(left)}px`
    cardElement.style.top = `${Math.round(top)}px`
  }

  function snapshotFloatingAnchorRect(anchorTarget) {
    const rect = resolveFloatingAnchorRect(anchorTarget)
    if (!rect) return null
    return {
      left: Number(rect.left) || 0,
      top: Number(rect.top) || 0,
      width: Number(rect.width) || 0,
      height: Number(rect.height) || 0,
      right: Number(rect.right) || (Number(rect.left) || 0) + (Number(rect.width) || 0),
      bottom: Number(rect.bottom) || (Number(rect.top) || 0) + (Number(rect.height) || 0),
    }
  }

  function hideInlineTooltip(force = false) {
    clearInlineTooltipHideTimer()
    if (!refs?.tooltip) return
    if (!force && inlineTooltipPinned) return

    const shouldClearSelectionHighlight = activeTooltipSource === 'selection'
    activeInlineWord = ''
    activeTooltipSource = ''
    inlineTooltipPinned = false
    refs.tooltip.classList.add('linswift-hidden')
    refs.tooltip.style.left = ''
    refs.tooltip.style.top = ''
    refs.tooltip.innerHTML = ''
    inlineAnnotationRecords.forEach((item) => {
      if (item?.wrapper?.isConnected) {
        delete item.wrapper.dataset.active
      }
    })

    if (shouldClearSelectionHighlight) {
      clearSelectionHighlight()
    }
  }

  function hideSentencePopup(clearSelection = true) {
    if (!refs?.sentencePopup) return
    sentencePopupVisible = false
    sentencePopupAnchor = null
    sentencePopupRange = null
    sentencePopupRect = null
    refs.sentencePopup.classList.add('linswift-hidden')
    refs.sentencePopup.style.left = ''
    refs.sentencePopup.style.top = ''
    refs.sentencePopup.innerHTML = ''
    if (clearSelection) {
      clearSelectionHighlight()
    }
  }

  function renderSentencePopup(draft) {
    if (!refs?.sentencePopup) return
    const smartVocabEnabled = isSentenceSmartVocabEnabled()

    const vocabHtml = smartVocabEnabled && draft.vocab.length
      ? draft.vocab
          .slice(0, 2)
          .map((entry) => `
            <span class="linswift-sentence-vocab-chip">
              <strong>${escapeHtml(entry.word)}</strong>
              <span>${escapeHtml(shortMeaning(entry.meaning))}</span>
              <span>+</span>
            </span>
          `)
          .join('')
      : smartVocabEnabled
        ? '<span class="linswift-page-meta">当前句子里暂时没有明显需要收录的词。</span>'
        : '<span class="linswift-page-meta">智慧识词已关闭，当前只进行整句翻译。</span>'

    refs.sentencePopup.innerHTML = `
      <section class="linswift-sentence-popup-card">
        <div class="linswift-sentence-popup-top">
          <h3 class="linswift-sentence-popup-heading">整句翻译</h3>
        </div>
        <div class="linswift-sentence-popup-translation">
          <strong>中文翻译</strong>
          <p>${escapeHtml(draft.translation)}</p>
        </div>
        <div class="linswift-sentence-popup-actions">
          <button class="linswift-button ${smartVocabEnabled ? 'linswift-button--primary' : ''}" type="button" data-sentence-popup-action="smart-vocab">智慧识词：${smartVocabEnabled ? '开' : '关'}</button>
          <button class="linswift-button" type="button" data-sentence-popup-action="speak">朗读整句</button>
        </div>
        <div class="linswift-sentence-popup-vocab">
          <p class="linswift-sentence-popup-vocab-title">${
            smartVocabEnabled
              ? draft.vocab.length
                ? `识别到 ${Math.min(draft.vocab.length, 2)} 个值得学习的词汇：`
                : '当前句子里还没有明显需要单独收录的生词。'
              : '智慧识词已关闭'
          }</p>
          <div class="linswift-sentence-vocab-list">${vocabHtml}</div>
          <button class="linswift-button" type="button" data-sentence-popup-action="collect" ${smartVocabEnabled && draft.vocab.length ? '' : 'disabled'}>
            ${smartVocabEnabled ? (draft.vocab.length ? '收录这句里的生词' : '暂时没有句中生词可收录') : '开启智慧识词后可收录'}
          </button>
        </div>
      </section>
      <section class="linswift-sentence-popup-card linswift-sentence-popup-context">
        <div class="linswift-sentence-popup-top">
          <p class="linswift-sentence-popup-title">${escapeHtml(draft.mode)}</p>
          <span class="linswift-chip linswift-chip--accent">划句</span>
        </div>
        ${draft.before ? `<p class="linswift-sentence-popup-copy">${escapeHtml(draft.before)}</p>` : ''}
        <p class="linswift-sentence-popup-highlight">${escapeHtml(draft.sentence)}</p>
        ${draft.after ? `<p class="linswift-sentence-popup-copy">${escapeHtml(draft.after)}</p>` : ''}
      </section>
    `

    refs.sentencePopup
      .querySelector('[data-sentence-popup-action="smart-vocab"]')
      ?.addEventListener('click', async () => {
        const nextEnabled = !isSentenceSmartVocabEnabled()
        await setSentenceSmartVocabEnabled(nextEnabled)
        if (nextEnabled) {
          setStatus('智慧识词已开启，正在识别句中词汇。')
          await enrichSentenceDraft(draft)
        } else {
          draft.vocab = []
          setStatus('智慧识词已关闭，当前只做整句翻译。')
        }
        renderSentencePopup(draft)
      })
    refs.sentencePopup
      .querySelector('[data-sentence-popup-action="speak"]')
      ?.addEventListener('click', () => {
        const sentence = draft.sentence || ''
        if (!sentence || !window.speechSynthesis) {
          setStatus('当前环境暂不支持朗读。')
          return
        }
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(sentence)
        utterance.lang = 'en-US'
        window.speechSynthesis.speak(utterance)
        setStatus('正在朗读整句。')
      })
    refs.sentencePopup
      .querySelector('[data-sentence-popup-action="collect"]')
      ?.addEventListener('click', async () => {
        for (const entry of draft.vocab || []) {
          if (!panelState.extensionState.savedWords?.[entry.word]) {
            await handleSave(buildWordEntry(entry.word))
          }
        }
        setStatus('句中生词已收录到收藏夹。')
      })
  }

  function showSentencePopupLoading(anchorTarget) {
    if (!refs?.sentencePopup) return
    sentencePopupVisible = true
    sentencePopupAnchor = anchorTarget instanceof Range ? null : anchorTarget
    sentencePopupRange = anchorTarget instanceof Range ? anchorTarget : null
    sentencePopupRect = snapshotFloatingAnchorRect(anchorTarget)
    refs.sentencePopup.classList.remove('linswift-hidden')
    refs.sentencePopup.innerHTML = `
      <section class="linswift-sentence-popup-card">
        <p class="linswift-sentence-popup-title">划句翻译</p>
        <p class="linswift-tooltip-loading">正在生成整句译文与句中词汇…</p>
      </section>
    `
    positionFloatingCard(refs.sentencePopup, sentencePopupRect || sentencePopupRange || sentencePopupAnchor)
  }

  function scheduleHideInlineTooltip() {
    clearInlineTooltipHideTimer()
    inlineTooltipHideTimer = window.setTimeout(() => {
      if (!inlineTooltipPinned) {
        hideInlineTooltip(true)
      }
    }, INLINE_TOOLTIP_HIDE_DELAY)
  }

  async function fetchWordDetail(word) {
    const normalizedWord = String(word || '').trim().toLowerCase()
    const targetLanguage = getTranslationLanguage()
    const translationMode = getTranslationMode()
    if (!normalizedWord) {
      throw new Error('缺少单词')
    }

    const cacheKey = getWordDetailCacheKey(normalizedWord, targetLanguage)
    if (wordDetailCache.has(cacheKey)) {
      return wordDetailCache.get(cacheKey)
    }

    const fallback = getWordDetailFallback(normalizedWord)
    wordDetailCache.set(cacheKey, fallback)

    try {
      const resultEntry = getResultEntry(normalizedWord)
      const response = await sendRuntimeMessage({
        type: 'panel-word-detail',
        word: normalizedWord,
        context: String(resultEntry?.snippet || '').trim(),
        targetLanguage,
        translationMode,
      })

      const detail = {
        ...fallback,
        ...(response.detail || {}),
        word: normalizedWord,
      }
      wordDetailCache.set(cacheKey, detail)
      updateInlineTranslationForWord(normalizedWord, detail.meaning || detail.note || '')
      return detail
    } catch {
      return fallback
    }
  }

  async function showInlineTooltipForWord(word, anchorElement, options = {}) {
    const normalizedWord = String(word || '').trim().toLowerCase()
    if (!normalizedWord || !refs?.tooltip || !anchorElement?.isConnected) return

    clearInlineTooltipHideTimer()
    activeInlineWord = normalizedWord
    activeTooltipSource = options.source === 'selection' ? 'selection' : 'inline'
    if (options.pinned === true) inlineTooltipPinned = true
    if (options.pinned === false) inlineTooltipPinned = false

    refs.tooltip.classList.remove('linswift-hidden')
    setActiveInlineAnnotation(normalizedWord)
    showTooltipLoading(normalizedWord)
    positionInlineTooltip(anchorElement)

    const detail = await fetchWordDetail(normalizedWord)
    if (activeInlineWord !== normalizedWord || !refs?.tooltip) return

    renderTooltipContent(detail)
    refs.tooltip.classList.remove('linswift-hidden')
    positionInlineTooltip(anchorElement)
  }

  async function handleSelectionTranslationLookup() {
    createPanel()
    const selectionTarget = getSelectionLookupTarget()

    if (!selectionTarget) return

    try {
      await initializePanelState(true)
    } catch {}

    hideInlineTooltip(true)
    hideSentencePopup(false)
    clearHighlights()

    if (selectionTarget.type === 'sentence') {
      const sentenceRange = selectionTarget.range.cloneRange()
      const anchor = applySelectionHighlight(selectionTarget.range, selectionTarget.sentence)
      if (!anchor) return
      lastSelectionTooltipOpenedAt = Date.now()
      const draft = buildSentenceDraft({
        sentence: selectionTarget.sentence,
        before: selectionTarget.before,
        after: selectionTarget.after,
      })
      panelState.sentenceDraft = draft
      showSentencePopupLoading(sentenceRange)
      await enrichSentenceDraft(draft)
      panelState.sentenceDraft = draft
      renderSentencePopup(draft)
      sentencePopupVisible = true
      sentencePopupAnchor = anchor
      sentencePopupRange = sentenceRange
      sentencePopupRect = snapshotFloatingAnchorRect(sentenceRange) || snapshotFloatingAnchorRect(anchor)
      refs.sentencePopup.classList.remove('linswift-hidden')
      positionFloatingCard(refs.sentencePopup, sentencePopupRect || sentencePopupRange || sentencePopupAnchor)
      setStatus('已显示划句翻译弹窗。')
      return
    }

    const highlight = applySelectionHighlight(selectionTarget.range, selectionTarget.word)
    if (!highlight) return

    lastSelectionTooltipOpenedAt = Date.now()
    await showInlineTooltipForWord(selectionTarget.word, highlight, {
      pinned: true,
      source: 'selection',
    })
  }

  function pronounceWord(word, variant = getPronunciationVariant(), detail = null) {
    const normalizedWord = String(word || '').trim()
    if (!normalizedWord || !('speechSynthesis' in window)) return

    try {
      const normalizedVariant = variant === 'uk' || variant === 'us' ? variant : 'us'
      const preferredDetail = detail || getCachedWordDetail(normalizedWord) || null
      const preferredAudio = normalizedVariant === 'uk'
        ? preferredDetail?.audioUk || preferredDetail?.audioUs || ''
        : preferredDetail?.audioUs || preferredDetail?.audioUk || ''
      if (preferredAudio) {
        const audio = new Audio(preferredAudio)
        void audio.play().catch(() => {})
        return
      }
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(normalizedWord)
      utterance.lang = normalizedVariant === 'uk' ? 'en-GB' : 'en-US'
      const voices = window.speechSynthesis.getVoices?.() || []
      const matchedVoice = voices.find((voice) =>
        normalizedVariant === 'uk'
          ? /^en(-|_)?gb/i.test(voice.lang)
          : /^en(-|_)?us/i.test(voice.lang)
      )
      if (matchedVoice) utterance.voice = matchedVoice
      window.speechSynthesis.speak(utterance)
    } catch {}
  }

  function renderStudyOverlay() {
    if (!refs?.studyOverlay) return

    const cards = panelState.study.cards
    const currentCard = cards[panelState.study.currentIndex]
    const isFinished = panelState.study.currentIndex >= cards.length
    const progress = cards.length > 0
      ? Math.min(100, Math.round((panelState.study.currentIndex / cards.length) * 100))
      : 0
    const results = panelState.study.results
    const countBy = (type) => results.filter((item) => item === type).length

    refs.studyOverlay.classList.toggle('linswift-hidden', !panelState.study.active)
    if (!panelState.study.active) {
      refs.studyOverlay.innerHTML = ''
      return
    }

    if (!cards.length) {
      refs.studyOverlay.innerHTML = `
        <div class="linswift-study-backdrop"></div>
        <section class="linswift-study-shell">
          <div class="linswift-study-header">
            <div>
              <h3 class="linswift-study-title">暂时没有可学习的词</h3>
              <p class="linswift-study-subtitle">先重新扫描，或先把当前页的陌生词识别出来。</p>
            </div>
            <button class="linswift-close" type="button" data-study-close>×</button>
          </div>
        </section>
      `
      refs.studyOverlay
        .querySelector('[data-study-close]')
        ?.addEventListener('click', closeStudyFlow)
      return
    }

    if (isFinished) {
      refs.studyOverlay.innerHTML = `
        <div class="linswift-study-backdrop"></div>
        <section class="linswift-study-shell">
          <div class="linswift-study-header">
            <div>
              <h3 class="linswift-study-title">这一轮学习完成</h3>
              <p class="linswift-study-subtitle">已处理 ${cards.length} 个词，关闭后回到当前阅读页面。</p>
            </div>
            <button class="linswift-close" type="button" data-study-finish-close>×</button>
          </div>
          <div class="linswift-study-stage">
            <div class="linswift-study-summary">
              <div class="linswift-study-summary-grid">
                <article class="linswift-study-summary-card">
                  <strong>${countBy('unknown')}</strong>
                  <span>不会</span>
                </article>
                <article class="linswift-study-summary-card">
                  <strong>${countBy('vague')}</strong>
                  <span>模糊</span>
                </article>
                <article class="linswift-study-summary-card">
                  <strong>${countBy('know')}</strong>
                  <span>会</span>
                </article>
                <article class="linswift-study-summary-card">
                  <strong>${countBy('mastered')}</strong>
                  <span>掌握并同步</span>
                </article>
              </div>
              <div class="linswift-study-summary-actions">
                <button class="linswift-button" type="button" data-study-restart>再学一轮</button>
                <button class="linswift-button linswift-button--primary" type="button" data-study-return>回到阅读</button>
              </div>
            </div>
          </div>
        </section>
      `
      refs.studyOverlay
        .querySelector('[data-study-finish-close]')
        ?.addEventListener('click', closeStudyFlow)
      refs.studyOverlay
        .querySelector('[data-study-return]')
        ?.addEventListener('click', closeStudyFlow)
      refs.studyOverlay
        .querySelector('[data-study-restart]')
        ?.addEventListener('click', () => {
          panelState.study.currentIndex = 0
          panelState.study.isFlipped = false
          panelState.study.results = []
          renderStudyOverlay()
        })
      return
    }

    refs.studyOverlay.innerHTML = `
      <div class="linswift-study-backdrop"></div>
      <section class="linswift-study-shell">
        <div class="linswift-study-header">
          <div>
            <h3 class="linswift-study-title">词卡学习</h3>
            <p class="linswift-study-subtitle">${panelState.study.currentIndex + 1}/${cards.length} · 学完自动回到当前网页</p>
          </div>
          <div class="linswift-header-actions">
            <button class="linswift-button" type="button" data-study-skip>稍后再学</button>
            <button class="linswift-close" type="button" data-study-close>×</button>
          </div>
        </div>
        <div class="linswift-study-progress">
          <div class="linswift-study-progress-bar" style="width:${progress}%"></div>
        </div>
        <div class="linswift-study-stage">
          <div class="linswift-study-stack">
            ${panelState.study.currentIndex + 2 < cards.length ? '<div class="linswift-study-shadow-card linswift-study-shadow-card--back"></div>' : ''}
            ${panelState.study.currentIndex + 1 < cards.length ? '<div class="linswift-study-shadow-card linswift-study-shadow-card--mid"></div>' : ''}
            <article class="linswift-study-card" data-study-flip>
              ${
                !panelState.study.isFlipped
                  ? `
                    <h4 class="linswift-study-word">${escapeHtml(currentCard.word)}</h4>
                    <p class="linswift-study-phonetic">${escapeHtml(currentCard.phonetic || '点击翻卡查看释义')}</p>
                    <button class="linswift-study-audio" type="button" data-study-audio>🔊</button>
                    <p class="linswift-study-hint">点击卡片翻转，先看词再判断熟悉度</p>
                  `
                  : `
                    <h4 class="linswift-study-word">${escapeHtml(currentCard.word)}</h4>
                    <p class="linswift-study-meaning">${escapeHtml(currentCard.meaning || '暂无释义')}</p>
                    <div class="linswift-study-note-card">
                      ${
                        currentCard.note
                          ? escapeHtml(currentCard.note)
                          : currentCard.example
                            ? escapeHtml(currentCard.example)
                            : `试着用 ${escapeHtml(currentCard.word)} 造一个句子。`
                      }
                    </div>
                    <p class="linswift-study-hint">看完释义后，选一个最接近你当前状态的按钮</p>
                  `
              }
            </article>
          </div>
        </div>
        <div class="linswift-study-actions">
          <button class="linswift-study-action linswift-study-action--unknown" type="button" data-study-choice="unknown">
            <span class="linswift-study-action-icon">×</span>
            <span>不会</span>
          </button>
          <button class="linswift-study-action linswift-study-action--vague" type="button" data-study-choice="vague">
            <span class="linswift-study-action-icon">?</span>
            <span>模糊</span>
          </button>
          <button class="linswift-study-action linswift-study-action--know" type="button" data-study-choice="know">
            <span class="linswift-study-action-icon">✓</span>
            <span>会</span>
          </button>
          <button class="linswift-study-action linswift-study-action--mastered" type="button" data-study-choice="mastered">
            <span class="linswift-study-action-icon">★</span>
            <span>掌握</span>
          </button>
        </div>
      </section>
    `

    refs.studyOverlay
      .querySelector('[data-study-close]')
      ?.addEventListener('click', closeStudyFlow)
    refs.studyOverlay
      .querySelector('[data-study-skip]')
      ?.addEventListener('click', closeStudyFlow)
    refs.studyOverlay
      .querySelector('[data-study-audio]')
      ?.addEventListener('click', (event) => {
        event.stopPropagation()
        pronounceWord(currentCard.word)
      })
    refs.studyOverlay
      .querySelector('[data-study-flip]')
      ?.addEventListener('click', () => {
        panelState.study.isFlipped = !panelState.study.isFlipped
        renderStudyOverlay()
      })
    refs.studyOverlay.querySelectorAll('[data-study-choice]').forEach((button) => {
      button.addEventListener('click', () => {
        void handleStudyChoice(button.getAttribute('data-study-choice'))
      })
    })
  }

  function openStudyFlow() {
    panelState.study.active = true
    panelState.study.currentIndex = 0
    panelState.study.isFlipped = false
    panelState.study.results = []
    panelState.study.cards = buildStudyCards(panelState.lastAnalysis?.results || [])
    panelState.study.returnToMinimized = panelState.minimized
    refs.panel.classList.add('linswift-hidden')
    refs.bubble.classList.add('linswift-hidden')
    hideInlineTooltip(true)
    renderStudyOverlay()
  }

  function closeStudyFlow() {
    if (!refs) return
    const processed = panelState.study.results.length
    const shouldRestoreBubble = Boolean(panelState.study.returnToMinimized)
    panelState.study.active = false
    panelState.study.currentIndex = 0
    panelState.study.isFlipped = false
    panelState.study.results = []
    panelState.study.cards = []
    panelState.study.returnToMinimized = false
    renderStudyOverlay()
    panelState.hidden = false
    panelState.minimized = shouldRestoreBubble
    refs.panel.classList.toggle('linswift-hidden', shouldRestoreBubble)
    refs.bubble.classList.toggle('linswift-hidden', !shouldRestoreBubble)
    if (processed > 0) {
      setStatus(`已完成 ${processed} 张词卡，已返回当前网页。`)
    }
  }

  async function handleStudyChoice(choice) {
    if (!choice) return
    const currentCard = panelState.study.cards[panelState.study.currentIndex]
    if (!currentCard) return

    panelState.study.results.push(choice)

    if (choice === 'mastered') {
      await handleKnown(currentCard.word)
    }

    panelState.study.currentIndex += 1
    panelState.study.isFlipped = false

    if (panelState.study.currentIndex >= panelState.study.cards.length) {
      closeStudyFlow()
      return
    }

    renderStudyOverlay()
    pronounceWord(panelState.study.cards[panelState.study.currentIndex].word)
  }

  function applyInlineTranslations(results) {
    clearInlineTranslations()

    if (!panelState.extensionState.settings.inlineTranslateEnabled) return 0
    if (!Array.isArray(results) || results.length === 0) return 0

    const translationEntries = results
      .map((item) => ({
        word: String(item.word || '').trim(),
        meaning: shortMeaning(item.meaning || item.note || ''),
      }))
      .filter((item) => item.word && item.meaning)
      .sort((a, b) => b.word.length - a.word.length)

    if (translationEntries.length === 0) return 0

    const translationMap = new Map(
      translationEntries.map((item) => [item.word.toLowerCase(), item.meaning])
    )
    const regex = new RegExp(
      `\\b(${translationEntries.map((item) => escapeRegExp(item.word)).join('|')})\\b`,
      'gi'
    )

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parentElement = node.parentElement
        if (shouldIgnoreNode(parentElement)) return NodeFilter.FILTER_REJECT
        if (parentElement?.closest('.linswift-inline-annotation')) return NodeFilter.FILTER_REJECT
        const text = node.textContent || ''
        regex.lastIndex = 0
        return regex.test(text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
      },
    })

    let applied = 0
    const matchedNodes = []
    let node = walker.nextNode()
    while (node && matchedNodes.length < INLINE_ANNOTATION_LIMIT) {
      matchedNodes.push(node)
      node = walker.nextNode()
    }

    matchedNodes.forEach((textNode) => {
      if (applied >= INLINE_ANNOTATION_LIMIT) return

      const text = textNode.textContent || ''
      regex.lastIndex = 0
      if (!regex.test(text)) return

      const fragment = document.createDocumentFragment()
      let lastIndex = 0

      text.replace(regex, (match, _group, offset) => {
        if (applied >= INLINE_ANNOTATION_LIMIT) return match

        if (offset > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, offset)))
        }

        const wrapper = document.createElement('ruby')
        wrapper.className = 'linswift-inline-annotation'
        wrapper.dataset.word = match.toLowerCase()

        const wordSpan = document.createElement('span')
        wordSpan.className = 'linswift-inline-word'
        wordSpan.textContent = match

        const translationSpan = document.createElement('rt')
        translationSpan.className = 'linswift-inline-translation'
        translationSpan.textContent = translationMap.get(match.toLowerCase()) || '释义'

        wrapper.appendChild(wordSpan)
        wrapper.appendChild(translationSpan)
        fragment.appendChild(wrapper)
        inlineAnnotationRecords.push({
          wrapper,
          parent: textNode.parentNode,
          word: match.toLowerCase(),
          text: match,
        })

        wrapper.addEventListener('mouseenter', () => {
          inlineTooltipPinned = false
          void showInlineTooltipForWord(wrapper.dataset.word || match, wrapper, { pinned: false })
        })
        wrapper.addEventListener('mouseleave', () => {
          scheduleHideInlineTooltip()
        })
        wrapper.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()

          const nextPinned =
            !(inlineTooltipPinned && activeInlineWord === (wrapper.dataset.word || '').toLowerCase())
          if (!nextPinned) {
            hideInlineTooltip(true)
            return
          }

          void showInlineTooltipForWord(wrapper.dataset.word || match, wrapper, {
            pinned: true,
          })
        })

        applied += 1
        lastIndex = offset + match.length
        return match
      })

      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)))
      }

      textNode.parentNode?.replaceChild(fragment, textNode)
    })

    return applied
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  function highlightWordOnPage(word) {
    clearHighlights()
    injectStyles()

    const regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi')
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parentElement = node.parentElement
        if (shouldIgnoreNode(parentElement)) return NodeFilter.FILTER_REJECT
        const text = node.textContent || ''
        regex.lastIndex = 0
        return regex.test(text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
      },
    })

    const matchedNodes = []
    let node = walker.nextNode()
    while (node && matchedNodes.length < 80) {
      matchedNodes.push(node)
      node = walker.nextNode()
    }

    let firstMark = null
    matchedNodes.forEach((textNode) => {
      const text = textNode.textContent || ''
      regex.lastIndex = 0
      if (!regex.test(text)) return

      const fragment = document.createDocumentFragment()
      let lastIndex = 0

      text.replace(regex, (match, offset) => {
        if (offset > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, offset)))
        }

        const mark = document.createElement('mark')
        mark.className = HIGHLIGHT_CLASS
        mark.textContent = match
        fragment.appendChild(mark)
        highlightRecords.push({ mark, parent: textNode.parentNode })
        if (!firstMark) firstMark = mark
        lastIndex = offset + match.length
        return match
      })

      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)))
      }

      textNode.parentNode?.replaceChild(fragment, textNode)
    })

    if (firstMark) {
      firstMark.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    }

    return { count: highlightRecords.length }
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function computeComprehension(meta, results) {
    const totalTokens = Number(meta?.totalTokens || 0)
    if (!Number.isFinite(totalTokens) || totalTokens <= 0) {
      return null
    }
    const unfamiliarTokens = (results || []).reduce((sum, item) => sum + Number(item.count || 0), 0)
    const ratio = Math.max(0, 1 - unfamiliarTokens / totalTokens)
    return Math.max(0, Math.min(100, Math.round(ratio * 100)))
  }

  function setStatus(message) {
    if (refs?.status) refs.status.textContent = message
  }

  function normalizeHostname(hostname) {
    return String(hostname || '')
      .trim()
      .toLowerCase()
      .replace(/\.+$/g, '')
  }

  function getCurrentHostname() {
    try {
      return normalizeHostname(new URL(window.location.href).hostname)
    } catch {
      return ''
    }
  }

  function getDisabledAutoTranslateHosts() {
    const rawHosts = Array.isArray(panelState.extensionState.settings.disabledAutoTranslateHosts)
      ? panelState.extensionState.settings.disabledAutoTranslateHosts
      : []

    return Array.from(
      new Set(rawHosts.map((host) => normalizeHostname(host)).filter(Boolean))
    )
  }

  function isCurrentSiteAutoTranslateDisabled() {
    const currentHostname = getCurrentHostname()
    if (!currentHostname) return false
    return getDisabledAutoTranslateHosts().includes(currentHostname)
  }

  function shouldAutoTranslateCurrentPage() {
    return (
      !panelState.youtube.enabled &&
      Boolean(panelState.extensionState.settings.autoTranslateOnLoad) &&
      !isCurrentSiteAutoTranslateDisabled()
    )
  }

  function getUiScale() {
    return getUiScaleStep().scale
  }

  function getUiScaleStep(rawValue = panelState.extensionState.settings.uiScale) {
    const numericValue = Number(rawValue)
    if (!Number.isFinite(numericValue)) return { ...UI_SCALE_STEPS[2], index: 2 }
    let matchedIndex = 0
    let smallestDiff = Number.POSITIVE_INFINITY
    UI_SCALE_STEPS.forEach((step, index) => {
      const diff = Math.abs(step.value - numericValue)
      if (diff < smallestDiff) {
        smallestDiff = diff
        matchedIndex = index
      }
    })
    return { ...UI_SCALE_STEPS[matchedIndex], index: matchedIndex }
  }

  function getUiScaleStepByIndex(index) {
    const safeIndex = Math.min(
      UI_SCALE_STEPS.length - 1,
      Math.max(0, Number.isFinite(Number(index)) ? Number(index) : 2)
    )
    return { ...UI_SCALE_STEPS[safeIndex], index: safeIndex }
  }

  function syncUiScaleControl(rawValue = panelState.extensionState.settings.uiScale) {
    const step = getUiScaleStep(rawValue)
    const progress = `${(step.index / (UI_SCALE_STEPS.length - 1)) * 100}%`
    if (refs?.sizeSlider) {
      refs.sizeSlider.value = String(step.index)
      refs.sizeSlider.setAttribute('aria-valuetext', step.label)
    }
    if (refs?.sizeSliderWrap) {
      refs.sizeSliderWrap.style.setProperty('--linswift-scale-progress', progress)
    }
    if (refs?.sizeSliderLabel) {
      refs.sizeSliderLabel.textContent = step.label
    }
  }

  function previewUiScale(stepIndex) {
    const step = getUiScaleStepByIndex(stepIndex)
    if (refs?.root) {
      refs.root.style.setProperty('--linswift-ui-scale', String(step.scale))
    }
    syncUiScaleControl(step.value)
  }

  function applyUiScale() {
    previewUiScale(getUiScaleStep().index)
  }

  function setLoading(isLoading) {
    panelState.loading = isLoading
    if (refs?.scanButton) {
      refs.scanButton.disabled = isLoading
      refs.scanButton.textContent = isLoading ? '识别中...' : '重新扫描'
    }
  }

  function syncBubble() {
    if (!refs) return
    const resultCount = panelState.lastAnalysis?.results?.length || 0
    refs.bubbleBadge.textContent = String(resultCount)
    refs.bubbleBadge.classList.toggle('linswift-hidden', resultCount <= 0)
  }

  function syncListVisibility() {
    if (!refs?.results) return
  }

  function syncPanelPageVisibility() {
    if (!refs) return

    const showingTranslate = panelState.activePage === 'translate'
    const showingSettings = panelState.activePage === 'settings'
    const showingLogin = panelState.activePage === 'login'
    const showingSentence = panelState.activePage === 'sentence'
    refs.translatePage.classList.toggle('linswift-hidden', !showingTranslate)
    refs.settingsPage.classList.toggle('linswift-hidden', !showingSettings)
    refs.loginPage?.classList.toggle('linswift-hidden', !showingLogin)
    refs.sentencePage?.classList.toggle('linswift-hidden', !showingSentence)
    refs.translatePageToggle.classList.toggle('linswift-tab--active', showingTranslate)
    refs.settingsPageToggle.classList.toggle('linswift-tab--active', showingSettings)
  }

  function setActivePanelPage(nextPage) {
    if (!panelState.auth?.isAuthenticated && nextPage !== 'login') {
      panelState.activePage = 'login'
    } else {
      panelState.activePage =
      nextPage === 'settings' || nextPage === 'login' || nextPage === 'sentence'
        ? nextPage
        : 'translate'
    }
    syncPanelPageVisibility()
    if (refs?.body) refs.body.scrollTop = 0
  }

  function restoreDefaultPageForLoggedOutState() {
    if (!panelState.auth?.isAuthenticated) {
      panelState.activePage = 'login'
      syncPanelPageVisibility()
    }
  }

  function isSentenceSmartVocabEnabled() {
    return panelState.extensionState?.settings?.sentenceSmartVocabEnabled !== false
  }

  async function setSentenceSmartVocabEnabled(enabled) {
    const nextSettings = {
      ...panelState.extensionState.settings,
      sentenceSmartVocabEnabled: Boolean(enabled),
    }
    const response = await sendRuntimeMessage({
      type: 'panel-save-settings',
      settings: nextSettings,
    })
    panelState.extensionState.settings = response.settings
  }

  function renderYouTubeCard() {
    if (!refs?.youtubeCard) return

    if (!panelState.youtube.enabled) {
      refs.youtubeCard.classList.add('linswift-hidden')
      refs.youtubeCard.innerHTML = ''
      return
    }

    refs.youtubeCard.classList.remove('linswift-hidden')
    const cueCount = panelState.youtube.cues.length
    const transcriptCount = panelState.youtube.transcriptCues.length
    const transcriptProviderSuffix = panelState.youtube.transcriptProvider
      ? ` · ${panelState.youtube.transcriptProvider}`
      : ''
    const prefetchStatus =
      panelState.youtube.transcriptStatus === 'loading'
        ? '正在预抓完整字幕'
        : panelState.youtube.transcriptStatus === 'ready'
          ? `已预抓 ${transcriptCount} 条完整字幕${transcriptProviderSuffix}`
          : panelState.youtube.transcriptStatus === 'empty'
            ? '当前视频没有可预抓字幕'
            : panelState.youtube.transcriptStatus === 'error'
              ? '完整字幕预抓失败'
              : '等待预抓字幕'
    const translationStatus =
      !panelState.extensionState.settings.inlineTranslateEnabled
        ? '字幕提示已关闭'
        : panelState.youtube.transcriptTranslationStatus === 'loading'
          ? '整段翻译中'
          : panelState.youtube.transcriptTranslationStatus === 'ready'
            ? `已预翻译 ${Object.keys(panelState.youtube.translations || {}).length} 条`
            : panelState.youtube.transcriptTranslationStatus === 'error'
              ? '整段翻译失败'
              : transcriptCount > 0
              ? '等待整段翻译'
                : '等待整段翻译'
    const translationStatusWithNote = panelState.youtube.translationNote
      ? `${translationStatus} · ${panelState.youtube.translationNote}`
      : translationStatus
    const subtitleStatus = panelState.youtube.captionsEnabled
      ? panelState.youtube.subtitleReady
        ? `字幕已就绪 · 已采集 ${cueCount} 条 · ${prefetchStatus} · ${translationStatusWithNote}`
        : '字幕已开启 · 等待字幕出现'
      : `${prefetchStatus} · ${translationStatusWithNote}`
    const translationEngineNote = panelState.youtube.translationProvider
      ? `${getTranslationModeLabel()} · ${panelState.youtube.translationProvider.toUpperCase()}`
      : `${getTranslationModeLabel()}`

    refs.youtubeCard.innerHTML = `
      <div class="linswift-youtube-card-top">
        <div>
          <p class="linswift-youtube-title">${escapeHtml(panelState.youtube.title || '当前 YouTube 视频')}</p>
          <p class="linswift-youtube-meta">
            ${escapeHtml(panelState.youtube.channel || 'YouTube')} · ${escapeHtml(subtitleStatus)}
          </p>
          <p class="linswift-youtube-meta">${escapeHtml(translationEngineNote)}</p>
        </div>
        <span class="linswift-tag">视频字幕</span>
      </div>
      <div class="linswift-youtube-grid">
        <select class="linswift-select" data-youtube-mode-select aria-label="字幕辅助模式">
          <option value="original">原文模式</option>
          <option value="bilingual">双语模式</option>
          <option value="vocab">生词模式</option>
        </select>
        <button class="linswift-button" type="button" data-youtube-refresh>刷新字幕</button>
      </div>
    `

    const modeSelect = refs.youtubeCard.querySelector('[data-youtube-mode-select]')
    modeSelect.value = getYouTubeSubtitleMode()
    modeSelect.addEventListener('change', async () => {
      panelState.extensionState.settings.youtubeSubtitleMode = modeSelect.value
      await saveSettings()
    })
    refs.youtubeCard
      .querySelector('[data-youtube-refresh]')
      ?.addEventListener('click', () => {
        syncYouTubePageState()
        void ensureYouTubeTranscriptPrefetch()
        void runScan()
      })
  }

  function buildSentenceDraft(payload = {}) {
    const seedWord = String(payload.seedWord || '').trim().toLowerCase()
    const explicitSentence = collapseWhitespace(payload.sentence || '')
    const segments = extractVisibleSegments()
    const preferredSegments = segments.filter((segment) =>
      ['p', 'li', 'blockquote'].includes(String(segment?.tagName || '').toLowerCase())
    )
    const segmentSource = preferredSegments.length > 0 ? preferredSegments : segments
    const matchedSegment = seedWord
      ? segmentSource.find((segment) =>
          String(segment?.text || '').toLowerCase().includes(seedWord)
        )
      : segmentSource[0]
    const resultSnippet = seedWord
      ? panelState.lastAnalysis?.results?.find(
          (item) => String(item.word || '').trim().toLowerCase() === seedWord
        )?.snippet
      : panelState.lastAnalysis?.results?.[0]?.snippet
    const sentence = explicitSentence ||
      collapseWhitespace(matchedSegment?.text || resultSnippet || 'Select a sentence to translate with Linswift.')

    return {
      mode: payload.mode || `${getCurrentHostname() || '当前网页'} · 划句模式`,
      before: collapseWhitespace(payload.before || ''),
      sentence,
      after: collapseWhitespace(payload.after || ''),
      title: payload.title || '整句翻译',
      translation: '正在生成整句译文...',
      vocab: Array.isArray(payload.vocab) ? payload.vocab : [],
    }
  }

  function buildSentenceVocab(results) {
    return (results || []).slice(0, 5).map((item) => ({
      word: item.word,
      meaning: item.meaning || item.note || item.snippet || '',
    }))
  }

  async function enrichSentenceDraft(draft) {
    if (!draft?.sentence) return draft

    try {
      const response = await sendRuntimeMessage({
        type: 'panel-translate-lines',
        lines: [draft.sentence],
        targetLanguage: getTranslationLanguage(),
        translationMode: getTranslationMode(),
      })
      draft.translation = response.lines?.[0] || draft.sentence
    } catch {
      draft.translation = draft.sentence
    }

    if (!isSentenceSmartVocabEnabled()) {
      draft.vocab = []
      return draft
    }

    try {
      const analysisResponse = await sendRuntimeMessage({
        type: 'panel-analyze-page',
        pageData: {
          title: document.title,
          url: window.location.href,
          segments: [{ text: draft.sentence, tagName: 'p' }],
        },
      })
      draft.vocab = buildSentenceVocab(analysisResponse.analysis?.results)
    } catch {
      draft.vocab = draft.vocab || []
    }

    return draft
  }

  async function openSentencePage(source = '') {
    createPanel()

    try {
      await initializePanelState(true)
    } catch {}

    let draft

    if (typeof source === 'object' && source?.sentence) {
      draft = buildSentenceDraft({
        sentence: source.sentence,
        before: source.before,
        after: source.after,
      })
    } else {
      const currentSelectionTarget = getSelectionLookupTarget()
      if (currentSelectionTarget?.type === 'sentence') {
        draft = buildSentenceDraft({
          sentence: currentSelectionTarget.sentence,
          before: currentSelectionTarget.before,
          after: currentSelectionTarget.after,
        })
      } else {
      draft = buildSentenceDraft({
        seedWord: String(source || panelState.lastAnalysis?.results?.[0]?.word || ''),
      })
      }
    }

    panelState.sentenceDraft = draft
    renderSentencePage()
    setActivePanelPage('sentence')
    setStatus('正在生成整句翻译...')

    await enrichSentenceDraft(draft)
    panelState.sentenceDraft = draft
    renderSentencePage()
    setStatus('已切换到划句翻译模式。')
  }

  function renderSummary() {
    if (!refs) return

    const resultCount = panelState.lastAnalysis?.results?.length || 0
    const isYouTubeContext =
      panelState.youtube.enabled || panelState.lastAnalysis?.meta?.source === 'youtube-subtitles'
    const pageTitle = isYouTubeContext
      ? panelState.youtube.title || panelState.lastAnalysis?.meta?.pageTitle || '准备分析当前视频字幕'
      : panelState.lastAnalysis?.meta?.pageTitle || '准备扫描当前网页'
    const pageUrl = isYouTubeContext
      ? `https://www.youtube.com/watch?v=${panelState.youtube.videoId || ''}`
      : panelState.lastAnalysis?.meta?.pageUrl || window.location.href
    const comprehension = computeComprehension(
      panelState.lastAnalysis?.meta,
      panelState.lastAnalysis?.results
    )

    refs.headline.textContent = ''

    try {
      const hostname = new URL(pageUrl).hostname
      refs.pageMeta.textContent = resultCount
        ? `${pageTitle} · ${hostname}`
        : isYouTubeContext
          ? `${pageTitle} · ${
              panelState.youtube.transcriptStatus === 'ready'
                ? 'Linswift 字幕已连接'
                : panelState.youtube.transcriptStatus === 'loading'
                  ? '正在预抓整条字幕'
                  : panelState.youtube.transcriptStatus === 'empty'
                    ? '当前视频没有可用字幕轨道'
                    : '等待连接 Linswift 字幕'
            }`
          : `当前网页 · ${hostname}`
    } catch {
      refs.pageMeta.textContent = pageTitle
    }

    refs.detectedCount.textContent = String(resultCount)
    refs.translateDashboard?.classList.toggle(
      'linswift-translate-dashboard--compact',
      resultCount > 0
    )
    if (refs.scanCount) {
      refs.scanCount.textContent = String(panelState.lastAnalysis?.meta?.totalTokens || 0)
    }
    refs.comprehension.textContent = Number.isFinite(comprehension) ? `${comprehension}%` : '--'
    refs.knownCount.textContent = String(panelState.extensionState.knownWords.length)
    if (refs.authChip && refs.authMeta) {
      if (panelState.auth.isAuthenticated) {
        refs.authChip.textContent = '账号已连接'
        refs.authChip.classList.add('linswift-chip--accent')
        refs.authMeta.textContent = ''
        if (refs.openLoginButton) refs.openLoginButton.textContent = '同步完成'
      } else {
        refs.authChip.textContent = '请先登录'
        refs.authChip.classList.remove('linswift-chip--accent')
        refs.authMeta.textContent = ''
        if (refs.openLoginButton) refs.openLoginButton.textContent = '登录账号'
      }
    }
    refs.headerSubtitle.textContent = isYouTubeContext ? 'YouTube 字幕模式' : '网页生词雷达'
    refs.kicker.textContent = isYouTubeContext ? '视频字幕' : '翻译插件'
    refs.studyButton.textContent = isYouTubeContext ? '先学字幕词' : '先学习'
    if (refs.scanButton && !panelState.loading) {
      refs.scanButton.textContent = isYouTubeContext ? '刷新字幕' : '重新扫描'
    }
    if (refs.inlineToggle) {
      refs.inlineToggle.textContent = isYouTubeContext
        ? `字幕生词提示：${panelState.extensionState.settings.inlineTranslateEnabled ? '开' : '关'}`
        : `页内直译：${panelState.extensionState.settings.inlineTranslateEnabled ? '开' : '关'}`
      refs.inlineToggle.classList.toggle(
        'linswift-button--primary',
        Boolean(panelState.extensionState.settings.inlineTranslateEnabled)
      )
    }
    if (refs.translationLanguageSelect) {
      refs.translationLanguageSelect.value = getTranslationLanguage()
    }
    if (refs.translationModeSelect) {
      refs.translationModeSelect.value = getTranslationMode()
    }
    if (refs.pronunciationVariantSelect) {
      refs.pronunciationVariantSelect.value = getPronunciationVariant()
    }
    syncUiScaleControl()
    if (refs.autoTranslateToggle) {
      refs.autoTranslateToggle.textContent = `自动翻译网页：${
        panelState.extensionState.settings.autoTranslateOnLoad ? '开' : '关'
      }`
      refs.autoTranslateToggle.classList.toggle(
        'linswift-button--primary',
        Boolean(panelState.extensionState.settings.autoTranslateOnLoad)
      )
    }
    if (refs.siteAutoTranslateToggle) {
      const currentHostname = getCurrentHostname()
      const disabled = isCurrentSiteAutoTranslateDisabled()
      refs.siteAutoTranslateToggle.textContent = currentHostname
        ? disabled
          ? `当前网站不翻译：${currentHostname}`
          : `当前网站自动翻译：${currentHostname}`
        : '当前网站自动翻译'
      refs.siteAutoTranslateToggle.classList.toggle('linswift-tab--active', disabled)
    }
    renderYouTubeCard()
    syncBubble()
  }

  function renderSentencePage() {
    if (!refs?.sentencePage) return
    const draft = panelState.sentenceDraft || buildSentenceDraft()
    const smartVocabEnabled = isSentenceSmartVocabEnabled()
    refs.sentenceMode.textContent = draft.mode
    refs.sentenceBefore.textContent = draft.before || '选中一整句后，Linswift 会在这里保留它的上文。'
    refs.sentenceHighlight.textContent = draft.sentence
    refs.sentenceAfter.textContent = draft.after || '下文会一起保留，方便你在阅读流中理解整句。'
    refs.sentenceTitle.textContent = draft.title
    refs.sentenceTranslation.textContent = draft.translation
    refs.sentenceSaveButton.textContent = `智慧识词：${smartVocabEnabled ? '开' : '关'}`
    refs.sentenceSaveButton.classList.toggle('linswift-button--primary', smartVocabEnabled)
    refs.sentenceVocabTitle.textContent = smartVocabEnabled
      ? draft.vocab.length
        ? `识别到 ${draft.vocab.length} 个值得学习的词汇：`
        : '当前句子里还没有明显需要单独收录的生词。'
      : '智慧识词已关闭，当前只进行整句翻译。'
    refs.sentenceVocabList.innerHTML = smartVocabEnabled && draft.vocab.length
      ? draft.vocab.map((entry) => `
        <span class="linswift-sentence-vocab-chip">
          <strong>${escapeHtml(entry.word)}</strong>
          <span>${escapeHtml(entry.meaning)}</span>
          <span>+</span>
        </span>
      `).join('')
      : smartVocabEnabled
        ? '<span class="linswift-page-meta">继续划句，或先扫描整页后再回来看句中词。</span>'
        : '<span class="linswift-page-meta">开启智慧识词后，这里会显示句中值得学习的词汇。</span>'
    refs.sentenceCollectButton.textContent = smartVocabEnabled
      ? draft.vocab.length
        ? `一键收录 ${draft.vocab.length} 个句中生词`
        : '暂时没有句中生词可收录'
      : '开启智慧识词后可收录'
    refs.sentenceCollectButton.disabled = !smartVocabEnabled || draft.vocab.length === 0
  }

  function renderSavedWords() {
    if (!refs?.saved) return

    const savedWords = Object.values(panelState.extensionState.savedWords || {}).sort((a, b) => {
      return new Date(b.savedAt || 0).getTime() - new Date(a.savedAt || 0).getTime()
    })

    refs.saved.innerHTML = ''
    refs.savedToggle.textContent = `收藏夹 ${savedWords.length}`

    if (savedWords.length === 0) {
      refs.saved.innerHTML = `
        <div class="linswift-empty">
          还没有收藏生词。识别后把值得长期记住的词同步到 Linswift 词库。
        </div>
      `
      return
    }

    savedWords.forEach((entry) => {
      const card = document.createElement('article')
      card.className = 'linswift-card'
      card.innerHTML = `
        <div class="linswift-card-top">
          <div>
            <p class="linswift-card-word">${escapeHtml(entry.word)}</p>
            <p class="linswift-card-meta">${escapeHtml(entry.pageTitle || 'Linswift 云端词库')}</p>
          </div>
          <span class="linswift-chip linswift-chip--accent">收藏</span>
        </div>
        <p class="linswift-card-meaning">${escapeHtml(entry.meaning || entry.note || '暂无释义')}</p>
        <div class="linswift-card-actions">
          <button class="linswift-button" data-action="locate">定位</button>
          <button class="linswift-button" data-action="sentence">整句</button>
          <button class="linswift-button" data-action="remove">移除</button>
        </div>
      `

      card.querySelector('[data-action="locate"]').addEventListener('click', () => handleHighlight(entry.word))
      card.querySelector('[data-action="sentence"]').addEventListener('click', () => {
        void openSentencePage(entry.word)
      })
      card.querySelector('[data-action="remove"]').addEventListener('click', async () => {
        const response = await sendRuntimeMessage({ type: 'panel-toggle-saved', entry })
        panelState.extensionState.savedWords = response.savedWords
        renderSavedWords()
        renderResults(panelState.lastAnalysis?.results || [])
        setStatus('已从收藏夹移除，并同步云端状态。')
      })

      refs.saved.appendChild(card)
    })
  }

  function renderResults(results) {
    if (!refs) return

    if (!refs?.results) return
    refs.results.innerHTML = ''

    if (!results || results.length === 0) {
      refs.results.innerHTML = `
        <div class="linswift-empty">
          ${
            panelState.youtube.enabled
              ? '当前视频字幕里还没有识别到明显超出你当前词库阶段的词。<br />先播放几句并打开字幕，再刷新一次。'
              : '当前页没有识别到明显超出你当前词库阶段的词。<br />同步词库后再重新扫描会更准确。'
          }
        </div>
      `
      return
    }

    results.forEach((item, index) => {
      const saved = Boolean(panelState.extensionState.savedWords[item.word])
      const saveCtaLabel = saved ? '已在生词本' : '加入生词本'
      const card = document.createElement('article')
      card.className = `linswift-card${index === 0 ? ' linswift-card--featured' : ''}`
      const detailText = item.note || item.snippet || ''
      const meaningMarkup = index === 0
        ? `
          <div class="linswift-card-feature-copy">
            <div class="linswift-card-feature-meaning">
              <p class="linswift-card-meaning">${escapeHtml(item.meaning || '释义补全中...')}</p>
            </div>
            ${detailText ? `<p class="linswift-card-feature-note">${escapeHtml(detailText.slice(0, 88))}</p>` : ''}
          </div>
        `
        : `
          <p class="linswift-card-meaning">${escapeHtml(item.meaning || '释义补全中...')}</p>
          ${detailText ? `<p class="linswift-card-note">${escapeHtml(detailText)}</p>` : ''}
        `
      card.innerHTML = `
        <div class="linswift-card-top">
          <div class="linswift-card-top-main">
            <p class="linswift-card-word">${escapeHtml(item.word)}</p>
            <p class="linswift-card-meta">
              出现 ${item.count} 次 · ${escapeHtml(item.difficulty)}${item.rank ? ` · 词频 ${item.rank}` : ''}
            </p>
          </div>
          <div class="linswift-card-top-side">
            <button
              class="linswift-save-star ${saved ? 'linswift-save-star--active' : ''}"
              type="button"
              data-action="save"
              aria-label="${saved ? '取消收藏' : '收藏'}"
              title="${saved ? '取消收藏' : '收藏'}"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2.6l2.86 5.8 6.4.93-4.63 4.51 1.09 6.37L12 17.2l-5.72 3.01 1.09-6.37L2.74 9.33l6.4-.93L12 2.6z"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="linswift-card-inline-links">
          <button class="linswift-card-inline-link linswift-card-inline-link--warm" type="button" data-action="known-link">标记掌握</button>
          <button class="linswift-card-inline-link" type="button" data-action="save-link" ${saved ? 'disabled' : ''}>${saveCtaLabel}</button>
        </div>
        ${meaningMarkup}
        <div class="linswift-card-actions">
          <button class="linswift-button" data-action="locate">定位</button>
          <button class="linswift-button" data-action="known">掌握</button>
          <button class="linswift-button" data-action="save-cta" ${saved ? 'disabled' : ''}>${saveCtaLabel}</button>
        </div>
      `

      card.querySelector('[data-action="locate"]').addEventListener('click', () => handleHighlight(item.word))
      card.querySelector('[data-action="known"]').addEventListener('click', () => handleKnown(item.word))
      card.querySelector('[data-action="known-link"]').addEventListener('click', () => handleKnown(item.word))
      card.querySelector('[data-action="save-link"]')?.addEventListener('click', () => {
        if (saved) {
          setStatus(`${item.word} 已在生词本中。`)
          return
        }
        void handleSave(buildWordEntry(item.word))
      })
      card.querySelector('[data-action="save"]').addEventListener('click', () => handleSave({
        word: item.word,
        meaning: item.meaning || '',
        note: item.note || '',
        phonetic: item.phonetic || '',
        pageTitle: panelState.lastAnalysis?.meta?.pageTitle || document.title,
        pageUrl: panelState.lastAnalysis?.meta?.pageUrl || window.location.href,
        savedAt: new Date().toISOString(),
      }))
      card.querySelector('[data-action="save-cta"]')?.addEventListener('click', () => {
        if (saved) {
          setStatus(`${item.word} 已在生词本中。`)
          return
        }
        void handleSave(buildWordEntry(item.word))
      })

      refs.results.appendChild(card)
    })
  }

  function renderAuthState() {
    if (!refs?.authCard) return

    if (panelState.auth.isAuthenticated) {
      refs.authCard.innerHTML = `
        <div class="linswift-settings-header">
          <p class="linswift-auth-label">账户与同步</p>
          <h3 class="linswift-settings-title">当前账号已连接</h3>
          <p class="linswift-settings-desc">插件、网页和桌面端会使用同一份词库与设置。</p>
        </div>
        <div class="linswift-auth-top">
          <div>
            <p class="linswift-auth-email">${escapeHtml(panelState.auth.email || '已登录')}</p>
            <p class="linswift-auth-note">同步状态稳定，可随时手动刷新云端数据。</p>
          </div>
          <span class="linswift-chip linswift-chip--accent">已连接</span>
        </div>
        <div class="linswift-auth-actions">
          <button class="linswift-button linswift-button--primary" type="button" data-auth-action="sync">立即同步</button>
          <button class="linswift-button" type="button" data-auth-action="signout">退出登录</button>
        </div>
      `

      refs.authCard
        .querySelector('[data-auth-action="sync"]')
        .addEventListener('click', handleSyncCloud)
      refs.authCard
        .querySelector('[data-auth-action="signout"]')
        .addEventListener('click', handleSignOut)
      return
    }

    refs.authCard.innerHTML = `
      <div class="linswift-settings-header">
        <p class="linswift-auth-label">账户与同步</p>
        <h3 class="linswift-settings-title">请先登录 Linswift 账号</h3>
        <p class="linswift-settings-desc">登录后即可同步生词夹、阅读进度与插件设置。</p>
      </div>
      <div class="linswift-auth-actions">
        <button class="linswift-button linswift-button--primary" type="button" data-auth-action="open-login">登录账号</button>
      </div>
    `

    refs.authCard
      .querySelector('[data-auth-action="open-login"]')
      .addEventListener('click', () => {
        renderLoginPage()
        setActivePanelPage('login')
      })
    renderLoginPage()
  }

  function renderLoginPage() {
    if (!refs?.loginAuthCard) return

    refs.loginAuthCard.innerHTML = `
      <section class="linswift-login-shell">
        <div class="linswift-login-header">
          <p class="linswift-auth-label">账号同步</p>
          <h3 class="linswift-login-title">登录后同步生词夹、阅读进度与插件设置</h3>
          <p class="linswift-login-desc">继续使用同一账户，即可在网页划词、翻译结果和桌面端设置之间无缝接续。</p>
        </div>
        <form class="linswift-auth-form" data-auth-form>
          <input class="linswift-input" type="email" placeholder="name@example.com" autocomplete="email" data-auth-email />
          <input class="linswift-input" type="password" placeholder="••••••••••••" autocomplete="current-password" data-auth-password />
          <button class="linswift-inline-link" type="button" data-auth-forgot>忘记密码？</button>
          <button class="linswift-button linswift-button--primary" type="submit" data-auth-action="signin">登录并同步</button>
        </form>
      </section>
      <section class="linswift-login-shell linswift-login-shell--secondary">
        <div class="linswift-login-header">
          <p class="linswift-auth-label">其他方式</p>
          <h3 class="linswift-login-kicker">使用其他方式继续</h3>
          <p class="linswift-login-desc">第三方登录和注册入口保留为辅助操作。</p>
        </div>
        <div class="linswift-login-alt">
          <div class="linswift-divider-row">
            <span></span>
            <em>其他方式登录</em>
            <span></span>
          </div>
          <div class="linswift-oauth-row">
            <button class="linswift-oauth-button linswift-oauth-button--google" type="button" data-auth-oauth="google">Google</button>
            <button class="linswift-oauth-button linswift-oauth-button--apple" type="button" data-auth-oauth="apple">Apple</button>
          </div>
          <div class="linswift-register-row">
            <span class="linswift-page-meta">还没有账号？</span>
            <button class="linswift-inline-link" type="button" data-auth-register>注册</button>
          </div>
        </div>
      </section>
    `

    refs.loginAuthCard
      .querySelector('[data-auth-form]')
      .addEventListener('submit', (event) => {
        event.preventDefault()
        void handleSignIn()
      })
    refs.loginAuthCard
      .querySelector('[data-auth-forgot]')
      .addEventListener('click', () => window.open('https://www.linswift.com/login', '_blank'))
    refs.loginAuthCard
      .querySelector('[data-auth-register]')
      .addEventListener('click', () => window.open('https://www.linswift.com/register', '_blank'))
    refs.loginAuthCard
      .querySelectorAll('[data-auth-oauth]')
      .forEach((button) => {
        button.addEventListener('click', () => {
          setStatus('当前插件先支持邮箱登录，第三方登录入口稍后开放。')
        })
      })
  }

  async function sendRuntimeMessage(payload) {
    const response = await Promise.race([
      chrome.runtime.sendMessage(payload),
      new Promise((_, reject) => {
        globalThis.setTimeout(() => {
          reject(new Error('扩展服务响应超时，请刷新插件后重试'))
        }, RUNTIME_MESSAGE_TIMEOUT_MS)
      }),
    ])
    if (!response?.ok) {
      throw new Error(response?.error || '扩展消息失败')
    }
    return response
  }

  async function handleHighlight(word) {
    try {
      if (panelState.youtube.enabled) {
        const activeButton = refs?.youtubeOverlay?.querySelector?.(
          `[data-youtube-word="${String(word || '').trim().toLowerCase()}"]`
        )
        if (activeButton) {
          await showInlineTooltipForWord(word, activeButton, { pinned: true })
          setStatus(`已定位当前字幕中的 ${word}`)
          return
        }
        setStatus(`当前显示的字幕里暂时没有 ${word}，继续播放后会自动出现。`)
        return
      }

      const result = highlightWordOnPage(word)
      setStatus(`已在页面中定位 ${word} · ${result.count} 处命中`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '页面高亮失败')
    }
  }

  function buildWordEntry(word) {
    const normalizedWord = String(word || '').trim().toLowerCase()
    const detail = getCachedWordDetail(normalizedWord) || getWordDetailFallback(normalizedWord)
    return {
      word: normalizedWord,
      meaning: detail.meaning || '',
      note: detail.note || '',
      phonetic: detail.phonetic || '',
      pageTitle: panelState.lastAnalysis?.meta?.pageTitle || document.title,
      pageUrl: panelState.lastAnalysis?.meta?.pageUrl || window.location.href,
      savedAt: new Date().toISOString(),
    }
  }

  async function handleKnown(word) {
    const normalizedWord = String(word || '').trim().toLowerCase()
    const response = await sendRuntimeMessage({ type: 'panel-add-known', word: normalizedWord })
    panelState.extensionState.knownWords = response.knownWords

    if (panelState.lastAnalysis) {
      panelState.lastAnalysis.results = panelState.lastAnalysis.results.filter(
        (item) => String(item.word || '').trim().toLowerCase() !== normalizedWord
      )
      if (panelState.lastAnalysis.meta) {
        panelState.lastAnalysis.meta.resultCount = panelState.lastAnalysis.results.length
      }
      renderResults(panelState.lastAnalysis.results)
      renderSummary()
      applyInlineTranslations(panelState.lastAnalysis.results)
      renderYouTubeOverlay()
    }

    removeInlineAnnotationsForWord(normalizedWord)
    hideInlineTooltip(true)

    setStatus('已标记为掌握，并同步到 Linswift 词库。')
  }

  async function handleSave(entry) {
    const response = await sendRuntimeMessage({ type: 'panel-toggle-saved', entry })
    panelState.extensionState.savedWords = response.savedWords
    renderResults(panelState.lastAnalysis?.results || [])
    renderSavedWords()
    if (activeInlineWord) {
      const detail = getCachedWordDetail(activeInlineWord) || getWordDetailFallback(activeInlineWord)
      renderTooltipContent(detail)
    }
    setStatus('收藏状态已更新。')
  }

  async function handleTooltipSave(word) {
    await handleSave(buildWordEntry(word))
  }

  async function handleTooltipKnown(word) {
    await handleKnown(word)
  }

  async function handleSignIn() {
    const emailInput = refs.loginAuthCard?.querySelector('[data-auth-email]')
    const passwordInput = refs.loginAuthCard?.querySelector('[data-auth-password]')
    const email = emailInput?.value?.trim() || ''
    const password = passwordInput?.value || ''

    try {
      setStatus('正在连接 Linswift 账号...')
      const response = await sendRuntimeMessage({
        type: 'panel-auth-sign-in',
        email,
        password,
      })

      panelState.auth = response.auth
      panelState.extensionState = response.state
      renderAuthState()
      renderSavedWords()
      renderSummary()
      setActivePanelPage('translate')
      setStatus('登录成功，正在同步云端词库...')
      void handleSyncCloud()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '登录失败')
    }
  }

  async function handleSignOut() {
    try {
      await sendRuntimeMessage({ type: 'panel-auth-sign-out' })
      panelState.auth = {
        isAuthenticated: false,
        email: '',
        userId: '',
        expiresAt: null,
      }
      renderAuthState()
      renderLoginPage()
      setActivePanelPage('login')
      setStatus('已退出 Linswift 账号。')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '退出失败')
    }
  }

  async function handleSyncCloud() {
    try {
      setStatus('正在同步本地与云端词库...')
      const response = await sendRuntimeMessage({ type: 'panel-sync-cloud' })
      panelState.auth = response.auth
      panelState.extensionState = response.state
      renderAuthState()
      renderSavedWords()
      renderSummary()
      setStatus(
        `同步完成 · 云端 ${response.syncSummary?.cloudWords || 0} 词，本地掌握 ${panelState.extensionState.knownWords.length} 词。`
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '同步失败')
    }
  }

  async function saveSettings() {
    const previousSettings = typeof structuredClone === 'function'
      ? structuredClone(panelState.extensionState.settings || {})
      : JSON.parse(JSON.stringify(panelState.extensionState.settings || {}))
    const previousInlineTranslateEnabled = Boolean(
      previousSettings.inlineTranslateEnabled
    )
    const previousLanguage = previousSettings.translationLanguage || 'zh-CN'
    const previousTranslationMode = previousSettings.translationMode || 'ai'
    const previousPronunciationVariant = previousSettings.pronunciationVariant || 'both'
    const previousYouTubeMode = previousSettings.youtubeSubtitleMode || 'vocab'
    const nextSettings = {
      ...previousSettings,
      inlineTranslateEnabled: Boolean(panelState.extensionState.settings.inlineTranslateEnabled),
      autoTranslateOnLoad: Boolean(panelState.extensionState.settings.autoTranslateOnLoad),
      translationLanguage: refs.translationLanguageSelect.value || previousLanguage,
      translationMode: refs.translationModeSelect?.value || previousTranslationMode,
      pronunciationVariant: refs.pronunciationVariantSelect?.value || previousPronunciationVariant,
      disabledAutoTranslateHosts: getDisabledAutoTranslateHosts(),
      youtubeSubtitleMode:
        refs.youtubeCard?.querySelector?.('[data-youtube-mode-select]')?.value || previousYouTubeMode,
      uiScale: getUiScaleStepByIndex(
        refs.sizeSlider?.value ?? getUiScaleStep().index
      ).value,
    }

    panelState.extensionState.settings = nextSettings
    applyUiScale()
    renderSummary()

    let response
    try {
      response = await sendRuntimeMessage({
        type: 'panel-save-settings',
        settings: nextSettings,
      })
    } catch (error) {
      panelState.extensionState.settings = previousSettings
      applyUiScale()
      renderSummary()
      throw error
    }

    panelState.extensionState.settings = response.settings
    applyUiScale()

    if (
      panelState.lastAnalysis?.results?.length &&
      (
        previousLanguage !== panelState.extensionState.settings.translationLanguage ||
        previousTranslationMode !== panelState.extensionState.settings.translationMode
      )
    ) {
      wordDetailCache.clear()
      hideInlineTooltip(true)
      setStatus(`正在切换页内直译语言到 ${getTranslationLanguageLabel()}...`)
      const enrichResponse = await sendRuntimeMessage({
        type: 'panel-enrich-results',
        results: panelState.lastAnalysis.results,
        targetLanguage: getTranslationLanguage(),
        translationMode: getTranslationMode(),
      })
      panelState.lastAnalysis.results = enrichResponse.results
      primeWordDetailCache(panelState.lastAnalysis.results)
      renderResults(panelState.lastAnalysis.results)
    }

    if (
      panelState.youtube.enabled &&
      (
        previousLanguage !== panelState.extensionState.settings.translationLanguage ||
        previousTranslationMode !== panelState.extensionState.settings.translationMode
      )
    ) {
      panelState.youtube.translations = {}
      panelState.youtube.translationUnavailable = false
      panelState.youtube.translationProvider = ''
      panelState.youtube.translationNote = ''
      panelState.youtube.transcriptTranslationStatus = 'idle'
      youtubeTranscriptTranslationRequestKey = ''
    }

    renderSummary()

    if (!panelState.extensionState.settings.inlineTranslateEnabled) {
      clearInlineTranslations()
    } else if (panelState.lastAnalysis?.results?.length) {
      applyInlineTranslations(panelState.lastAnalysis.results)
      syncInlineTranslationsFromCache(panelState.lastAnalysis.results)
    }

    if (
      panelState.youtube.enabled &&
      (
        previousInlineTranslateEnabled !== panelState.extensionState.settings.inlineTranslateEnabled ||
        previousLanguage !== panelState.extensionState.settings.translationLanguage ||
        previousTranslationMode !== panelState.extensionState.settings.translationMode ||
        previousYouTubeMode !== panelState.extensionState.settings.youtubeSubtitleMode
      )
    ) {
      renderYouTubeOverlay()
      if (shouldPretranslateYouTubeTranscript()) {
        void pretranslateYouTubeTranscript(panelState.youtube.transcriptCues)
      }
    }

    setStatus(`阅读设置已保存 · 当前翻译模式：${getTranslationModeLabel()}`)
  }

  async function toggleInlineTranslate() {
    const nextValue = !Boolean(panelState.extensionState.settings.inlineTranslateEnabled)
    panelState.extensionState.settings.inlineTranslateEnabled = nextValue
    try {
      await saveSettings()
      setStatus(`页内直译已${nextValue ? '开启' : '关闭'}。`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '页内直译设置保存失败')
    }
  }

  async function toggleAutoTranslateOnLoad() {
    panelState.extensionState.settings.autoTranslateOnLoad =
      !Boolean(panelState.extensionState.settings.autoTranslateOnLoad)
    try {
      await saveSettings()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '自动翻译设置保存失败')
      return
    }

    if (!panelState.extensionState.settings.autoTranslateOnLoad) {
      setStatus('已关闭网页自动翻译，圆球仍会常驻显示。')
      return
    }

    if (shouldAutoTranslateCurrentPage() && panelState.extensionState.settings.inlineTranslateEnabled) {
      setStatus('已开启网页自动翻译，正在重新扫描当前页面...')
      await runScan()
      return
    }

    setStatus('已开启网页自动翻译。开启“页内直译”后刷新页面会自动翻译。')
  }

  async function toggleCurrentSiteAutoTranslate() {
    const currentHostname = getCurrentHostname()
    if (!currentHostname) {
      setStatus('当前页面无法识别网站域名。')
      return
    }

    const disabledHosts = new Set(getDisabledAutoTranslateHosts())
    const willDisable = !disabledHosts.has(currentHostname)

    if (willDisable) {
      disabledHosts.add(currentHostname)
    } else {
      disabledHosts.delete(currentHostname)
    }

    panelState.extensionState.settings.disabledAutoTranslateHosts = Array.from(disabledHosts).sort()
    await saveSettings()

    if (willDisable) {
      clearInlineTranslations()
      clearHighlights()
      setStatus(`已记录 ${currentHostname} 不自动翻译，下次打开会保持关闭。`)
      return
    }

    if (shouldAutoTranslateCurrentPage() && panelState.extensionState.settings.inlineTranslateEnabled) {
      setStatus(`已恢复 ${currentHostname} 自动翻译，正在重新扫描...`)
      await runScan()
      return
    }

    setStatus(`已恢复 ${currentHostname} 自动翻译。`)
  }

  async function runScan() {
    try {
      panelState.showingSaved = false
      syncListVisibility()
      clearInlineTranslations()
      setLoading(true)
      syncYouTubePageState()
      const isYouTubeContext = panelState.youtube.enabled
      if (isYouTubeContext) {
        await ensureYouTubeTranscriptPrefetch()
      }
      setStatus(isYouTubeContext ? '正在抽取当前视频字幕...' : '正在抽取当前网页可见文本...')

      const pageData = isYouTubeContext
        ? {
            title: panelState.youtube.title || document.title,
            url: window.location.href,
            mode: 'youtube-subtitles',
            videoId: panelState.youtube.videoId,
            channel: panelState.youtube.channel,
            segments: buildYouTubeSegments(),
          }
        : {
            title: document.title,
            url: window.location.href,
            segments: extractVisibleSegments(),
          }

      if (!pageData.segments.length) {
        panelState.lastAnalysis = null
        renderSummary()
        renderResults([])
        setStatus(
          isYouTubeContext
            ? '当前视频还没有可分析的 Linswift 字幕。先等待整条字幕抓取完成，或播放几秒后再刷新。'
            : '当前网页可用文本很少，暂时无法识别。'
        )
        return
      }

      if (isYouTubeContext && pageData.segments.length < YOUTUBE_MIN_SEGMENTS_FOR_SCAN) {
        panelState.lastAnalysis = null
        renderSummary()
        renderResults([])
        setStatus('先等待 Linswift 抓到至少 3 条字幕，再开始视频词汇分析。')
        return
      }

      const analysisResponse = await sendRuntimeMessage({
        type: 'panel-analyze-page',
        pageData,
      })

      panelState.extensionState = analysisResponse.state
      panelState.lastAnalysis = analysisResponse.analysis
      primeWordDetailCache(panelState.lastAnalysis?.results)
      renderSummary()
      renderResults(panelState.lastAnalysis.results)
      renderSavedWords()

      if (panelState.lastAnalysis.results.length === 0) {
        setStatus(
          isYouTubeContext
            ? '当前视频字幕里暂时没有识别到明显候选生词。'
            : '当前页没有识别到明显的候选生词。'
        )
        renderYouTubeOverlay()
        return
      }

      setStatus(isYouTubeContext ? '正在补充字幕生词释义...' : '正在按 Linswift 翻译方式补充释义...')
      const enrichResponse = await sendRuntimeMessage({
        type: 'panel-enrich-results',
        results: panelState.lastAnalysis.results,
        targetLanguage: getTranslationLanguage(),
        translationMode: getTranslationMode(),
      })

      panelState.lastAnalysis.results = enrichResponse.results
      primeWordDetailCache(panelState.lastAnalysis.results)
      renderResults(panelState.lastAnalysis.results)
      renderSummary()
      const appliedCount = applyInlineTranslations(panelState.lastAnalysis.results)
      syncInlineTranslationsFromCache(panelState.lastAnalysis.results)
      renderYouTubeOverlay()
      if (panelState.extensionState.settings.inlineTranslateEnabled) {
        setStatus(
          isYouTubeContext
            ? `字幕识别完成，共找到 ${panelState.lastAnalysis.results.length} 个候选生词，当前字幕辅助已开启。`
            : `识别完成，共找到 ${panelState.lastAnalysis.results.length} 个候选生词，页内直译已标注 ${appliedCount} 处。`
        )
        return
      }
      setStatus(
        isYouTubeContext
          ? `字幕识别完成，共找到 ${panelState.lastAnalysis.results.length} 个候选生词。`
          : `识别完成，共找到 ${panelState.lastAnalysis.results.length} 个候选生词。`
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '扫描失败，请刷新页面后重试。')
    } finally {
      setLoading(false)
    }
  }

  async function startStudyFlow() {
    panelState.showingSaved = false
    syncListVisibility()

    if (!panelState.lastAnalysis?.results?.length) {
      await runScan()
      if (!panelState.lastAnalysis?.results?.length) return
    }

    openStudyFlow()
    const firstWord = panelState.study.cards[0]?.word
    if (firstWord) pronounceWord(firstWord)
  }

  function minimizePanel() {
    if (!refs) return
    hideInlineTooltip(true)
    hideSentencePopup(true)
    panelState.minimized = true
    panelState.hidden = false
    refs.panel.classList.add('linswift-hidden')
    refs.bubble.classList.remove('linswift-hidden')
    applyFloatingPosition(floatingPositionState)
    syncBubble()
    void persistCurrentFloatingPosition()
  }

  function restorePanel() {
    if (!refs) return
    panelState.minimized = false
    panelState.hidden = false
    refs.panel.classList.remove('linswift-hidden')
    refs.bubble.classList.add('linswift-hidden')
    applyFloatingPosition(floatingPositionState)
    void persistCurrentFloatingPosition()
  }

  function hidePanel() {
    if (!refs) return
    hideInlineTooltip(true)
    hideSentencePopup(true)
    panelState.hidden = true
    panelState.minimized = false
    refs.panel.classList.add('linswift-hidden')
    refs.bubble.classList.add('linswift-hidden')
    setStatus('Linswift 已关闭。点击浏览器工具栏图标可重新打开。')
    void persistCurrentFloatingPosition()
  }

  function bindRefs(root) {
    if (!root) return null

    refs = {
      root,
      panel: root.querySelector('.linswift-panel'),
      resizeHandle: root.querySelector('.linswift-resize-handle'),
      body: root.querySelector('.linswift-body'),
      bubble: root.querySelector('.linswift-bubble'),
      bubbleBadge: root.querySelector('[data-bubble-count]'),
      youtubeOverlay: root.querySelector('[data-youtube-overlay]'),
      headerSubtitle: root.querySelector('[data-header-subtitle]'),
      translatePageToggle: root.querySelector('[data-panel-view="translate"]'),
      settingsPageToggle: root.querySelector('[data-panel-view="settings"]'),
      translatePage: root.querySelector('[data-panel-page="translate"]'),
      settingsPage: root.querySelector('[data-panel-page="settings"]'),
      loginPage: root.querySelector('[data-panel-page="login"]'),
      sentencePage: root.querySelector('[data-panel-page="sentence"]'),
      kicker: root.querySelector('[data-panel-kicker]'),
      headline: root.querySelector('[data-headline]'),
      pageMeta: root.querySelector('[data-page-meta]'),
      translateDashboard: root.querySelector('.linswift-translate-dashboard'),
      authChip: root.querySelector('[data-auth-chip]'),
      authMeta: root.querySelector('[data-auth-meta]'),
      detectedCount: root.querySelector('[data-detected-count]'),
      comprehension: root.querySelector('[data-comprehension]'),
      knownCount: root.querySelector('[data-known-count]'),
      scanCount: root.querySelector('[data-scan-count]'),
      authCard: root.querySelector('[data-auth-card]'),
      youtubeCard: root.querySelector('[data-youtube-card]'),
      scanButton: root.querySelector('[data-scan-button]'),
      inlineToggle: root.querySelector('[data-inline-toggle]'),
      translationLanguageSelect: root.querySelector('[data-translation-language]'),
      translationModeSelect: root.querySelector('[data-translation-mode]'),
      pronunciationVariantSelect: root.querySelector('[data-pronunciation-variant]'),
      sizeSliderWrap: root.querySelector('[data-size-slider-wrap]'),
      sizeSlider: root.querySelector('[data-size-slider]'),
      sizeSliderLabel: root.querySelector('[data-size-slider-label]'),
      autoTranslateToggle: root.querySelector('[data-auto-translate-toggle]'),
      siteAutoTranslateToggle: root.querySelector('[data-site-auto-translate-toggle]'),
      displaySettingsAction: root.querySelector('[data-display-settings-action]'),
      results: root.querySelector('[data-results-list]'),
      status: root.querySelector('[data-status]'),
      studyButton: root.querySelector('[data-study-button]'),
      openSentenceButton: root.querySelector('[data-open-sentence]'),
      openLoginButton: root.querySelector('[data-open-login]'),
      header: root.querySelector('.linswift-header'),
      tooltip: root.querySelector('[data-inline-tooltip]'),
      sentencePopup: root.querySelector('[data-sentence-popup]'),
      studyOverlay: root.querySelector('[data-study-overlay]'),
      openSettingsButton: root.querySelector('[data-open-settings]'),
      loginAuthCard: root.querySelector('[data-login-auth-card]'),
      sentenceMode: root.querySelector('[data-sentence-mode]'),
      sentenceBefore: root.querySelector('[data-sentence-before]'),
      sentenceHighlight: root.querySelector('[data-sentence-highlight]'),
      sentenceAfter: root.querySelector('[data-sentence-after]'),
      sentenceTitle: root.querySelector('[data-sentence-title]'),
      sentenceTranslation: root.querySelector('[data-sentence-translation]'),
      sentenceVocabTitle: root.querySelector('[data-sentence-vocab-title]'),
      sentenceVocabList: root.querySelector('[data-sentence-vocab-list]'),
      sentenceCollectButton: root.querySelector('[data-sentence-collect]'),
      sentenceResumeButton: root.querySelector('[data-sentence-resume]'),
      sentenceSpeakButton: root.querySelector('[data-sentence-speak]'),
      sentenceSaveButton: root.querySelector('[data-sentence-save]'),
    }

    if (
      !refs.panel ||
      !refs.bubble ||
      !refs.root ||
      !refs.youtubeOverlay ||
      !refs.headerSubtitle ||
      !refs.translatePageToggle ||
      !refs.settingsPageToggle ||
      !refs.translatePage ||
      !refs.settingsPage ||
      !refs.kicker ||
      !refs.tooltip ||
      !refs.sentencePopup ||
      !refs.studyOverlay ||
      !refs.translationLanguageSelect ||
      !refs.translationModeSelect ||
      !refs.pronunciationVariantSelect
    ) {
      refs = null
      return null
    }

    return refs
  }

  function createPanel() {
    injectStyles()
    const existingRoot = document.getElementById(PANEL_ROOT_ID)
    if (existingRoot) {
      if (!refs) bindRefs(existingRoot)
      return existingRoot
    }

    const root = document.createElement('div')
    root.id = PANEL_ROOT_ID
    root.innerHTML = `
      <button class="linswift-bubble linswift-hidden" type="button">
        <span>L</span>
        <i class="linswift-bubble-badge linswift-hidden" data-bubble-count>0</i>
      </button>
      <section class="linswift-youtube-overlay linswift-hidden" data-youtube-overlay></section>
      <aside class="linswift-word-tooltip linswift-hidden" data-inline-tooltip></aside>
      <aside class="linswift-sentence-popup linswift-hidden" data-sentence-popup></aside>
      <section class="linswift-study-overlay linswift-hidden" data-study-overlay></section>
      <section class="linswift-panel linswift-hidden">
        <header class="linswift-header">
          <div class="linswift-brand">
            <div class="linswift-brand-badge">L</div>
            <div>
              <h2 class="linswift-header-title">Linswift</h2>
              <p class="linswift-header-subtitle" data-header-subtitle>网页生词雷达</p>
            </div>
          </div>
          <div class="linswift-header-actions">
            <button class="linswift-minimize" type="button" data-action="minimize" title="缩成圆球">−</button>
            <button class="linswift-close" type="button" data-action="close" title="彻底关闭插件">×</button>
          </div>
        </header>
        <div class="linswift-body">
          <section class="linswift-page-tabs">
            <button class="linswift-tab linswift-tab--active" type="button" data-panel-view="translate">翻译</button>
            <button class="linswift-tab" type="button" data-panel-view="settings">设置</button>
          </section>
          <section class="linswift-page" data-panel-page="translate">
            <section class="linswift-translate-shell">
              <section class="linswift-translate-dashboard">
                <p class="linswift-translate-summary-line" data-page-meta>当前网页 · 准备扫描</p>
                <section class="linswift-translate-spotlight">
                  <div class="linswift-translate-count">
                    <strong data-detected-count>0</strong>
                    <span>陌生词汇</span>
                  </div>
                  <div class="linswift-translate-meta">
                    <div class="linswift-translate-meta-top">
                      <p class="linswift-kicker" data-panel-kicker>词汇弹窗</p>
                      <h3 class="linswift-headline linswift-hidden" data-headline></h3>
                      <p class="linswift-translate-note linswift-hidden" data-auth-meta></p>
                    </div>
                    <section class="linswift-metrics">
                      <article class="linswift-metric linswift-metric--cool">
                        <strong data-scan-count>0</strong>
                        <span>扫描词数</span>
                      </article>
                      <article class="linswift-metric linswift-metric--cool">
                        <strong data-known-count>0</strong>
                        <span>已掌握</span>
                      </article>
                      <article class="linswift-metric linswift-hidden">
                        <strong data-comprehension>100%</strong>
                        <span>可理解度</span>
                      </article>
                    </section>
                  </div>
                </section>
                <section class="linswift-cta-row">
                  <button class="linswift-cta linswift-cta--primary" type="button" data-study-button>先学习</button>
                  <button class="linswift-cta linswift-cta--ghost" type="button" data-scan-button>重新扫描</button>
                </section>
                <section class="linswift-translate-links">
                  <button class="linswift-chip-button" type="button" data-open-sentence>整句模式</button>
                  <button class="linswift-chip-button" type="button" data-open-settings>翻译设置</button>
                  <button class="linswift-chip-button" type="button" data-open-login>账号同步</button>
                </section>
                <section class="linswift-youtube-card linswift-hidden" data-youtube-card></section>
              </section>
              <section class="linswift-result-head">
                <h3 class="linswift-result-title">识别结果</h3>
              </section>
              <p class="linswift-result-copy" data-status>点击“先学习”开始扫描当前网页。</p>
              <section class="linswift-results-list" data-results-list></section>
            </section>
          </section>
          <section class="linswift-page linswift-hidden" data-panel-page="settings">
            <div class="linswift-settings-stack">
              <section class="linswift-settings-group">
                <div class="linswift-settings-header">
                  <p class="linswift-section-label">语言与识别</p>
                </div>
                <div class="linswift-toolbar-row linswift-toolbar-row--secondary">
                  <select class="linswift-select" data-translation-language aria-label="页内直译语言">
                    <option value="zh-CN">页内直译 · 简中</option>
                    <option value="zh-TW">页内直译 · 繁中</option>
                    <option value="en">页内直译 · English</option>
                    <option value="ja">页内直译 · 日本語</option>
                    <option value="ko">页内直译 · 한국어</option>
                  </select>
                </div>
                <div class="linswift-toolbar-row linswift-toolbar-row--secondary">
                  <select class="linswift-select" data-translation-mode aria-label="网页翻译引擎">
                    <option value="hybrid">翻译引擎 · 混合模式</option>
                    <option value="deepl">翻译引擎 · DeepL</option>
                    <option value="ai">翻译引擎 · AI</option>
                  </select>
                  <div class="linswift-tag">网页 / 字幕</div>
                </div>
                <div class="linswift-toolbar-row linswift-toolbar-row--secondary">
                  <select class="linswift-select" data-pronunciation-variant aria-label="默认发音类型">
                    <option value="both">音标展示 · 英 / 美</option>
                    <option value="uk">默认发音 · 英式</option>
                    <option value="us">默认发音 · 美式</option>
                  </select>
                  <div class="linswift-tag">音标 / 发音</div>
                </div>
                <div class="linswift-toolbar-row linswift-toolbar-row--secondary">
                  <button class="linswift-button" type="button" data-inline-toggle>页内直译：关</button>
                  <button class="linswift-button" type="button" data-auto-translate-toggle>自动翻译网页：开</button>
                </div>
                <div class="linswift-toolbar-row linswift-toolbar-row--full">
                  <button class="linswift-button" type="button" data-site-auto-translate-toggle>当前网站自动翻译</button>
                </div>
                <p class="linswift-settings-note">词汇筛选会自动同步你的云端词库阶段。网页 / 字幕翻译引擎可选 DeepL 或 AI。</p>
              </section>
              <section class="linswift-settings-group">
                <div class="linswift-settings-header">
                  <p class="linswift-section-label">界面与显示</p>
                  <h3 class="linswift-settings-title">面板尺寸与呈现方式</h3>
                  <p class="linswift-settings-desc">统一控制插件面板体量和阅读密度。</p>
                </div>
                <div class="linswift-toolbar-row linswift-toolbar-row--secondary">
                  <div class="linswift-scale-control" data-size-slider-wrap>
                    <div class="linswift-scale-track" aria-hidden="true">
                      <span class="linswift-scale-track-fill"></span>
                      <span class="linswift-scale-stop"></span>
                      <span class="linswift-scale-stop"></span>
                      <span class="linswift-scale-stop"></span>
                      <span class="linswift-scale-stop"></span>
                      <span class="linswift-scale-stop"></span>
                    </div>
                    <input class="linswift-scale-range" data-size-slider type="range" min="0" max="4" step="1" value="2" aria-label="界面尺寸" />
                    <div class="linswift-scale-meta">
                      <span class="linswift-scale-title">拖动调节</span>
                      <strong class="linswift-scale-value" data-size-slider-label>标准</strong>
                    </div>
                  </div>
                  <button class="linswift-button linswift-button--soft" type="button" data-display-settings-action>点击设置</button>
                </div>
                <p class="linswift-settings-note">这里统一控制账户、目标语言、页内直译和界面大小。翻译结果与字幕页会同步使用这些设置。</p>
              </section>
              <section class="linswift-auth-card" data-auth-card></section>
            </div>
          </section>
          <section class="linswift-page linswift-hidden linswift-login-page" data-panel-page="login">
            <section class="linswift-auth-card" data-login-auth-card></section>
          </section>
          <section class="linswift-page linswift-hidden linswift-sentence-page" data-panel-page="sentence">
            <section class="linswift-sentence-card">
              <div class="linswift-sentence-top">
                <h3 class="linswift-sentence-title" data-sentence-title></h3>
                <span class="linswift-chip linswift-chip--accent">划句</span>
              </div>
              <div class="linswift-sentence-translation">
                <strong>中文翻译</strong>
                <p data-sentence-translation></p>
              </div>
              <div class="linswift-sentence-actions">
                <button class="linswift-button linswift-button--primary" type="button" data-sentence-save>智慧识词：开</button>
                <button class="linswift-button" type="button" data-sentence-speak>朗读整句</button>
              </div>
              <div class="linswift-sentence-vocab">
                <p class="linswift-page-meta" data-sentence-vocab-title></p>
                <div class="linswift-sentence-vocab-list" data-sentence-vocab-list></div>
                <button class="linswift-button" type="button" data-sentence-collect>一键收录句中生词</button>
              </div>
              <button class="linswift-button" type="button" data-sentence-resume>加入阅读例句，下次继续出现</button>
            </section>
            <section class="linswift-sentence-context">
              <span class="linswift-chip linswift-sentence-mode" data-sentence-mode>当前网页 · 划句模式</span>
              <p class="linswift-sentence-copy" data-sentence-before></p>
              <div class="linswift-sentence-highlight">
                <p data-sentence-highlight></p>
              </div>
              <p class="linswift-sentence-copy" data-sentence-after></p>
            </section>
          </section>
        </div>
        <button class="linswift-resize-handle" type="button" aria-label="调整面板大小" title="拖动调整面板大小"></button>
      </section>
    `

    getFloatingHostElement().appendChild(root)
    bindRefs(root)
    syncYouTubeOverlayHostElement()
    syncPanelPageVisibility()

    refs.studyButton.addEventListener('click', startStudyFlow)
    refs.scanButton.addEventListener('click', runScan)
    refs.translatePageToggle.addEventListener('click', () => {
      setActivePanelPage('translate')
    })
    refs.settingsPageToggle.addEventListener('click', () => {
      setActivePanelPage('settings')
    })
    refs.openSettingsButton?.addEventListener('click', () => {
      setActivePanelPage('settings')
    })
    refs.openLoginButton?.addEventListener('click', () => {
      renderLoginPage()
      setActivePanelPage('login')
    })
    refs.openSentenceButton?.addEventListener('click', () => {
      void openSentencePage()
    })
    refs.inlineToggle.addEventListener('click', () => {
      void toggleInlineTranslate()
    })
    refs.autoTranslateToggle?.addEventListener('click', () => {
      void toggleAutoTranslateOnLoad()
    })
    refs.siteAutoTranslateToggle?.addEventListener('click', () => {
      void toggleCurrentSiteAutoTranslate()
    })
    refs.translationLanguageSelect.addEventListener('change', saveSettings)
    refs.translationModeSelect.addEventListener('change', saveSettings)
    refs.pronunciationVariantSelect.addEventListener('change', saveSettings)
    refs.sizeSlider?.addEventListener('input', () => {
      previewUiScale(refs.sizeSlider.value)
    })
    refs.sizeSlider?.addEventListener('change', saveSettings)
    refs.displaySettingsAction?.addEventListener('click', () => {
      const currentStep = getUiScaleStepByIndex(refs.sizeSlider?.value ?? getUiScaleStep().index)
      const nextStep = getUiScaleStepByIndex((currentStep.index + 1) % UI_SCALE_STEPS.length)
      if (refs.sizeSlider) {
        refs.sizeSlider.value = String(nextStep.index)
      }
      previewUiScale(nextStep.index)
      void saveSettings()
    })
    refs.sentenceCollectButton?.addEventListener('click', async () => {
      const entries = panelState.sentenceDraft?.vocab || []
      for (const entry of entries) {
        if (!panelState.extensionState.savedWords?.[entry.word]) {
          await handleSave(buildWordEntry(entry.word))
        }
      }
      setStatus('句中生词已收录到收藏夹。')
    })
    refs.sentenceResumeButton?.addEventListener('click', () => {
      setActivePanelPage('translate')
      setStatus('已加入阅读例句，下次继续出现。')
    })
    refs.sentenceSaveButton?.addEventListener('click', async () => {
      const draft = panelState.sentenceDraft
      const nextEnabled = !isSentenceSmartVocabEnabled()
      await setSentenceSmartVocabEnabled(nextEnabled)
      if (draft) {
        if (nextEnabled) {
          setStatus('智慧识词已开启，正在识别句中词汇。')
          await enrichSentenceDraft(draft)
        } else {
          draft.vocab = []
          setStatus('智慧识词已关闭，当前只做整句翻译。')
        }
        panelState.sentenceDraft = draft
        renderSentencePage()
      }
    })
    refs.sentenceSpeakButton?.addEventListener('click', () => {
      const sentence = panelState.sentenceDraft?.sentence || ''
      if (!sentence || !window.speechSynthesis) {
        setStatus('当前环境暂不支持朗读。')
        return
      }
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(sentence)
      utterance.lang = 'en-US'
      window.speechSynthesis.speak(utterance)
      setStatus('正在朗读整句。')
    })
    refs.tooltip.addEventListener('mouseenter', clearInlineTooltipHideTimer)
    refs.tooltip.addEventListener('mouseleave', () => {
      if (!inlineTooltipPinned) {
        scheduleHideInlineTooltip()
      }
    })
    let bubbleDragMoved = false
    refs.bubble.addEventListener('click', (event) => {
      if (bubbleDragMoved) {
        event.preventDefault()
        bubbleDragMoved = false
        return
      }
      restorePanel()
    })
    root.querySelector('[data-action="close"]').addEventListener('click', hidePanel)
    root.querySelectorAll('[data-action="minimize"]').forEach((button) => {
      button.addEventListener('click', minimizePanel)
    })

    let dragState = null

    refs.header.addEventListener('mousedown', (event) => {
      if (event.target.closest('button')) return
      const rect = refs.panel.getBoundingClientRect()
      dragState = {
        mode: 'panel',
        startX: event.clientX,
        startY: event.clientY,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      }
      document.documentElement.classList.add('linswift-dragging')
    })

    refs.bubble.addEventListener('mousedown', (event) => {
      if (!panelState.minimized || panelState.hidden) return
      const rect = refs.bubble.getBoundingClientRect()
      bubbleDragMoved = false
      dragState = {
        mode: 'bubble',
        startX: event.clientX,
        startY: event.clientY,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      }
      document.documentElement.classList.add('linswift-dragging')
    })

    refs.resizeHandle?.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (panelState.hidden || panelState.minimized) return
      const { width, height } = getPanelSizeSettings()
      dragState = {
        mode: 'resize-panel',
        startX: event.clientX,
        startY: event.clientY,
        startWidth: width,
        startHeight: height,
      }
      document.documentElement.classList.add('linswift-dragging')
    })

    window.addEventListener('mousemove', (event) => {
      if (!dragState || panelState.hidden) return
      if (dragState.mode === 'resize-panel') {
        const scale = getUiScale()
        const bounds = getPanelResizeBounds()
        panelState.extensionState.settings.panelWidth = clamp(
          Math.round(dragState.startWidth + (event.clientX - dragState.startX) / scale),
          bounds.minWidth,
          bounds.maxWidth
        )
        panelState.extensionState.settings.panelHeight = clamp(
          Math.round(dragState.startHeight + (event.clientY - dragState.startY) / scale),
          bounds.minHeight,
          bounds.maxHeight
        )
        applyPanelSize()
        applyFloatingPosition(floatingPositionState)
        return
      }
      const moved =
        Math.abs(event.clientX - dragState.startX) > 4 ||
        Math.abs(event.clientY - dragState.startY) > 4
      if (dragState.mode === 'bubble' && moved) {
        bubbleDragMoved = true
      }

      const targetRect =
        dragState.mode === 'bubble'
          ? refs.bubble.getBoundingClientRect()
          : refs.panel.getBoundingClientRect()
      const left = Math.min(
        Math.max(12, event.clientX - dragState.offsetX),
        window.innerWidth - targetRect.width - 12
      )
      const top = Math.min(
        Math.max(12, event.clientY - dragState.offsetY),
        window.innerHeight - targetRect.height - 12
      )
      refs.root.style.left = `${left}px`
      refs.root.style.top = `${top}px`
      refs.root.style.right = 'auto'
      refs.root.style.bottom = 'auto'
    })

    window.addEventListener('mouseup', () => {
      const hadDragState = Boolean(dragState)
      const shouldSavePanelSize = dragState?.mode === 'resize-panel'
      dragState = null
      document.documentElement.classList.remove('linswift-dragging')
      if (shouldSavePanelSize) {
        schedulePersistPanelSize()
      }
      if (hadDragState) {
        void persistCurrentFloatingPosition()
      }
    })
    document.addEventListener('mousedown', (event) => {
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest(`.${SELECTION_HIGHLIGHT_CLASS}`)) return
      if (target?.closest('.linswift-inline-annotation')) return
      if (target?.closest(`#${PANEL_ROOT_ID}`)) return
      if (target && refs?.sentencePopup && refs.sentencePopup.contains(target)) return
      if (target && refs?.tooltip && refs.tooltip.contains(target)) return
      hideInlineTooltip(true)
      hideSentencePopup(true)
    })
    document.addEventListener('click', (event) => {
      if (Date.now() - lastSelectionTooltipOpenedAt < 180) return
      if (event.target.closest('.linswift-inline-annotation')) return
      if (event.target.closest(`.${SELECTION_HIGHLIGHT_CLASS}`)) return
      if (
        refs?.sentencePopup &&
        !refs.sentencePopup.classList.contains('linswift-hidden') &&
        refs.sentencePopup.contains(event.target)
      ) {
        return
      }
      if (
        refs?.tooltip &&
        !refs.tooltip.classList.contains('linswift-hidden') &&
        refs.tooltip.contains(event.target)
      ) {
        return
      }
      hideInlineTooltip(true)
      hideSentencePopup(true)
    })
    window.addEventListener('scroll', () => {
      if (activeInlineWord && refs?.tooltip && !refs.tooltip.classList.contains('linswift-hidden')) {
        if (activeTooltipSource === 'selection') {
          hideInlineTooltip(true)
        } else {
          const activeAnnotation = inlineAnnotationRecords.find(
            (item) =>
              item?.wrapper?.isConnected &&
              String(item.word || item.wrapper.dataset.word || '').trim().toLowerCase() === activeInlineWord
          )?.wrapper
          if (!activeAnnotation) {
            hideInlineTooltip(true)
          } else {
            positionInlineTooltip(activeAnnotation)
          }
        }
      }

      if (sentencePopupVisible && refs?.sentencePopup && !refs.sentencePopup.classList.contains('linswift-hidden')) {
        hideSentencePopup(true)
      }
    }, true)
    window.addEventListener('scroll', positionYouTubeOverlay, true)
    window.addEventListener('resize', () => {
      positionYouTubeOverlay()
      applyPanelSize()
      applyFloatingPosition(floatingPositionState)
      if (sentencePopupVisible && refs?.sentencePopup) {
        hideSentencePopup(true)
      }
    })
    document.addEventListener('fullscreenchange', () => {
      syncFloatingHostElement()
      syncYouTubeOverlayHostElement()
      positionYouTubeOverlay()
      applyFloatingPosition(floatingPositionState)
    })

    return root
  }

  async function initializePanelState(forceRefresh = false) {
    if (panelState.initialized) {
      if (forceRefresh) {
        await refreshExtensionStateFromStorage({ render: Boolean(refs) })
      }
      return
    }

    syncYouTubePageState()
    const response = await sendRuntimeMessage({ type: 'panel-load-state' })
    panelState.extensionState = response.state
    panelState.auth = response.auth
    restoreDefaultPageForLoggedOutState()
    applyUiScale()
    applyPanelSize()

    renderAuthState()
    renderSummary()
    renderResults([])
    renderSavedWords()
    syncPanelPageVisibility()
    syncListVisibility()
    renderYouTubeOverlay()
    if (shouldPretranslateYouTubeTranscript()) {
      void pretranslateYouTubeTranscript(panelState.youtube.transcriptCues)
    }
    if (panelState.youtube.enabled) {
      void bootstrapYouTubeSession()
    }
    panelState.initialized = true
  }

  async function bootstrapResidentPanel() {
    if (residentPanelBootstrapped) return
    residentPanelBootstrapped = true

    createPanel()
    if (!refs) return

    refs.root.style.right = refs.root.style.right || '24px'
    refs.root.style.bottom = refs.root.style.bottom || '24px'
    refs.root.style.left = refs.root.style.left || 'auto'
    refs.root.style.top = refs.root.style.top || 'auto'
    await loadFloatingPosition()

    await initializePanelState()
    panelState.hidden = false
    panelState.minimized = true
    refs.panel.classList.add('linswift-hidden')
    refs.bubble.classList.remove('linswift-hidden')
    applyFloatingPosition(floatingPositionState)
    syncBubble()

    if (shouldAutoTranslateCurrentPage() && panelState.extensionState.settings.inlineTranslateEnabled) {
      setStatus('网页自动翻译已开启，正在扫描当前页面...')
      await runScan()
      return
    }

    if (isCurrentSiteAutoTranslateDisabled()) {
      setStatus(`当前网站已设为不自动翻译：${getCurrentHostname()}`)
      return
    }

    setStatus('Linswift 已常驻当前页面，点击圆球继续操作。')
  }

  async function showPanel() {
    createPanel()
    if (!refs) {
      const root = document.getElementById(PANEL_ROOT_ID)
      bindRefs(root)
    }
    if (!refs) {
      throw new Error('Linswift 浮层初始化失败')
    }
    panelState.hidden = false
    panelState.minimized = false
    refs.panel.classList.remove('linswift-hidden')
    refs.bubble.classList.add('linswift-hidden')
    syncPanelPageVisibility()
    refs.root.style.right = refs.root.style.right || '24px'
    refs.root.style.bottom = refs.root.style.bottom || '24px'
    refs.root.style.left = refs.root.style.left || 'auto'
    refs.root.style.top = refs.root.style.top || 'auto'
    await loadFloatingPosition()
    syncYouTubePageState()
    setStatus(
      panelState.youtube.enabled
        ? 'YouTube 字幕模式已就绪，正在加载你的 Linswift 状态...'
        : '浮层已就绪，正在加载你的 Linswift 状态...'
    )

    try {
      await initializePanelState()
      restoreDefaultPageForLoggedOutState()
      applyFloatingPosition(floatingPositionState)
      if (panelState.youtube.enabled) {
        setStatus('YouTube 模式已启动，正在连接视频并预抓整条字幕...')
        void bootstrapYouTubeSession().then(() => {
          if (!panelState.lastAnalysis) {
            setStatus(
              panelState.youtube.subtitleReady
                ? '字幕已自动就绪，整条字幕正在后台持续预抓取，点击“先学习”即可开始。'
                : '已自动尝试抓取整条字幕；如果该视频没有可用字幕，会保持普通视频模式。'
            )
          }
        })
      }
      if (!panelState.lastAnalysis) {
        setStatus(
          panelState.youtube.enabled
            ? '字幕模式已就绪，正在自动准备整条字幕...'
            : '浮层已就绪，点击“先学习”开始扫描当前网页。'
        )
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '浮层初始化失败，请稍后重试。')
    }
  }

  async function toggleFloatingPanel() {
    if (panelState.hidden) {
      await showPanel()
      return
    }

    if (panelState.minimized) {
      restorePanel()
      return
    }

    refs.panel.animate(
      [
        { transform: 'translateY(0) scale(1)' },
        { transform: 'translateY(-6px) scale(1.01)' },
        { transform: 'translateY(0) scale(1)' },
      ],
      { duration: 240, easing: 'ease-out' }
    )
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'linswift-ping') {
      sendResponse({ ok: true })
      return true
    }

    if (message?.type === 'toggle-floating-panel') {
      toggleFloatingPanel().then(() => sendResponse({ ok: true }))
      return true
    }

    if (message?.type === 'extract-page-data') {
      sendResponse({
        title: document.title,
        url: window.location.href,
        segments: extractVisibleSegments(),
      })
      return true
    }

    if (message?.type === 'highlight-word') {
      sendResponse(highlightWordOnPage(String(message.word || '')))
      return true
    }

    if (message?.type === 'clear-highlights') {
      clearHighlights()
      sendResponse({ cleared: true })
      return true
    }

    return false
  })

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return

    const nextStoredState = {}
    let hasRelevantChange = false

    if (Object.prototype.hasOwnProperty.call(changes, SETTINGS_STORAGE_KEY)) {
      nextStoredState[SETTINGS_STORAGE_KEY] = changes[SETTINGS_STORAGE_KEY]?.newValue || {}
      hasRelevantChange = true
    }

    if (Object.prototype.hasOwnProperty.call(changes, KNOWN_WORDS_STORAGE_KEY)) {
      nextStoredState[KNOWN_WORDS_STORAGE_KEY] = Array.isArray(changes[KNOWN_WORDS_STORAGE_KEY]?.newValue)
        ? changes[KNOWN_WORDS_STORAGE_KEY].newValue
        : []
      hasRelevantChange = true
    }

    if (Object.prototype.hasOwnProperty.call(changes, SAVED_WORDS_STORAGE_KEY)) {
      nextStoredState[SAVED_WORDS_STORAGE_KEY] =
        changes[SAVED_WORDS_STORAGE_KEY]?.newValue &&
        typeof changes[SAVED_WORDS_STORAGE_KEY].newValue === 'object'
          ? changes[SAVED_WORDS_STORAGE_KEY].newValue
          : {}
      hasRelevantChange = true
    }

    if (!hasRelevantChange) return

    applyStoredExtensionState(nextStoredState, { render: Boolean(refs) })
  })

  document.addEventListener('mouseup', (event) => {
    if (event.button !== 0) return
    if (event.target?.closest?.(`#${PANEL_ROOT_ID}`)) return
    if (event.target?.closest?.('.linswift-inline-annotation')) return

    window.setTimeout(() => {
      void handleSelectionTranslationLookup()
    }, 0)
  })

  window.addEventListener('message', handleYouTubePageBridgeMessage)
  ensureYouTubePolling()
  window.addEventListener('yt-navigate-finish', () => {
    syncYouTubePageState()
    renderSummary()
  })

  if (shouldAutoOpenDemoPanel()) {
    void showPanel().catch(() => {})
  } else {
    void bootstrapResidentPanel().catch(() => {})
  }
}
