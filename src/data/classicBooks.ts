export interface ClassicBookCatalogItem {
  slug: string
  title: string
  author: string
  coverEmoji: string
  assetPath: string
  processedPath: string
  sortOrder: number
  coverTheme: {
    background: [string, string]
    glow: string
    accent: string
    pattern: 'rabbit' | 'rose' | 'detective' | 'river' | 'lightning' | 'moon' | 'leaf' | 'wave' | 'city' | 'mirror'
    tagline: string
  }
}

export const CLASSIC_BOOKS: ClassicBookCatalogItem[] = [
  {
    slug: 'alice-in-wonderland',
    title: "Alice's Adventures in Wonderland",
    author: 'Lewis Carroll',
    coverEmoji: '🐇',
    assetPath: 'classic-books/Alices_Adventures_in_Wonderland.txt',
    processedPath: 'classic-books/processed/alice-in-wonderland.json',
    sortOrder: 1,
    coverTheme: {
      background: ['#fff6d6', '#ffb26b'],
      glow: '#fff9ef',
      accent: '#8c4c17',
      pattern: 'rabbit',
      tagline: 'Wonder / Curiosity / Dream',
    },
  },
  {
    slug: 'pride-and-prejudice',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    coverEmoji: '💐',
    assetPath: 'classic-books/Pride_and_Prejudice.txt',
    processedPath: 'classic-books/processed/pride-and-prejudice.json',
    sortOrder: 2,
    coverTheme: {
      background: ['#ffe7ee', '#d86d8c'],
      glow: '#fff6f7',
      accent: '#6d2042',
      pattern: 'rose',
      tagline: 'Manners / Wit / Desire',
    },
  },
  {
    slug: 'sherlock-holmes',
    title: 'The Adventures of Sherlock Holmes',
    author: 'Arthur Conan Doyle',
    coverEmoji: '🕵️',
    assetPath: 'classic-books/The_Adventures_of_Sherlock_Holmes.txt',
    processedPath: 'classic-books/processed/sherlock-holmes.json',
    sortOrder: 3,
    coverTheme: {
      background: ['#e1ecf7', '#5e7ea3'],
      glow: '#f4f8fc',
      accent: '#21364f',
      pattern: 'detective',
      tagline: 'Case / Smoke / Reason',
    },
  },
  {
    slug: 'tom-sawyer',
    title: 'The Adventures of Tom Sawyer',
    author: 'Mark Twain',
    coverEmoji: '🛶',
    assetPath: 'classic-books/The_Adventures_of_Tom_Sawyer.txt',
    processedPath: 'classic-books/processed/tom-sawyer.json',
    sortOrder: 4,
    coverTheme: {
      background: ['#dff4ef', '#58a48f'],
      glow: '#f2fffb',
      accent: '#184c42',
      pattern: 'river',
      tagline: 'River / Youth / Mischief',
    },
  },
  {
    slug: 'frankenstein',
    title: 'Frankenstein',
    author: 'Mary Shelley',
    coverEmoji: '⚡',
    assetPath: 'classic-books/Frankenstein.txt',
    processedPath: 'classic-books/processed/frankenstein.json',
    sortOrder: 5,
    coverTheme: {
      background: ['#d8f0ea', '#3f887a'],
      glow: '#effff9',
      accent: '#163c35',
      pattern: 'lightning',
      tagline: 'Creation / Fear / Storm',
    },
  },
  {
    slug: 'dracula',
    title: 'Dracula',
    author: 'Bram Stoker',
    coverEmoji: '🦇',
    assetPath: 'classic-books/Dracula.txt',
    processedPath: 'classic-books/processed/dracula.json',
    sortOrder: 6,
    coverTheme: {
      background: ['#281822', '#8b2e4c'],
      glow: '#4e2a3b',
      accent: '#ffe2ea',
      pattern: 'moon',
      tagline: 'Night / Blood / Castle',
    },
  },
  {
    slug: 'jane-eyre',
    title: 'Jane Eyre',
    author: 'Charlotte Bronte',
    coverEmoji: '🌿',
    assetPath: 'classic-books/Jane_Eyre.txt',
    processedPath: 'classic-books/processed/jane-eyre.json',
    sortOrder: 7,
    coverTheme: {
      background: ['#ede7dc', '#8f6f57'],
      glow: '#fbf6ee',
      accent: '#3b2a20',
      pattern: 'leaf',
      tagline: 'Fire / Thorn / Soul',
    },
  },
  {
    slug: 'moby-dick',
    title: 'Moby-Dick',
    author: 'Herman Melville',
    coverEmoji: '🐋',
    assetPath: 'classic-books/Moby_Dick.txt',
    processedPath: 'classic-books/processed/moby-dick.json',
    sortOrder: 8,
    coverTheme: {
      background: ['#d7eef7', '#377ea8'],
      glow: '#f2fbff',
      accent: '#0f3650',
      pattern: 'wave',
      tagline: 'Sea / Hunt / Obsession',
    },
  },
  {
    slug: 'a-tale-of-two-cities',
    title: 'A Tale of Two Cities',
    author: 'Charles Dickens',
    coverEmoji: '🏛️',
    assetPath: 'classic-books/A_Tale_of_Two_Cities.txt',
    processedPath: 'classic-books/processed/a-tale-of-two-cities.json',
    sortOrder: 9,
    coverTheme: {
      background: ['#f5dcc5', '#c97944'],
      glow: '#fff4e9',
      accent: '#5f2d13',
      pattern: 'city',
      tagline: 'Revolution / Ash / Echo',
    },
  },
  {
    slug: 'dorian-gray',
    title: 'The Picture of Dorian Gray',
    author: 'Oscar Wilde',
    coverEmoji: '🪞',
    assetPath: 'classic-books/The_Picture_of_Dorian_Gray.txt',
    processedPath: 'classic-books/processed/dorian-gray.json',
    sortOrder: 10,
    coverTheme: {
      background: ['#efe1d6', '#92715f'],
      glow: '#fff8f4',
      accent: '#3f2e26',
      pattern: 'mirror',
      tagline: 'Beauty / Decay / Desire',
    },
  },
  {
    slug: 'anne-of-green-gables',
    title: 'Anne of Green Gables',
    author: 'L. M. Montgomery',
    coverEmoji: '🍃',
    assetPath: 'classic-books/Anne_of_Green_Gables.txt',
    processedPath: 'classic-books/processed/anne-of-green-gables.json',
    sortOrder: 11,
    coverTheme: {
      background: ['#e5f3dc', '#72a35a'],
      glow: '#f7fff1',
      accent: '#214d2a',
      pattern: 'leaf',
      tagline: 'Fields / Imagination / Home',
    },
  },
]

const CLASSIC_BOOK_MAP = new Map(CLASSIC_BOOKS.map((book) => [book.slug, book]))

export function getClassicBookBySlug(slug: string | null | undefined) {
  if (!slug) return null
  return CLASSIC_BOOK_MAP.get(slug) ?? null
}

export function resolveClassicBookAssetUrl(assetPath: string) {
  const cleanPath = assetPath.replace(/^\/+/, '')
  return new URL(`${import.meta.env.BASE_URL}${cleanPath}`, window.location.href).toString()
}
