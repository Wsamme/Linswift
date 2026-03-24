import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { navigateSafely } from '../lib/navigation'

function withBookId(basePath: string, searchParams: URLSearchParams) {
  const bookId = searchParams.get('bookId')
  if (!bookId) return basePath
  return `${basePath}?bookId=${encodeURIComponent(bookId)}`
}

export function getLogicalBackTarget(pathname: string, search: string) {
  const searchParams = new URLSearchParams(search)

  switch (pathname) {
    case '/grammar/long-sentence':
      return '/grammar'
    case '/grammar/long-sentence/reading':
    case '/grammar/long-sentence/writing':
    case '/grammar/long-sentence/analyze':
    case '/grammar/long-sentence/collection':
      return '/grammar/long-sentence'
    case '/grammar/lesson':
      return '/grammar'
    case '/grammar':
      return '/app/learn'
    case '/ebbinghaus':
      return '/app/learn'
    case '/vocab-game':
      return '/ebbinghaus'
    case '/word-match':
    case '/spelling-game':
    case '/listen-identify-game':
    case '/lightning-game':
      return '/vocab-game'
    case '/ai-memo':
      return '/ebbinghaus'
    case '/listening':
      return '/app/learn'
    case '/listen-fill':
    case '/listen-go':
    case '/listen-lib':
      return '/listening'
    case '/speaking':
      return '/app/learn'
    case '/scene-select':
      return '/speaking'
    case '/ai-dialog':
      return '/scene-select'
    case '/retell':
      return '/speaking'
    case '/bookshelf':
      return '/app/learn'
    case '/reading-prep':
      return '/bookshelf'
    case '/reading':
      return withBookId('/reading-prep', searchParams)
    case '/flashcard':
      return searchParams.get('bookId') ? withBookId('/reading-prep', searchParams) : '/ebbinghaus'
    case '/pdf-reader':
      return searchParams.get('bookId') ? withBookId('/reading-prep', searchParams) : '/bookshelf'
    case '/reading-test':
      return '/app/learn'
    case '/vocab-test':
    case '/ai-classify':
      return '/app/vocab'
    case '/learning-settings':
      return '/app/learn'
    case '/pronunciation-settings':
      return '/learning-settings'
    case '/profile-edit':
    case '/notification-settings':
    case '/theme-settings':
    case '/about':
      return '/app/profile'
    default:
      return null
  }
}

export function useLogicalBack(defaultTarget = '/app/learn') {
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback(() => {
    const target = getLogicalBackTarget(location.pathname, location.search) || defaultTarget
    navigateSafely(navigate, target)
  }, [defaultTarget, location.pathname, location.search, navigate])
}
