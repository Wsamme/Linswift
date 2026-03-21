import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const sourceDir = path.join(rootDir, 'public', 'classic-books')
const outputDir = path.join(sourceDir, 'processed')

const BOOK_CONFIGS = [
  {
    slug: 'alice-in-wonderland',
    fileName: 'Alices_Adventures_in_Wonderland.txt',
    title: "Alice's Adventures in Wonderland",
    author: 'Lewis Carroll',
    bodyStartPattern: /^CHAPTER I\.$/m,
    parser: 'chapter',
  },
  {
    slug: 'pride-and-prejudice',
    fileName: 'Pride_and_Prejudice.txt',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    bodyStartPattern: /^CHAPTER I\.?$/m,
    parser: 'chapter',
  },
  {
    slug: 'sherlock-holmes',
    fileName: 'The_Adventures_of_Sherlock_Holmes.txt',
    title: 'The Adventures of Sherlock Holmes',
    author: 'Arthur Conan Doyle',
    bodyStartPattern: /^I\. A SCANDAL IN BOHEMIA$/m,
    parser: 'sherlock',
  },
  {
    slug: 'tom-sawyer',
    fileName: 'The_Adventures_of_Tom_Sawyer.txt',
    title: 'The Adventures of Tom Sawyer',
    author: 'Mark Twain',
    bodyStartPattern: /^CHAPTER I$/m,
    parser: 'chapter',
  },
  {
    slug: 'frankenstein',
    fileName: 'Frankenstein.txt',
    title: 'Frankenstein',
    author: 'Mary Shelley',
    bodyStartPattern: /^Letter 1$/m,
    parser: 'frankenstein',
  },
  {
    slug: 'dracula',
    fileName: 'Dracula.txt',
    title: 'Dracula',
    author: 'Bram Stoker',
    bodyStartPattern: /^CHAPTER I$/m,
    parser: 'chapter',
  },
  {
    slug: 'jane-eyre',
    fileName: 'Jane_Eyre.txt',
    title: 'Jane Eyre',
    author: 'Charlotte Bronte',
    bodyStartPattern: /^CHAPTER I$/m,
    parser: 'chapter',
  },
  {
    slug: 'moby-dick',
    fileName: 'Moby_Dick.txt',
    title: 'Moby-Dick',
    author: 'Herman Melville',
    bodyStartPattern: /^CHAPTER 1\. Loomings\.$/m,
    parser: 'chapter-inline',
  },
  {
    slug: 'a-tale-of-two-cities',
    fileName: 'A_Tale_of_Two_Cities.txt',
    title: 'A Tale of Two Cities',
    author: 'Charles Dickens',
    bodyStartPattern: /^Book the First--Recalled to Life$/m,
    parser: 'tale-of-two-cities',
  },
  {
    slug: 'dorian-gray',
    fileName: 'The_Picture_of_Dorian_Gray.txt',
    title: 'The Picture of Dorian Gray',
    author: 'Oscar Wilde',
    bodyStartPattern: /^CHAPTER I\.$/m,
    parser: 'chapter',
  },
  {
    slug: 'anne-of-green-gables',
    fileName: 'Anne_of_Green_Gables.txt',
    title: 'Anne of Green Gables',
    author: 'L. M. Montgomery',
    bodyStartPattern: /^CHAPTER I\. Mrs\. Rachel Lynde Is Surprised$/m,
    parser: 'chapter-inline',
  },
]

function toTitleCase(text) {
  const titled = text
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, char) => char.toUpperCase())
    .replace(/\bAnd\b/g, 'and')
    .replace(/\bOf\b/g, 'of')
    .replace(/\bThe\b/g, 'the')
    .replace(/\bA\b/g, 'A')
    .replace(/\bIi\b/g, 'II')
    .replace(/\bIii\b/g, 'III')
    .replace(/\bIv\b/g, 'IV')
    .replace(/\bVi\b/g, 'VI')
    .replace(/\bVii\b/g, 'VII')
    .replace(/\bViii\b/g, 'VIII')
    .replace(/\bIx\b/g, 'IX')

  return titled.charAt(0).toUpperCase() + titled.slice(1)
}

function normalizeText(raw) {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
}

function stripProjectGutenberg(raw) {
  const startMarker = /\*\*\*\s*START OF THE PROJECT GUTENBERG EBOOK[\s\S]*?\*\*\*/
  const endMarker = /\*\*\*\s*END OF THE PROJECT GUTENBERG EBOOK[\s\S]*?\*\*\*/
  const startMatch = raw.match(startMarker)
  const endMatch = raw.match(endMarker)

  let text = raw
  if (startMatch?.index !== undefined) {
    text = text.slice(startMatch.index + startMatch[0].length)
  }
  if (endMatch?.index !== undefined) {
    text = text.slice(0, endMatch.index)
  }
  return text.trim()
}

