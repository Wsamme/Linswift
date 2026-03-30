import type { MouseEvent } from 'react'
import type { NavigateFunction } from 'react-router-dom'

export function shouldForceDocumentNavigation(path: string) {
  void path
  return false
}

export function navigateSafely(navigate: NavigateFunction, path: string) {
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
