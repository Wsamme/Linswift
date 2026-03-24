import type { MouseEvent } from 'react'
import type { NavigateFunction } from 'react-router-dom'

const HARD_RELOAD_PATH_PREFIXES = [
  '/app/',
  '/bookshelf',
  '/reading-prep',
  '/flashcard',
  '/reading',
  '/pdf-reader',
  '/ebbinghaus',
  '/vocab-game',
  '/ai-memo',
  '/listening',
  '/listen-fill',
  '/listen-go',
  '/listen-lib',
  '/speaking',
  '/retell',
  '/ai-dialog',
  '/scene-select',
  '/grammar',
  '/reading-test',
  '/vocab-test',
  '/ai-classify',
  '/profile-edit',
  '/learning-settings',
  '/pronunciation-settings',
  '/notification-settings',
  '/theme-settings',
  '/about',
  '/word-match',
  '/spelling-game',
  '/listen-identify-game',
  '/lightning-game',
]

const PUBLIC_DOCUMENT_PATHS = [
  '/',
  '/login',
  '/register',
  '/browser-extension',
]

const PUBLIC_DOCUMENT_PATH_PREFIXES = [
  '/legal',
]

function normalizePath(path: string) {
  return String(path || '').split('?')[0].split('#')[0]
}

function isSamePath(path: string, target: string) {
  if (target.endsWith('/')) {
    return path.startsWith(target)
  }
  return path === target || path.startsWith(`${target}/`)
}

function isProtectedAppPath(path: string) {
  const normalized = normalizePath(path)
  return HARD_RELOAD_PATH_PREFIXES.some((prefix) => isSamePath(normalized, prefix))
}

function isPublicDocumentPath(path: string) {
  const normalized = normalizePath(path)
  if (PUBLIC_DOCUMENT_PATHS.some((prefix) => isSamePath(normalized, prefix))) {
    return true
  }
  return PUBLIC_DOCUMENT_PATH_PREFIXES.some((prefix) => isSamePath(normalized, prefix))
}

function isDesktopShell() {
  if (typeof window === 'undefined') return false
  return window.location.protocol === 'file:' || window.navigator.userAgent.includes('Electron')
}

export function shouldForceDocumentNavigation(path: string) {
  if (isDesktopShell()) return false
  const normalized = normalizePath(path)
  return isProtectedAppPath(normalized) || isPublicDocumentPath(normalized)
}

export function navigateSafely(navigate: NavigateFunction, path: string) {
  if (typeof window !== 'undefined' && shouldForceDocumentNavigation(path)) {
    window.location.assign(path)
    return
  }

  navigate(path)
}

export function handleSafeRouteClick(
  event: MouseEvent<HTMLElement>,
  path: string,
) {
  if (!shouldForceDocumentNavigation(path)) return false
  event.preventDefault()
  window.location.assign(path)
  return true
}