function cleanLines(text) {
  const cleanedLines = []
  let insideIllustrationBlock = false

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\s+$/g, '').replace(/^\s+/g, '').replace(/\s{2,}/g, ' ')

    if (!line) {
      cleanedLines.push(line)
      continue
    }

    if (/^\[.*frontispiece.*\]?$/i.test(line) || /^\[illustration:?/i.test(line)) {
      insideIllustrationBlock = true
    }

    if (insideIllustrationBlock) {
      if (/^chapter\s+[ivxlcdm0-9]+\.?\]?$/i.test(line)) {
        cleanedLines.push(line.replace(/\]+$/g, ''))
      }

      if (/\]+$/.test(line)) {
        insideIllustrationBlock = false
      }
      continue
    }

    if (line === 'Contents' || line === 'CONTENTS') {
      continue
    }

    cleanedLines.push(line)
  }

  return cleanedLines
}

function normalizeChapterTitle(text) {
  return text
    .replace(/^\[+|\]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+\.$/, '.')
    .trim()
}

function splitIntoParagraphs(lines) {
  const paragraphs = []
  let buffer = []

  const flush = () => {
    if (buffer.length === 0) return
    const paragraph = buffer.join(' ').replace(/\s{2,}/g, ' ').trim()
    if (paragraph) paragraphs.push(paragraph)
    buffer = []
  }

  for (const line of lines) {
    if (!line) {
      flush()
      continue
    }

    const isRomanStoryHeading = /^[IVXLCDM]+\.\s+[A-Z0-9'’ -]+$/.test(line)
      && line === line.toUpperCase()

    if (/^(chapter|book the|letter \d+)/i.test(line) || isRomanStoryHeading) {
      flush()
      paragraphs.push(`__HEADING__${line}`)
      continue
    }

    if (/^[IVXLCDM]+\.$/i.test(line)) {
      flush()
      paragraphs.push(`__SUBHEADING__${line}`)
      continue
    }

    buffer.push(line)
  }

  flush()
  return paragraphs
}

function findLastMatchIndex(text, pattern) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  const matcher = new RegExp(pattern.source, flags)
  let match
  let lastIndex = -1

  while ((match = matcher.exec(text)) !== null) {
    lastIndex = match.index
    if (matcher.lastIndex === match.index) {
      matcher.lastIndex += 1
    }
  }

  return lastIndex
}

function buildChapterRecord({ id, title, sectionTitle, paragraphs }) {
  const cleanedParagraphs = paragraphs
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .filter((paragraph) => !/^__SUBHEADING__/.test(paragraph))

  const text = cleanedParagraphs.join('\n\n').trim()
  const wordCount = text ? text.split(/\s+/).length : 0

  return {
    id,
    title,
    sectionTitle: sectionTitle || null,
    paragraphs: cleanedParagraphs,
    text,
    wordCount,
  }
}

