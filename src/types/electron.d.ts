export {}

declare global {
  interface Window {
    electronShell?: {
      isDesktop: boolean
      platform?: string
      captureScreenshot?: () => Promise<{ dataUrl: string; capturedAt: string } | null>
    }
  }
}
