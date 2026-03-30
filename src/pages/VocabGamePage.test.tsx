import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import VocabGamePage from './VocabGamePage'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id' },
    loading: false,
    signIn: vi.fn(),
    signInWithGoogle: vi.fn(),
    signInWithApple: vi.fn(),
  }),
}))

vi.mock('../hooks/useLogicalBack', () => ({
  useLogicalBack: () => vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: (..._args: any[]) => ({
        in: () => ({
          gte: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        }),
        eq: (..._eqArgs: any[]) => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
        order: () => ({
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
        count: 0,
        error: null,
      }),
    }),
  },
}))

describe('VocabGamePage', () => {
  function renderPage() {
    return render(
      <MemoryRouter>
        <VocabGamePage />
      </MemoryRouter>,
    )
  }

  it('renders the page title', () => {
    renderPage()
    expect(screen.getByText('游戏记忆')).toBeTruthy()
  })
})