function parseStandardChapters(paragraphs) {
  const chapters = []
  let current = null

  const commit = () => {
    if (!current) return
    chapters.push(buildChapterRecord(current))
    current = null
  }

  for (let index = 0; index < paragraphs.length; index += 1) {
    const entry = paragraphs[index]
    if (!entry.startsWith('__HEADING__')) {
      if (current) current.paragraphs.push(entry)
      continue
    }

    const headingLine = entry.replace('__HEADING__', '')
    const nextParagraph = paragraphs[index + 1] && !paragraphs[index + 1].startsWith('__') ? paragraphs[index + 1] : null

    const match = headingLine.match(/^CHAPTER\s+([IVXLCDM0-9]+)\.?\s*(.*)$/i)
    const baseTitle = match ? `Chapter ${match[1]}` : headingLine
    let chapterTitle = baseTitle
    let consumeNextTitle = false

    if (match?.[2]) {
      chapterTitle = `${baseTitle}. ${match[2].trim()}`
    } else if (nextParagraph && nextParagraph.length <= 80 && /^[A-Z][A-Za-z0-9'’"“”(),;: -]+$/.test(nextParagraph)) {
      chapterTitle = `${baseTitle}. ${nextParagraph}`
      consumeNextTitle = true
    }

    commit()
    current = {
      id: `chapter-${chapters.length + 1}`,
      title: normalizeChapterTitle(chapterTitle),
      sectionTitle: null,
      paragraphs: [],
    }

    if (consumeNextTitle) {
      index += 1
    }
  }

  commit()
  return chapters
}

function parseChapterInline(paragraphs) {
  const chapters = []
  let current = null

  const commit = () => {
    if (!current) return
    chapters.push(buildChapterRecord(current))
    current = null
  }

  for (const entry of paragraphs) {
    if (!entry.startsWith('__HEADING__')) {
      if (current) current.paragraphs.push(entry)
      continue
    }

    const headingLine = entry.replace('__HEADING__', '')
    const match = headingLine.match(/^(CHAPTER\s+[IVXLCDM0-9]+\.?)\s*(.*)$/i)
    commit()
    current = {
      id: `chapter-${chapters.length + 1}`,
      title: normalizeChapterTitle(match?.[2] ? `${match[1]} ${match[2]}`.trim() : headingLine),
      sectionTitle: null,
      paragraphs: [],
    }
  }

  commit()
  return chapters
}

function parseFrankenstein(paragraphs) {
  const chapters = []
  let current = null

  const commit = () => {
    if (!current) return
    chapters.push(buildChapterRecord(current))
    current = null
  }

  for (const entry of paragraphs) {
    if (!entry.startsWith('__HEADING__')) {
      if (current) current.paragraphs.push(entry)
      continue
    }

    const headingLine = entry.replace('__HEADING__', '')
    if (!/^(Letter|Chapter)\s+\d+/i.test(headingLine)) continue

    commit()
    current = {
      id: `chapter-${chapters.length + 1}`,
      title: normalizeChapterTitle(headingLine),
      sectionTitle: /^Letter/i.test(headingLine) ? 'Walton Letters' : 'Frankenstein',
      paragraphs: [],
    }
  }

  commit()
  return chapters
}

function parseSherlock(paragraphs) {
  const chapters = []
  let current = null

  const commit = () => {
    if (!current) return
    chapters.push(buildChapterRecord(current))
    current = null
  }

  for (const entry of paragraphs) {
    if (!entry.startsWith('__HEADING__')) {
      if (current) current.paragraphs.push(entry)
      continue
    }

    const headingLine = entry.replace('__HEADING__', '')
    const match = headingLine.match(/^([IVXLCDM]+)\.\s+([A-Z][A-Z'’ -]+)$/)
    if (!match) continue

    commit()
    current = {
      id: `story-${chapters.length + 1}`,
      title: normalizeChapterTitle(toTitleCase(match[2])),
      sectionTitle: 'Sherlock Holmes Cases',
      paragraphs: [],
    }
  }

  commit()
  return chapters
}

function parseTaleOfTwoCities(paragraphs) {
  const chapters = []
  let current = null
  let currentBook = null

  const commit = () => {
    if (!current) return
    chapters.push(buildChapterRecord(current))
    current = null
  }

  for (let index = 0; index < paragraphs.length; index += 1) {
    const entry = paragraphs[index]
    if (!entry.startsWith('__HEADING__')) {
      if (current) current.paragraphs.push(entry)
      continue
    }

    const headingLine = entry.replace('__HEADING__', '')
    if (/^Book the /i.test(headingLine)) {
      currentBook = headingLine
      continue
    }

    const match = headingLine.match(/^CHAPTER\s+([IVXLCDM]+)\.?$/i)
    if (!match) continue

    const nextParagraph = paragraphs[index + 1] && !paragraphs[index + 1].startsWith('__') ? paragraphs[index + 1] : null
    const chapterTitle = nextParagraph && nextParagraph.length <= 80
      ? `Chapter ${match[1]}. ${nextParagraph}`
      : `Chapter ${match[1]}`

    commit()
    current = {
      id: `chapter-${chapters.length + 1}`,
      title: normalizeChapterTitle(chapterTitle),
      sectionTitle: currentBook,
      paragraphs: [],
    }

    if (nextParagraph && nextParagraph.length <= 80) {
      index += 1
    }
  }

  commit()
  return chapters
}

function parseBook(config, text) {
  const bodyStartIndex = findLastMatchIndex(text, config.bodyStartPattern)
  const body = bodyStartIndex >= 0 ? text.slice(bodyStartIndex) : text
  const paragraphs = splitIntoParagraphs(cleanLines(body))

  switch (config.parser) {
    case 'chapter-inline':
      return parseChapterInline(paragraphs)
    case 'frankenstein':
      return parseFrankenstein(paragraphs)
    case 'sherlock':
      return parseSherlock(paragraphs)
    case 'tale-of-two-cities':
      return parseTaleOfTwoCities(paragraphs)
    case 'chapter':
    default:
      return parseStandardChapters(paragraphs)
  }
}

async function buildBook(config) {
  const inputPath = path.join(sourceDir, config.fileName)
  const outputPath = path.join(outputDir, `${config.slug}.json`)
  const raw = await readFile(inputPath, 'utf8')
  const normalized = normalizeText(raw)
  const stripped = stripProjectGutenberg(normalized)
  const chapters = parseBook(config, stripped)
  const cleanedText = chapters.map((chapter) => chapter.text).join('\n\n')

  const payload = {
    slug: config.slug,
    title: config.title,
    author: config.author,
    generatedAt: new Date().toISOString(),
    chapterCount: chapters.length,
    cleanedText,
    chapters,
  }

  await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8')
  return payload
}

async function main() {
  await mkdir(outputDir, { recursive: true })

  const manifest = []
  for (const config of BOOK_CONFIGS) {
    const book = await buildBook(config)
    manifest.push({
      slug: book.slug,
      title: book.title,
      author: book.author,
      chapterCount: book.chapterCount,
      processedPath: `classic-books/processed/${book.slug}.json`,
    })
  }

  await writeFile(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), books: manifest }, null, 2),
    'utf8',
  )

  console.log(`Prepared ${manifest.length} classic books into ${outputDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
