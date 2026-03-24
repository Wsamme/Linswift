export {}

declare global {
  interface Window {
    electronShell?: {
      isDesktop: boolean
      platform?: string
      captureScreenshot?: () => Promise<{
        dataUrl: string
        capturedAt: string
        anchorPoint?: { x: number; y: number }
        selectionRect?: { x: number; y: number; width: number; height: number }
      } | null>
      getDesktopScreenshotSettings?: () => Promise<{
        shortcut: string
        autoCopyText: boolean
        previewMode: 'side' | 'cover'
        smartWordsEnabled: boolean
        shortcutRegistered: boolean
      }>
      updateDesktopScreenshotSettings?: (partial: {
        shortcut?: string
        autoCopyText?: boolean
        previewMode?: 'side' | 'cover'
        smartWordsEnabled?: boolean
      }) => Promise<{
        shortcut: string
        autoCopyText: boolean
        previewMode: 'side' | 'cover'
        smartWordsEnabled: boolean
        shortcutRegistered: boolean
      }>
      writeClipboardText?: (text: string) => Promise<{ ok: boolean }>
      showCaptureIndicator?: (payload: {
        selectionRect: { x: number; y: number; width: number; height: number }
        status: string
      }) => Promise<{ ok: boolean }>
      hideCaptureIndicator?: () => Promise<{ ok: boolean }>
      showDesktopTranslationOverlay?: (payload: {
        targetLang: string
        ocrText: string
        translatedText: string
        words?: Array<{
          word: string
          meaning: string
        }>
        statusLabel?: string
        languageLabel?: string
        smartWordsEnabled?: boolean
        anchorPoint?: { x: number; y: number }
        selectionRect?: { x: number; y: number; width: number; height: number }
      }) => Promise<{ ok: boolean }>
      hideDesktopTranslationOverlay?: () => Promise<{ ok: boolean }>
      requestOverlayLanguageChange?: (targetLang: string) => Promise<{ ok: boolean }>
      onCollectOverlayWords?: (
        callback: (payload: Array<{ word: string; meaning: string }>) => void
      ) => (() => void)
      onScreenshotSettingsUpdated?: (
        callback: (payload: {
          shortcut: string
          autoCopyText: boolean
          previewMode: 'side' | 'cover'
          smartWordsEnabled: boolean
          shortcutRegistered: boolean
        }) => void
      ) => (() => void)
      onScreenshotShortcut?: (callback: () => void) => (() => void)
      onOverlayTargetLanguageChange?: (callback: (targetLang: string) => void) => (() => void)
    }
  }
}
