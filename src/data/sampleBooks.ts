import type { UserBook } from '../lib/supabase'

const now = new Date().toISOString()

export const SAMPLE_BOOKS: UserBook[] = [
  {
    id: -101,
    user_id: 'sample',
    title: 'Alice in Wonderland (Sample)',
    author: 'Lewis Carroll',
    cover_emoji: '🐇',
    shared_book_slug: null,
    file_path: null,
    content_text: `Alice was beginning to get very tired of sitting by her sister on the bank.

She saw a White Rabbit with pink eyes run close by her.

"Oh dear! Oh dear! I shall be late!" said the Rabbit.

Alice ran after it with great curiosity and reached the rabbit-hole.`,
    total_pages: 6,
    current_page: 0,
    progress: 0,
    unfamiliar_words_count: 0,
    created_at: now,
    updated_at: now,
  },
  {
    id: -102,
    user_id: 'sample',
    title: 'The Little Prince (Sample)',
    author: 'Antoine de Saint-Exupéry',
    cover_emoji: '🪐',
    shared_book_slug: null,
    file_path: null,
    content_text: `When I was six years old, I saw a picture of a boa constrictor in a book.

I drew my first picture and showed it to the grown-ups.

They answered, "Why should anyone be frightened by a hat?"

My drawing was not a hat. It was a boa constrictor digesting an elephant.`,
    total_pages: 5,
    current_page: 0,
    progress: 0,
    unfamiliar_words_count: 0,
    created_at: now,
    updated_at: now,
  },
  {
    id: -103,
    user_id: 'sample',
    title: 'Pride and Prejudice (Sample)',
    author: 'Jane Austen',
    cover_emoji: '💌',
    shared_book_slug: null,
    file_path: null,
    content_text: `It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.

However little known the feelings of such a man may be on his first entering a neighbourhood, this truth is fixed in the minds of the surrounding families.

"My dear Mr. Bennet," said his lady to him one day, "have you heard that Netherfield Park is let at last?"`,
    total_pages: 4,
    current_page: 0,
    progress: 0,
    unfamiliar_words_count: 0,
    created_at: now,
    updated_at: now,
  },
]
