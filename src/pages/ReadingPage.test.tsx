import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, vi } from 'vitest'
import ReadingPage from './ReadingPage'

vi.mock('../hooks/useLogicalBack', () => ({
  useLogicalBack: () => vi.fn(),
}))

vi.mock('../hooks/useVocabulary', () => ({
  useVocabulary: () => ({
    words: [],
    loading: false,
    addWord: vi.fn(),
    addWords: vi.fn(),
    removeWord: vi.fn(),
    toggleStar: vi.fn(),
  }),
}))

vi.mock('../lib/tts', () => ({
  speakAuto: vi.fn(),
  speakEnglish: vi.fn(),
}))

vi.mock('../services/gemini', () => ({
  analyzeUnfamiliarWords: vi.fn().mockResolvedValue([]),
}))

vi.mock('../lib/books', () => ({
  fetchResolvedUserBook: vi.fn().mockResolvedValue(null),
  getBookAnalysisExcerpt: vi.fn(),
  loadCachedBookWords: vi.fn().mockReturnValue(null),
  saveCachedBookWords: vi.fn(),
}))

vi.mock('../lib/classicReader', () => ({
  loadProcessedClassicBook: vi.fn().mockResolvedValue(null),
}))

vi.mock('../lib/text', () => ({
  escapeRegExp: (s: string) => s,
  normalizeLookupKey: (s: string) => s.toLowerCase(),
}))

vi.mock('../components/books/ClassicChapterReader', () => ({
  default: () => <div data-testid="classic-chapter-reader" />,
}))

describe('ReadingPage', () => {
  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/reading']}>
        <ReadingPage />
      </MemoryRouter>,
    )
  }

  it('renders without crashing', () => {
    renderPage()
  })
})
