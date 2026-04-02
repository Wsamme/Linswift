import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import TranslatePage from './TranslatePage'

// Mock hooks
vi.mock('../hooks/useVocabulary', () => ({
  useVocabulary: () => ({
    vocabulary: [],
    words: [],
    loading: false,
    addWord: vi.fn(),
    addWords: vi.fn(),
    removeWord: vi.fn(),
    toggleStar: vi.fn(),
    updateWord: vi.fn(),
    fetchVocabulary: vi.fn(),
  }),
}))

vi.mock('../hooks/useTranslations', () => ({
  useTranslations: () => ({
    history: [],
    loading: false,
    fetchHistory: vi.fn(),
    saveTranslation: vi.fn(),
    toggleStar: vi.fn(),
  }),
}))

vi.mock('../hooks/useStudyRecords', () => ({
  useStudyRecords: () => ({
    records: [],
    loading: false,
    heatmapData: [],
    streak: 0,
    todayMinutes: 0,
    appendStudy: vi.fn().mockResolvedValue(undefined),
    getHeatmapData: vi.fn().mockResolvedValue([]),
    getStreakDays: vi.fn().mockResolvedValue(0),
  }),
}))

vi.mock('../hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}))

vi.mock('../services/translation', () => ({
  translateTextFast: vi.fn(),
  loadTranslationVocabulary: vi.fn(),
}))

vi.mock('../services/gemini', () => ({
  getWordDetail: vi.fn(),
}))

vi.mock('../lib/tts', () => ({
  findPreferredVoiceByLang: vi.fn(),
  speakEnglish: vi.fn(),
  speakChinese: vi.fn(),
  speakJapanese: vi.fn(),
  speakAuto: vi.fn(),
}))

vi.mock('../components/translate/DesktopScreenshotTranslator', () => ({
  default: () => <div data-testid="desktop-screenshot-translator" />,
}))

describe('TranslatePage', () => {
  function renderPage() {
    return render(
      <MemoryRouter>
        <TranslatePage />
      </MemoryRouter>,
    )
  }

  it('renders without crashing', () => {
    renderPage()
  })

  it('renders the translation input area', () => {
    renderPage()
    // The page has a textarea for input
    const textareas = document.querySelectorAll('textarea')
    expect(textareas.length).toBeGreaterThan(0)
  })
})
