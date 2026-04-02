import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, vi } from 'vitest'
import ReadingTestPage from './ReadingTestPage'

vi.mock('../hooks/useLogicalBack', () => ({
  useLogicalBack: () => vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          limit: () => ({ data: [], error: null }),
        }),
      }),
    }),
  },
}))

describe('ReadingTestPage', () => {
  function renderPage() {
    return render(
      <MemoryRouter>
        <ReadingTestPage />
      </MemoryRouter>,
    )
  }

  it('renders without crashing', () => {
    renderPage()
  })
})
