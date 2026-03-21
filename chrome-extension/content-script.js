if (!window.__LINSWIFT_CONTENT_SCRIPT__) {
  window.__LINSWIFT_CONTENT_SCRIPT__ = true

  const HIGHLIGHT_CLASS = 'linswift-word-highlight'
  const SELECTION_HIGHLIGHT_CLASS = 'linswift-selection-highlight'
  const PANEL_STYLE_ID = 'linswift-floating-style'
  const PANEL_ROOT_ID = 'linswift-floating-root'
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
  const TRANSLATION_LANGUAGE_OPTIONS = {
    'zh-CN': '简中',
    'zh-TW': '繁中',
    en: 'English',
    ja: '日本語',
    ko: '한국어',
  }
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
        disabledAutoTranslateHosts: [],
        youtubeSubtitleMode: 'vocab',
        uiScale: 0.56,
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

  function shouldAutoOpenDemoPanel() {
    return document.querySelector('meta[name="linswift-demo-auto-open"][content="1"]') !== null
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

      .linswift-tooltip-word {
        margin: 0;
        font-size: 21px;
        line-height: 1.1;
        font-weight: 800;
      }

      .linswift-tooltip-phonetic {
        margin: 6px 0 0;
        color: #8e8377;
        font-size: 14px;
        line-height: 1.5;
      }

      .linswift-tooltip-meaning {
        margin: 10px 0 0;
        font-size: 14px;
        line-height: 1.55;
        color: #2f261f;
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
        --linswift-ui-scale: 0.56;
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
        width: min(352px, calc(100vw - 28px));
        max-height: min(82vh, 760px);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border-radius: 28px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.76), rgba(255, 248, 242, 0.68));
        box-shadow:
          0 28px 72px rgba(31, 26, 22, 0.22),
          0 8px 24px rgba(255, 132, 0, 0.12),
          inset 0 1px 0 rgba(255, 255, 255, 0.42);
        border: 1px solid rgba(255, 255, 255, 0.34);
        backdrop-filter: blur(22px) saturate(1.15);
        -webkit-backdrop-filter: blur(22px) saturate(1.15);
        zoom: var(--linswift-ui-scale);
        transform-origin: right bottom;
      }

      .linswift-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 18px 18px 16px;
        background:
          linear-gradient(135deg, rgba(255, 138, 0, 0.88), rgba(255, 122, 0, 0.78)),
          linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.02));
        color: #fff;
        cursor: move;
        border-bottom: 1px solid rgba(255, 255, 255, 0.14);
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
        width: 40px;
        height: 40px;
        border-radius: 14px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.16);
        border: 1px solid rgba(255, 255, 255, 0.16);
        font-size: 24px;
        font-weight: 800;
      }

      .linswift-header-title {
        margin: 0;
        font-size: 16px;
        font-weight: 800;
        letter-spacing: 0.01em;
      }

      .linswift-header-subtitle {
        margin: 4px 0 0;
        font-size: 11px;
        line-height: 1.5;
        opacity: 0.82;
      }

      .linswift-close {
        width: 42px;
        height: 42px;
        border: 0;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.16);
        color: #fff;
        font-size: 24px;
        cursor: pointer;
      }

      .linswift-minimize {
        width: 42px;
        height: 42px;
        border: 0;
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
        padding: 12px 12px 14px;
        overflow-y: auto;
        overscroll-behavior: contain;
      }

      .linswift-page-tabs {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      .linswift-page {
        display: grid;
        gap: 10px;
        min-height: 0;
      }

      .linswift-translate-actions,
      .linswift-settings-stack {
        display: grid;
        gap: 8px;
      }

      .linswift-translate-actions {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .linswift-kicker {
        margin: 0;
        font-size: 11px;
        color: #b9b0a7;
      }

      .linswift-headline {
        margin: 4px 0 0;
        font-size: 17px;
        line-height: 1.2;
        font-weight: 800;
      }

      .linswift-page-meta {
        margin: 4px 0 0;
        font-size: 11px;
        line-height: 1.45;
        color: #93897f;
      }

      .linswift-metrics {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      .linswift-metric {
        padding: 11px 11px 10px;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.34);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.32);
      }

      .linswift-metric--warm {
        background: #fff4e8;
      }

      .linswift-metric--cool {
        background: #e8fbf2;
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
        color: #19b97a;
      }

      .linswift-metric span {
        display: block;
        margin-top: 6px;
        color: #9d9388;
        font-size: 11px;
      }

      .linswift-cta-row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
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
        min-height: 38px;
        border-radius: 12px;
        border: 2px solid transparent;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
      }

      .linswift-cta--ghost {
        background: #fff;
        border-color: #ff8400;
        color: #ff8400;
      }

      .linswift-cta--primary,
      .linswift-button--primary,
      .linswift-tab--active {
        background: linear-gradient(135deg, #ff8a00, #ff7a00);
        color: #fff;
        box-shadow: 0 12px 24px rgba(255, 132, 0, 0.2);
      }

      .linswift-button {
        border: 1px solid rgba(255, 255, 255, 0.32);
        background: rgba(255, 255, 255, 0.62);
        backdrop-filter: blur(12px);
        color: #342b23;
        padding: 0 12px;
      }

      .linswift-button[disabled] {
        opacity: 0.55;
        cursor: progress;
      }

      .linswift-auth-card,
      .linswift-toolbar {
        padding: 10px;
        border-radius: 16px;
        background: rgba(255, 250, 245, 0.54);
        border: 1px solid rgba(255, 255, 255, 0.32);
        backdrop-filter: blur(10px);
      }

      .linswift-auth-top,
      .linswift-auth-actions,
      .linswift-toolbar,
      .linswift-toolbar-row,
      .linswift-card-actions,
      .linswift-tabs {
        display: grid;
        gap: 8px;
      }

      .linswift-auth-top {
        grid-template-columns: 1fr auto;
        align-items: center;
      }

      .linswift-auth-label,
      .linswift-section-label {
        margin: 0;
        font-size: 11px;
        font-weight: 700;
        color: #9b8d82;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .linswift-auth-email {
        margin: 4px 0 0;
        font-size: 13px;
        font-weight: 700;
      }

      .linswift-auth-note,
      .linswift-status,
      .linswift-card-note,
      .linswift-card-meta {
        margin: 0;
        color: #8d8176;
        font-size: 11px;
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
      }

      .linswift-toolbar-row--secondary {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      }

      .linswift-settings-note {
        margin: 0;
        color: #8d8176;
        font-size: 11px;
        line-height: 1.45;
      }

      .linswift-auth-form {
        display: grid;
        gap: 8px;
      }

      .linswift-select,
      .linswift-input {
        width: 100%;
        min-height: 36px;
        padding: 0 10px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.34);
        background: rgba(255, 255, 255, 0.66);
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
        padding: 10px;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.34);
        background: rgba(255, 255, 255, 0.66);
        backdrop-filter: blur(12px);
      }

      .linswift-card-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .linswift-card-word {
        margin: 0;
        font-size: 16px;
        font-weight: 800;
      }

      .linswift-card-meaning,
      .linswift-card-snippet {
        margin: 7px 0 0;
        font-size: 12px;
        line-height: 1.5;
      }

      .linswift-card-snippet {
        color: #6c6259;
      }

      .linswift-tag {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 46px;
        padding: 5px 9px;
        border-radius: 999px;
        background: rgba(255, 132, 0, 0.1);
        color: #ff8400;
        font-size: 11px;
        font-weight: 800;
      }

      .linswift-card-actions {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        margin-top: 8px;
      }

      .linswift-footer-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .linswift-empty {
        padding: 12px;
        border-radius: 16px;
        background: rgba(255, 250, 245, 0.52);
        border: 1px dashed rgba(255, 132, 0, 0.16);
        font-size: 11px;
        color: #8c8176;
        line-height: 1.5;
        text-align: center;
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
          <span>${escapeHtml(getTranslationLanguageLabel())}</span>
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
        })

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
      })

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
    const mark = selectionHighlightRecord?.mark
    if (!mark?.isConnected) {
      selectionHighlightRecord = null
      return
    }

    const textNode = document.createTextNode(
      selectionHighlightRecord.text || mark.textContent || ''
    )
    mark.replaceWith(textNode)
    selectionHighlightRecord.parent?.normalize?.()
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

  function applySelectionHighlight(range, word) {
    if (!range || range.collapsed) return null

    const textNode = range.startContainer
    if (
      textNode?.nodeType !== Node.TEXT_NODE ||
      range.startContainer !== range.endContainer ||
      range.startOffset >= range.endOffset
    ) {
      return null
    }

    const sourceText = textNode.textContent || ''
    const selectedText = sourceText.slice(range.startOffset, range.endOffset)
    if (!selectedText) return null

    const fragment = document.createDocumentFragment()
    const parent = textNode.parentNode
    if (!parent) return null

    if (range.startOffset > 0) {
      fragment.appendChild(document.createTextNode(sourceText.slice(0, range.startOffset)))
    }

    const mark = document.createElement('span')
    mark.className = SELECTION_HIGHLIGHT_CLASS
    mark.dataset.word = word
    mark.textContent = selectedText
    fragment.appendChild(mark)

    if (range.endOffset < sourceText.length) {
      fragment.appendChild(document.createTextNode(sourceText.slice(range.endOffset)))
    }

    parent.replaceChild(fragment, textNode)
    selectionHighlightRecord = {
      mark,
      parent,
      text: selectedText,
      word,
    }

    return mark
  }

  function getSelectionLookupTarget() {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null

    const rawText = selection.toString()
    const word = normalizeSelectionWord(rawText)
    if (!word) return null

    const range = selection.getRangeAt(0)
    const parentElement =
      range.commonAncestorContainer instanceof Element
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement

    if (!parentElement || shouldIgnoreNode(parentElement)) return null
    if (parentElement.closest('.linswift-inline-annotation')) return null

    return { selection, range, word }
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
      const cached = wordDetailCache.get(normalizedWord)
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
      meaning: resultEntry?.meaning || '正在补充详细释义...',
      note: resultEntry?.note || '悬浮查看完整词卡',
      examples: resultEntry?.snippet ? [resultEntry.snippet] : [],
    }
  }

  function primeWordDetailCache(results) {
    if (!Array.isArray(results)) return

    results.forEach((item) => {
      const normalizedWord = String(item?.word || '').trim().toLowerCase()
      if (!normalizedWord) return
      const existing = wordDetailCache.get(normalizedWord) || {}
      wordDetailCache.set(normalizedWord, {
        word: normalizedWord,
        phonetic: item?.phonetic || existing.phonetic || '',
        meaning: item?.meaning || existing.meaning || '暂无释义',
        note: item?.note || existing.note || '',
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
    const phonetic = detail?.phonetic ? escapeHtml(detail.phonetic) : ''
    const meaning = escapeHtml(detail?.meaning || '暂无释义')
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

    refs.tooltip.dataset.loading = 'false'
    refs.tooltip.innerHTML = `
      <div class="linswift-tooltip-top">
        <div>
          <p class="linswift-tooltip-word">${escapeHtml(normalizedWord || detail?.word || '')}</p>
          ${phonetic ? `<p class="linswift-tooltip-phonetic">${phonetic}</p>` : ''}
        </div>
        <span class="linswift-tag">${known ? '已会' : savedEntry ? '已收藏' : '生词'}</span>
      </div>
      <p class="linswift-tooltip-meaning">${meaning}</p>
      ${note}
      <div class="linswift-tooltip-meta">
        <span class="linswift-tooltip-chip">${activeTooltipSource === 'selection' ? '选词翻译' : '点击可定位与操作'}</span>
      </div>
      ${examplesHtml}
      <div class="linswift-tooltip-actions">
        <button class="linswift-button" type="button" data-tooltip-action="speak">发音</button>
        <button class="linswift-button ${savedEntry ? 'linswift-tab--active' : ''}" type="button" data-tooltip-action="save">
          ${savedEntry ? '取消收藏' : '收藏'}
        </button>
        <button class="linswift-button ${known ? 'linswift-button--primary' : ''}" type="button" data-tooltip-action="known">
          ${known ? '已会' : '标记已会'}
        </button>
      </div>
    `

    refs.tooltip
      .querySelector('[data-tooltip-action="speak"]')
      ?.addEventListener('click', () => pronounceWord(normalizedWord))
    refs.tooltip
      .querySelector('[data-tooltip-action="save"]')
      ?.addEventListener('click', () => {
        void handleTooltipSave(normalizedWord)
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

    const rect = anchorElement.getBoundingClientRect()
    const tooltipRect = refs.tooltip.getBoundingClientRect()
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

    refs.tooltip.style.left = `${Math.round(left)}px`
    refs.tooltip.style.top = `${Math.round(top)}px`
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
    if (!normalizedWord) {
      throw new Error('缺少单词')
    }

    if (wordDetailCache.has(normalizedWord)) {
      return wordDetailCache.get(normalizedWord)
    }

    const fallback = getWordDetailFallback(normalizedWord)
    wordDetailCache.set(normalizedWord, fallback)

    try {
      const resultEntry = getResultEntry(normalizedWord)
      const response = await sendRuntimeMessage({
        type: 'panel-word-detail',
        word: normalizedWord,
        context: String(resultEntry?.snippet || '').trim(),
      })

      const detail = {
        ...fallback,
        ...(response.detail || {}),
        word: normalizedWord,
      }
      wordDetailCache.set(normalizedWord, detail)
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
      await initializePanelState()
    } catch {}

    hideInlineTooltip(true)
    clearHighlights()

    const highlight = applySelectionHighlight(selectionTarget.range, selectionTarget.word)
    selectionTarget.selection.removeAllRanges()
    if (!highlight) return

    lastSelectionTooltipOpenedAt = Date.now()
    await showInlineTooltipForWord(selectionTarget.word, highlight, {
      pinned: true,
      source: 'selection',
    })
  }

  function pronounceWord(word) {
    const normalizedWord = String(word || '').trim()
    if (!normalizedWord || !('speechSynthesis' in window)) return

    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(normalizedWord)
      utterance.lang = 'en-US'
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
    const rawScale = Number(panelState.extensionState.settings.uiScale || 0.56)
    if (!Number.isFinite(rawScale)) return 0.56
    return Math.min(0.88, Math.max(0.5, rawScale))
  }

  function applyUiScale() {
    const scale = getUiScale()
    if (refs?.root) {
      refs.root.style.setProperty('--linswift-ui-scale', String(scale))
    }
    if (refs?.sizeSelect) {
      refs.sizeSelect.value = String(scale)
    }
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
    if (!refs) return

    refs.saved.classList.toggle('linswift-hidden', !panelState.showingSaved)
    refs.results.classList.toggle('linswift-hidden', panelState.showingSaved)
    refs.savedToggle.classList.toggle('linswift-tab--active', panelState.showingSaved)
    refs.resultsToggle.classList.toggle('linswift-tab--active', !panelState.showingSaved)
  }

  function syncPanelPageVisibility() {
    if (!refs) return

    const showingSettings = panelState.activePage === 'settings'
    refs.translatePage.classList.toggle('linswift-hidden', showingSettings)
    refs.settingsPage.classList.toggle('linswift-hidden', !showingSettings)
    refs.translatePageToggle.classList.toggle('linswift-tab--active', !showingSettings)
    refs.settingsPageToggle.classList.toggle('linswift-tab--active', showingSettings)
  }

  function setActivePanelPage(nextPage) {
    panelState.activePage = nextPage === 'settings' ? 'settings' : 'translate'
    syncPanelPageVisibility()
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
    const subtitleStatus = panelState.youtube.captionsEnabled
      ? panelState.youtube.subtitleReady
        ? `字幕已就绪 · 已采集 ${cueCount} 条 · ${prefetchStatus} · ${translationStatus}`
        : '字幕已开启 · 等待字幕出现'
      : `${prefetchStatus} · ${translationStatus}`

    refs.youtubeCard.innerHTML = `
      <div class="linswift-youtube-card-top">
        <div>
          <p class="linswift-youtube-title">${escapeHtml(panelState.youtube.title || '当前 YouTube 视频')}</p>
          <p class="linswift-youtube-meta">
            ${escapeHtml(panelState.youtube.channel || 'YouTube')} · ${escapeHtml(subtitleStatus)}
          </p>
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

    refs.headline.textContent = resultCount
      ? isYouTubeContext
        ? `本视频识别出 ${resultCount} 个陌生词`
        : `检测到 ${resultCount} 个陌生词汇`
      : isYouTubeContext
        ? '准备分析当前视频字幕'
        : '检测当前网页里的生词'

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
          : `准备扫描当前网页 · ${hostname}`
    } catch {
      refs.pageMeta.textContent = pageTitle
    }

    refs.detectedCount.textContent = String(resultCount)
    refs.comprehension.textContent = Number.isFinite(comprehension) ? `${comprehension}%` : '--'
    refs.knownCount.textContent = String(panelState.extensionState.knownWords.length)
    refs.headerSubtitle.textContent = isYouTubeContext ? 'YouTube 字幕模式' : '网页生词雷达'
    refs.kicker.textContent = isYouTubeContext ? '视频字幕' : '词汇弹窗'
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
    if (refs.sizeSelect) {
      refs.sizeSelect.value = String(getUiScale())
    }
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

  function renderSavedWords() {
    if (!refs) return

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
          <span class="linswift-tag">收藏</span>
        </div>
        <p class="linswift-card-meaning">${escapeHtml(entry.meaning || entry.note || '暂无释义')}</p>
        <div class="linswift-card-actions">
          <button class="linswift-button" data-action="locate">定位</button>
          <button class="linswift-button" data-action="remove">移除</button>
        </div>
      `

      card.querySelector('[data-action="locate"]').addEventListener('click', () => handleHighlight(entry.word))
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

    refs.results.innerHTML = ''

    if (!results || results.length === 0) {
      refs.results.innerHTML = `
        <div class="linswift-empty">
          ${
            panelState.youtube.enabled
              ? '当前视频字幕里还没有识别到明显超出你阶段的词。<br />先播放几句并打开字幕，再刷新一次。'
              : '当前页没有识别到明显超出你阶段的词。<br />可以切换词汇阶段后重新扫描。'
          }
        </div>
      `
      return
    }

    results.forEach((item) => {
      const saved = Boolean(panelState.extensionState.savedWords[item.word])
      const card = document.createElement('article')
      card.className = 'linswift-card'
      card.innerHTML = `
        <div class="linswift-card-top">
          <div>
            <p class="linswift-card-word">${escapeHtml(item.word)}</p>
            <p class="linswift-card-meta">
              出现 ${item.count} 次 · ${escapeHtml(item.difficulty)}${item.rank ? ` · 词频 ${item.rank}` : ''}
            </p>
          </div>
          <span class="linswift-tag">${Math.round(item.score * 100)}%</span>
        </div>
        <p class="linswift-card-snippet">${escapeHtml(item.snippet)}</p>
        <p class="linswift-card-meaning">${escapeHtml(item.meaning || '释义补全中...')}</p>
        ${item.note ? `<p class="linswift-card-note">${escapeHtml(item.note)}</p>` : ''}
        <div class="linswift-card-actions">
          <button class="linswift-button" data-action="locate">定位</button>
          <button class="linswift-button" data-action="known">掌握</button>
          <button class="linswift-button ${saved ? 'linswift-tab--active' : ''}" data-action="save">
            ${saved ? '取消收藏' : '收藏'}
          </button>
        </div>
      `

      card.querySelector('[data-action="locate"]').addEventListener('click', () => handleHighlight(item.word))
      card.querySelector('[data-action="known"]').addEventListener('click', () => handleKnown(item.word))
      card.querySelector('[data-action="save"]').addEventListener('click', () => handleSave({
        word: item.word,
        meaning: item.meaning || '',
        note: item.note || '',
        phonetic: item.phonetic || '',
        pageTitle: panelState.lastAnalysis?.meta?.pageTitle || document.title,
        pageUrl: panelState.lastAnalysis?.meta?.pageUrl || window.location.href,
        savedAt: new Date().toISOString(),
      }))

      refs.results.appendChild(card)
    })
  }

  function renderAuthState() {
    if (!refs?.authCard) return

    if (panelState.auth.isAuthenticated) {
      refs.authCard.innerHTML = `
        <div class="linswift-auth-top">
          <div>
            <p class="linswift-auth-label">账号</p>
            <p class="linswift-auth-email">${escapeHtml(panelState.auth.email || '已登录')}</p>
          </div>
          <span class="linswift-tag">已连接</span>
        </div>
        <div class="linswift-auth-actions">
          <button class="linswift-button linswift-button--primary" type="button" data-auth-action="sync">同步词库</button>
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
      <form class="linswift-auth-form" data-auth-form>
        <div>
          <p class="linswift-auth-label">登录账号</p>
        </div>
        <input class="linswift-input" type="email" placeholder="邮箱" autocomplete="email" data-auth-email />
        <input class="linswift-input" type="password" placeholder="密码" autocomplete="current-password" data-auth-password />
        <button class="linswift-button linswift-button--primary" type="submit" data-auth-action="signin">登录并同步</button>
      </form>
    `

    refs.authCard
      .querySelector('[data-auth-form]')
      .addEventListener('submit', (event) => {
        event.preventDefault()
        void handleSignIn()
      })
  }

  async function sendRuntimeMessage(payload) {
    const response = await chrome.runtime.sendMessage(payload)
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
    const detail = wordDetailCache.get(normalizedWord) || getWordDetailFallback(normalizedWord)
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
      const detail = wordDetailCache.get(activeInlineWord) || getWordDetailFallback(activeInlineWord)
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
    const emailInput = refs.authCard.querySelector('[data-auth-email]')
    const passwordInput = refs.authCard.querySelector('[data-auth-password]')
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
      setStatus(
        `登录成功，已同步 ${response.syncSummary?.cloudWords || 0} 条云端词汇。`
      )
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
    const previousInlineTranslateEnabled = Boolean(
      panelState.extensionState.settings.inlineTranslateEnabled
    )
    const previousLanguage = panelState.extensionState.settings.translationLanguage || 'zh-CN'
    const previousYouTubeMode = panelState.extensionState.settings.youtubeSubtitleMode || 'vocab'
    const nextSettings = {
      ...panelState.extensionState.settings,
      level: refs.levelSelect.value,
      inlineTranslateEnabled: panelState.extensionState.settings.inlineTranslateEnabled,
      autoTranslateOnLoad: Boolean(panelState.extensionState.settings.autoTranslateOnLoad),
      translationLanguage: refs.translationLanguageSelect.value || previousLanguage,
      disabledAutoTranslateHosts: getDisabledAutoTranslateHosts(),
      youtubeSubtitleMode:
        refs.youtubeCard?.querySelector?.('[data-youtube-mode-select]')?.value || previousYouTubeMode,
      uiScale: Number(refs.sizeSelect.value || panelState.extensionState.settings.uiScale || 0.56),
    }

    const response = await sendRuntimeMessage({
      type: 'panel-save-settings',
      settings: nextSettings,
    })

    panelState.extensionState.settings = response.settings
    applyUiScale()

    if (
      panelState.lastAnalysis?.results?.length &&
      previousLanguage !== panelState.extensionState.settings.translationLanguage
    ) {
      wordDetailCache.clear()
      hideInlineTooltip(true)
      setStatus(`正在切换页内直译语言到 ${getTranslationLanguageLabel()}...`)
      const enrichResponse = await sendRuntimeMessage({
        type: 'panel-enrich-results',
        results: panelState.lastAnalysis.results,
      })
      panelState.lastAnalysis.results = enrichResponse.results
      primeWordDetailCache(panelState.lastAnalysis.results)
      renderResults(panelState.lastAnalysis.results)
    }

    if (
      panelState.youtube.enabled &&
      previousLanguage !== panelState.extensionState.settings.translationLanguage
    ) {
      panelState.youtube.translations = {}
      panelState.youtube.translationUnavailable = false
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
        previousYouTubeMode !== panelState.extensionState.settings.youtubeSubtitleMode
      )
    ) {
      renderYouTubeOverlay()
      if (shouldPretranslateYouTubeTranscript()) {
        void pretranslateYouTubeTranscript(panelState.youtube.transcriptCues)
      }
    }

    setStatus('阅读设置已保存。')
  }

  async function toggleInlineTranslate() {
    panelState.extensionState.settings.inlineTranslateEnabled =
      !panelState.extensionState.settings.inlineTranslateEnabled
    await saveSettings()
  }

  async function toggleAutoTranslateOnLoad() {
    panelState.extensionState.settings.autoTranslateOnLoad =
      !Boolean(panelState.extensionState.settings.autoTranslateOnLoad)
    await saveSettings()

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
      refs.levelSelect.value = panelState.extensionState.settings.level || 'intermediate'
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
    panelState.minimized = true
    panelState.hidden = false
    refs.panel.classList.add('linswift-hidden')
    refs.bubble.classList.remove('linswift-hidden')
    syncBubble()
  }

  function restorePanel() {
    if (!refs) return
    panelState.minimized = false
    panelState.hidden = false
    refs.panel.classList.remove('linswift-hidden')
    refs.bubble.classList.add('linswift-hidden')
  }

  function hidePanel() {
    if (!refs) return
    hideInlineTooltip(true)
    panelState.hidden = false
    panelState.minimized = true
    refs.panel.classList.add('linswift-hidden')
    refs.bubble.classList.remove('linswift-hidden')
    syncBubble()
    setStatus('Linswift 已收起为常驻圆球。')
  }

  function bindRefs(root) {
    if (!root) return null

    refs = {
      root,
      panel: root.querySelector('.linswift-panel'),
      bubble: root.querySelector('.linswift-bubble'),
      bubbleBadge: root.querySelector('[data-bubble-count]'),
      youtubeOverlay: root.querySelector('[data-youtube-overlay]'),
      headerSubtitle: root.querySelector('[data-header-subtitle]'),
      translatePageToggle: root.querySelector('[data-panel-view="translate"]'),
      settingsPageToggle: root.querySelector('[data-panel-view="settings"]'),
      translatePage: root.querySelector('[data-panel-page="translate"]'),
      settingsPage: root.querySelector('[data-panel-page="settings"]'),
      kicker: root.querySelector('[data-panel-kicker]'),
      headline: root.querySelector('[data-headline]'),
      pageMeta: root.querySelector('[data-page-meta]'),
      detectedCount: root.querySelector('[data-detected-count]'),
      comprehension: root.querySelector('[data-comprehension]'),
      knownCount: root.querySelector('[data-known-count]'),
      authCard: root.querySelector('[data-auth-card]'),
      youtubeCard: root.querySelector('[data-youtube-card]'),
      levelSelect: root.querySelector('[data-level-select]'),
      scanButton: root.querySelector('[data-scan-button]'),
      inlineToggle: root.querySelector('[data-inline-toggle]'),
      translationLanguageSelect: root.querySelector('[data-translation-language]'),
      sizeSelect: root.querySelector('[data-size-select]'),
      autoTranslateToggle: root.querySelector('[data-auto-translate-toggle]'),
      siteAutoTranslateToggle: root.querySelector('[data-site-auto-translate-toggle]'),
      resultsToggle: root.querySelector('[data-view-results]'),
      savedToggle: root.querySelector('[data-view-saved]'),
      results: root.querySelector('[data-results-list]'),
      saved: root.querySelector('[data-saved-list]'),
      status: root.querySelector('[data-status]'),
      studyButton: root.querySelector('[data-study-button]'),
      header: root.querySelector('.linswift-header'),
      tooltip: root.querySelector('[data-inline-tooltip]'),
      studyOverlay: root.querySelector('[data-study-overlay]'),
      openSettingsButton: root.querySelector('[data-open-settings]'),
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
      !refs.studyOverlay ||
      !refs.translationLanguageSelect
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
            <button class="linswift-close" type="button" data-action="close" title="收起为常驻圆球">×</button>
          </div>
        </header>
        <div class="linswift-body">
          <section class="linswift-page-tabs">
            <button class="linswift-tab linswift-tab--active" type="button" data-panel-view="translate">翻译</button>
            <button class="linswift-tab" type="button" data-panel-view="settings">设置</button>
          </section>
          <section class="linswift-page" data-panel-page="translate">
            <section>
              <p class="linswift-kicker" data-panel-kicker>词汇弹窗</p>
              <h3 class="linswift-headline" data-headline>检测当前网页里的生词</h3>
              <p class="linswift-page-meta" data-page-meta>准备扫描当前网页</p>
            </section>
            <section class="linswift-metrics">
              <article class="linswift-metric linswift-metric--warm">
                <strong data-detected-count>0</strong>
                <span>陌生词汇</span>
              </article>
              <article class="linswift-metric linswift-metric--cool">
                <strong data-comprehension>100%</strong>
                <span>可理解度</span>
              </article>
            </section>
            <section class="linswift-cta-row">
              <button class="linswift-cta linswift-cta--ghost" type="button" data-study-button>先学习</button>
              <button class="linswift-cta linswift-cta--primary" type="button" data-action="minimize">继续阅读</button>
            </section>
            <section class="linswift-youtube-card linswift-hidden" data-youtube-card></section>
            <section class="linswift-translate-actions">
              <button class="linswift-button linswift-button--primary" type="button" data-scan-button>重新扫描</button>
              <button class="linswift-button" type="button" data-open-settings>翻译设置</button>
            </section>
            <section class="linswift-tabs">
              <button class="linswift-tab linswift-tab--active" type="button" data-view-results>识别结果</button>
              <button class="linswift-tab" type="button" data-view-saved>收藏夹 0</button>
            </section>
            <p class="linswift-status" data-status>点击“先学习”开始扫描当前网页。</p>
            <div class="linswift-list-wrap">
              <section data-results-list></section>
              <section class="linswift-hidden" data-saved-list></section>
            </div>
            <div class="linswift-footer-meta">
              <p class="linswift-kicker">已掌握：<span data-known-count>0</span></p>
            </div>
          </section>
          <section class="linswift-page linswift-hidden" data-panel-page="settings">
            <div class="linswift-settings-stack">
              <section class="linswift-auth-card" data-auth-card></section>
              <section class="linswift-toolbar">
                <p class="linswift-section-label">语言与识别</p>
                <div class="linswift-toolbar-row linswift-toolbar-row--secondary">
                  <select class="linswift-select" data-level-select>
                    <option value="beginner">初级</option>
                    <option value="intermediate">中级</option>
                    <option value="advanced">高级</option>
                  </select>
                  <select class="linswift-select" data-translation-language aria-label="页内直译语言">
                    <option value="zh-CN">页内直译 · 简中</option>
                    <option value="zh-TW">页内直译 · 繁中</option>
                    <option value="en">页内直译 · English</option>
                    <option value="ja">页内直译 · 日本語</option>
                    <option value="ko">页内直译 · 한국어</option>
                  </select>
                </div>
                <div class="linswift-toolbar-row linswift-toolbar-row--secondary">
                  <button class="linswift-button" type="button" data-inline-toggle>页内直译：关</button>
                  <button class="linswift-button" type="button" data-auto-translate-toggle>自动翻译网页：开</button>
                </div>
                <div class="linswift-toolbar-row linswift-toolbar-row--secondary">
                  <button class="linswift-button" type="button" data-site-auto-translate-toggle>当前网站自动翻译</button>
                  <button class="linswift-button" type="button" data-panel-view-back="translate">查看翻译页</button>
                </div>
                <p class="linswift-settings-note">开启自动翻译后，刷新网页会自动重新识别并标注。关闭当前网站后会记住该站点，下次不再自动翻译。</p>
              </section>
              <section class="linswift-toolbar">
                <p class="linswift-section-label">界面与显示</p>
                <div class="linswift-toolbar-row linswift-toolbar-row--secondary">
                  <select class="linswift-select" data-size-select aria-label="界面尺寸">
                    <option value="0.56">界面 56%</option>
                    <option value="0.72">界面 72%</option>
                    <option value="0.88">界面 88%</option>
                  </select>
                  <div class="linswift-tag">Glass UI</div>
                </div>
                <p class="linswift-settings-note">这里统一控制账户、目标语言、页内直译和界面大小。翻译结果与 YouTube 字幕会同步使用这些设置。</p>
              </section>
            </div>
          </section>
        </div>
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
    root.querySelector('[data-panel-view-back="translate"]')?.addEventListener('click', () => {
      setActivePanelPage('translate')
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
    refs.levelSelect.addEventListener('change', saveSettings)
    refs.translationLanguageSelect.addEventListener('change', saveSettings)
    refs.sizeSelect.addEventListener('change', saveSettings)
    refs.resultsToggle.addEventListener('click', () => {
      panelState.showingSaved = false
      syncListVisibility()
      setStatus('查看本页识别结果。')
    })
    refs.savedToggle.addEventListener('click', () => {
      panelState.showingSaved = true
      syncListVisibility()
      clearHighlights()
      clearInlineTranslations()
      setStatus('查看收藏夹与云端同步状态。')
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

    window.addEventListener('mousemove', (event) => {
      if (!dragState || panelState.hidden) return
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
      dragState = null
      document.documentElement.classList.remove('linswift-dragging')
    })
    document.addEventListener('click', (event) => {
      if (!refs?.tooltip || refs.tooltip.classList.contains('linswift-hidden')) return
      if (Date.now() - lastSelectionTooltipOpenedAt < 180) return
      if (refs.tooltip.contains(event.target)) return
      if (event.target.closest('.linswift-inline-annotation')) return
      if (event.target.closest(`.${SELECTION_HIGHLIGHT_CLASS}`)) return
      hideInlineTooltip(true)
    })
    window.addEventListener('scroll', () => {
      if (!activeInlineWord || !refs?.tooltip || refs.tooltip.classList.contains('linswift-hidden')) return
      const activeAnnotation = activeTooltipSource === 'selection'
        ? selectionHighlightRecord?.mark
        : inlineAnnotationRecords.find(
            (item) =>
              item?.wrapper?.isConnected &&
              String(item.word || item.wrapper.dataset.word || '').trim().toLowerCase() === activeInlineWord
          )?.wrapper
      if (!activeAnnotation) {
        hideInlineTooltip(true)
        return
      }
      positionInlineTooltip(activeAnnotation)
    }, true)
    window.addEventListener('scroll', positionYouTubeOverlay, true)
    window.addEventListener('resize', positionYouTubeOverlay)
    document.addEventListener('fullscreenchange', () => {
      syncFloatingHostElement()
      syncYouTubeOverlayHostElement()
      positionYouTubeOverlay()
    })

    return root
  }

  async function initializePanelState() {
    if (panelState.initialized) return

    syncYouTubePageState()
    const response = await sendRuntimeMessage({ type: 'panel-load-state' })
    panelState.extensionState = response.state
    panelState.auth = response.auth
    refs.levelSelect.value = panelState.extensionState.settings.level || 'intermediate'
    applyUiScale()

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

    await initializePanelState()
    panelState.hidden = false
    panelState.minimized = true
    refs.panel.classList.add('linswift-hidden')
    refs.bubble.classList.remove('linswift-hidden')
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
    syncYouTubePageState()
    setStatus(
      panelState.youtube.enabled
        ? 'YouTube 字幕模式已就绪，正在加载你的 Linswift 状态...'
        : '浮层已就绪，正在加载你的 Linswift 状态...'
    )

    try {
      await initializePanelState()
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
