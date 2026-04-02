import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, afterEach } from 'vitest'

const stableUser = { id: 'test-user', email: 'test@test.com', user_metadata: {} }
const stableAuthMock = {
  user: stableUser,
  loading: false,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithApple: vi.fn(),
  session: null,
}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => stableAuthMock,
}))

vi.mock('../hooks/useLogicalBack', () => ({
  useLogicalBack: () => vi.fn(),
}))

vi.mock('../hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}))

const stableVocabMock = {
  vocabulary: [] as never[],
  words: [] as never[],
  loading: false,
  addWord: vi.fn(),
  addWords: vi.fn(),
  removeWord: vi.fn(),
  toggleStar: vi.fn(),
  updateWord: vi.fn(),
  fetchVocabulary: vi.fn(),
  addReviewsBulk: vi.fn().mockResolvedValue(undefined),
  updateNextReviewBulk: vi.fn().mockResolvedValue(undefined),
}

vi.mock('../hooks/useVocabulary', () => ({
  useVocabulary: () => stableVocabMock,
}))

const stableStudyMock = {
  records: [] as never[],
  loading: false,
  heatmapData: [] as never[],
  streak: 0,
  todayMinutes: 0,
  appendStudy: vi.fn().mockResolvedValue(undefined),
  getHeatmapData: vi.fn().mockResolvedValue([]),
  getStreakDays: vi.fn().mockResolvedValue(0),
}

vi.mock('../hooks/useStudyRecords', () => ({
  useStudyRecords: () => stableStudyMock,
}))

vi.mock('../lib/ebbinghaus', () => ({
  calculateNextReview: vi.fn(() => ({ nextReviewAt: '', newMastery: 0 })),
  getReviewCycleDaysFromLocalStorage: vi.fn(() => [1, 2, 4, 7]),
}))

vi.mock('../lib/learnSettings', () => ({
  getDailyNewWordGoal: vi.fn(() => 10),
}))

vi.mock('../lib/tts', () => ({
  speakAuto: vi.fn(),
  findPreferredVoiceByLang: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {}
      const p = Promise.resolve({ data: [], error: null })
      chain.select = () => chain
      chain.eq = () => chain
      chain.neq = () => chain
      chain.in = () => chain
      chain.not = () => chain
      chain.lt = () => chain
      chain.order = () => chain
      chain.limit = () => p
      chain.maybeSingle = () => Promise.resolve({ data: null, error: null })
      chain.single = () => Promise.resolve({ data: null, error: null })
      chain.then = (resolve: (v: unknown) => void) => p.then(resolve)
      return chain
    },
  },
}))

vi.mock('../services/gemini', () => ({
  analyzeUnfamiliarWords: vi.fn().mockResolvedValue([]),
  getFlashcardMnemonic: vi.fn().mockResolvedValue('test mnemonic'),
}))

vi.mock('../lib/books', () => ({
  fetchResolvedUserBook: vi.fn().mockResolvedValue(null),
  getBookAnalysisExcerpt: vi.fn(() => ''),
}))

vi.mock('../lib/vocabSetLearnSettings', () => ({
  getVocabSetLearnSettings: vi.fn(() => ({ dailyGoal: 10 })),
}))

vi.mock('../lib/vocabStudyQueue', () => ({
  buildTodayStudyQueue: vi.fn(() => ({ queue: [] })),
}))

vi.mock('../components/flashcard/MobileFlashcardThreeDeck', () => ({
  default: () => null,
}))

import FlashcardPage from './FlashcardPage'

describe('FlashcardPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function renderPage() {
    return render(
      <MemoryRouter>
        <FlashcardPage />
      </MemoryRouter>,
    )
  }

  it('renders without crashing', () => {
    renderPage()
  })

  it('renders the page title', () => {
    renderPage()
    expect(screen.getByText('词汇学习')).toBeTruthy()
  })

  it('shows empty state when no vocabulary', () => {
    renderPage()
    expect(screen.getByText('今天没有待学习词汇了')).toBeTruthy()
  })
})
