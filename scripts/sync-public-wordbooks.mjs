import { mkdirSync, writeFileSync } from 'fs'
import { Client } from 'pg'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'xdhnerwnceeubijpuiqv'
const DEFAULT_REGIONS = ['ap-southeast-1', 'us-east-1', 'ap-northeast-1', 'eu-central-1']
const FETCH_TIMEOUT_MS = 30000
const INSERT_CHUNK_SIZE = 400

const COMMON_ABBREVIATIONS = new Set([
  'ai', 'api', 'app', 'asap', 'atm', 'bbc', 'bc', 'bec', 'ceo', 'cfo', 'cio', 'coo', 'covid',
  'cpu', 'cswl', 'cto', 'dna', 'dr', 'e.g', 'eg', 'etc', 'faq', 'fbi', 'ft', 'gdp', 'gmat',
  'gps', 'gpu', 'gre', 'html', 'http', 'https', 'id', 'ie', 'ielts', 'ios', 'ipa', 'iq', 'it',
  'mba', 'ml', 'mr', 'mrs', 'ms', 'nasa', 'pdf', 'phd', 'pm', 'ps', 'sdk', 'sql', 'sat',
  'toefl', 'tv', 'uk', 'usa', 'vip', 'vs', 'wifi', 'www', 'xml',
])

const COMMON_NET_SLANG = new Set([
  'af', 'bff', 'bro', 'bruh', 'cringe', 'dm', 'fomo', 'ftw', 'goat', 'grwm', 'hbd', 'idk', 'ikr',
  'irl', 'lmao', 'lmk', 'lowkey', 'meme', 'noob', 'nsfw', 'ofc', 'omg', 'oop', 'op', 'otp', 'pls',
  'pov', 'smh', 'stan', 'sus', 'tbh', 'tho', 'thx', 'tmi', 'troll', 'ttyl', 'vibe', 'viral', 'yolo',
])

const COMMON_PROPER_NAME_PARTICLES = new Set([
  'de', 'del', 'der', 'di', 'du', 'el', 'la', 'le', 'los', 'las', 'mac', 'mc', 'san', 'st', 'saint', 'van', 'von',
])

const WORD_SOURCES = [
  {
    slug: 'ielts-core',
    title: 'IELTS Core 3427',
    subtitle: '雅思高频词本',
    description: '来自 KyleBing 英语词库的 IELTS 数据，保留中文释义、音标与示例句。',
    category: 'exam',
    examType: 'IELTS',
    difficultyLabel: 'Intermediate / Advanced',
    tags: ['ielts', 'exam', 'academic'],
    sourceRepo: 'https://github.com/KyleBing/english-vocabulary',
    sourceLicense: 'Source repo does not specify a license clearly; verify before commercial redistribution.',
    parser: 'kyle_sentence',
    url: 'https://raw.githubusercontent.com/KyleBing/english-vocabulary/master/json_original/json-sentence/IELTS_2.json',
  },
  {
    slug: 'gre-core',
    title: 'GRE Core 7199',
    subtitle: 'GRE 高频词本',
    description: '来自 KyleBing 英语词库的 GRE 数据，保留中文释义、音标与示例句。',
    category: 'exam',
    examType: 'GRE',
    difficultyLabel: 'Advanced',
    tags: ['gre', 'exam', 'advanced'],
    sourceRepo: 'https://github.com/KyleBing/english-vocabulary',
    sourceLicense: 'Source repo does not specify a license clearly; verify before commercial redistribution.',
    parser: 'kyle_sentence',
    url: 'https://raw.githubusercontent.com/KyleBing/english-vocabulary/master/json_original/json-sentence/GRE_2.json',
  },
  {
    slug: 'toefl-core',
    title: 'TOEFL Core 13477',
    subtitle: '托福词本',
    description: '来自 KyleBing 英语词库的托福数据，含中文释义与短语。',
    category: 'exam',
    examType: 'TOEFL',
    difficultyLabel: 'Intermediate / Advanced',
    tags: ['toefl', 'exam'],
    sourceRepo: 'https://github.com/KyleBing/english-vocabulary',
    sourceLicense: 'Source repo does not specify a license clearly; verify before commercial redistribution.',
    parser: 'kyle_simple',
    url: 'https://raw.githubusercontent.com/KyleBing/english-vocabulary/master/json/6-%E6%89%98%E7%A6%8F-%E9%A1%BA%E5%BA%8F.json',
  },
  {
    slug: 'sat-core',
    title: 'SAT Core 8887',
    subtitle: 'SAT 高频词本',
    description: '来自 KyleBing 英语词库的 SAT 数据，含中文释义与短语。',
    category: 'exam',
    examType: 'SAT',
    difficultyLabel: 'Advanced',
    tags: ['sat', 'exam'],
    sourceRepo: 'https://github.com/KyleBing/english-vocabulary',
    sourceLicense: 'Source repo does not specify a license clearly; verify before commercial redistribution.',
    parser: 'kyle_simple',
    url: 'https://raw.githubusercontent.com/KyleBing/english-vocabulary/master/json/7-SAT-%E9%A1%BA%E5%BA%8F.json',
  },
  {
    slug: 'business-english-bwl1',
    title: 'Business English BWL1',
    subtitle: '商务英语词本',
    description: '基于 machine_readable_wordlists 的 Business Word List，适合商务英语与 BEC 场景。',
    category: 'discipline',
    examType: 'BEC',
    difficultyLabel: 'Business',
    tags: ['business', 'bec', 'workplace'],
    sourceRepo: 'https://github.com/lpmi-13/machine_readable_wordlists',
    sourceLicense: 'See upstream repository license.',
    parser: 'ranked_object',
    url: 'https://raw.githubusercontent.com/lpmi-13/machine_readable_wordlists/master/Discipline-Specific/BWL1/BWL1.json',
  },
  {
    slug: 'computer-science-cswl',
    title: 'Computer Science Word List',
    subtitle: '计算机学科词本',
    description: '基于 machine_readable_wordlists 的 CSWL，适合技术文档、论文与计算机课程阅读。',
    category: 'discipline',
    examType: 'CS',
    difficultyLabel: 'Technical',
    tags: ['computer-science', 'technical', 'academic'],
    sourceRepo: 'https://github.com/lpmi-13/machine_readable_wordlists',
    sourceLicense: 'See upstream repository license.',
    parser: 'headwords',
    url: 'https://raw.githubusercontent.com/lpmi-13/machine_readable_wordlists/master/Discipline-Specific/CSWL/CSWL.json',
  },
  {
    slug: 'academic-awl',
    title: 'Academic Word List',
    subtitle: '学术阅读词本',
    description: '基于 Academic Word List 的 570 个核心学术词族头词，适合雅思学术、论文与泛学术阅读。',
    category: 'academic',
    examType: 'AWL',
    difficultyLabel: 'Academic',
    tags: ['academic', 'awl', 'ielts-academic'],
    sourceRepo: 'https://github.com/lpmi-13/machine_readable_wordlists',
    sourceLicense: 'See upstream repository license.',
    parser: 'awl',
    url: 'https://raw.githubusercontent.com/lpmi-13/machine_readable_wordlists/master/Academic/AWL/AWL.json',
  },
]

function normalizeWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

function normalizeExtractedWord(word) {
  return normalizeWhitespace(word)
    .replace(/[“”‘’]/g, '\'')
    .replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '')
}

function hasSuspiciousCapitalization(rawWord) {
  const trimmed = normalizeWhitespace(rawWord)
  if (!trimmed) return false
  if (/^[A-Z][a-z]+(?:[-'][A-Z][a-z]+)+$/.test(trimmed)) return true
  if (/^(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)$/.test(trimmed)) return true
  if (/^[A-Z]{2,}(?:[-'][A-Z]{2,})*$/.test(trimmed)) return true
  if (/[A-Z].*[A-Z].*[a-z]/.test(trimmed) && !/^[A-Z][a-z]+$/.test(trimmed)) return true
  return false
}

function isAllCapsAbbreviation(word) {
  return /^[A-Z]{2,}$/.test(word) || /^[A-Za-z](?:\.[A-Za-z]){1,}\.?$/.test(word)
}

function isLikelyAbbreviation(word) {
  const normalized = word.toLowerCase()
  return COMMON_ABBREVIATIONS.has(normalized)
    || isAllCapsAbbreviation(word)
    || /^[a-z]{1,4}\d{1,3}$/i.test(word)
}

function isLikelyInternetSlang(word, meaning = '') {
  const normalized = word.toLowerCase()
  const meaningText = String(meaning || '').toLowerCase()
  return COMMON_NET_SLANG.has(normalized)
    || meaningText.includes('网络用语')
    || meaningText.includes('缩写')
    || meaningText.includes('梗')
}

function isLikelyProperNoun(word, meaning = '') {
  const normalized = word.toLowerCase()
  const meaningText = String(meaning || '').toLowerCase()
  return hasSuspiciousCapitalization(word)
    || COMMON_PROPER_NAME_PARTICLES.has(normalized)
    || meaningText.includes('人名')
    || meaningText.includes('地名')
    || meaningText.includes('城市')
    || meaningText.includes('国家')
    || meaningText.includes('品牌')
    || meaningText.includes('公司')
    || meaningText.includes('机构')
    || meaningText.includes('专有名词')
}

function isLikelyInventedWord(word, meaning = '') {
  const normalized = word.toLowerCase()
  const meaningText = String(meaning || '').toLowerCase()

  return normalized.length > 20
    || /(.)\1{3,}/.test(normalized)
    || /[^aeiou]{5,}/i.test(normalized)
    || normalized.includes('xq')
    || normalized.includes('zx')
    || normalized.includes('qz')
    || meaningText.includes('杜撰')
    || meaningText.includes('自造')
    || meaningText.includes('虚构')
    || meaningText.includes('昵称')
}

function isValidLearnableWord(word, meaning = '') {
  const normalized = normalizeExtractedWord(word)
  if (!normalized) return false
  if (!/^[A-Za-z][A-Za-z'-]*$/.test(normalized)) return false
  if (normalized.length < 2 || normalized.length > 18) return false
  if (/['-]{2,}/.test(normalized)) return false
  if (/^(?:[a-z]-){2,}[a-z]$/i.test(normalized)) return false
  if (isLikelyAbbreviation(normalized)) return false
  if (isLikelyInternetSlang(normalized, meaning)) return false
  if (isLikelyProperNoun(word, meaning)) return false
  if (isLikelyInventedWord(normalized, meaning)) return false
  return true
}

function cleanupMeaning(text) {
  return normalizeWhitespace(String(text || '').replace(/\[[^\]]+\]/g, ''))
}

function cleanupPhonetic(text) {
  return normalizeWhitespace(text).replace(/^\/|\/$/g, '')
}

function cleanupExample(text) {
  return normalizeWhitespace(String(text || '').replace(/<[^>]+>/g, ''))
}

function dedupeRows(rows) {
  const deduped = new Map()

  for (const row of rows) {
    const normalizedWord = normalizeExtractedWord(row.word)
    if (!isValidLearnableWord(row.word, row.meaning)) continue
    if (!normalizedWord) continue

    const key = normalizedWord.toLowerCase()
    if (deduped.has(key)) continue

    deduped.set(key, {
      word: key,
      meaning: cleanupMeaning(row.meaning),
      phonetic: cleanupPhonetic(row.phonetic),
      exampleSentence: cleanupExample(row.exampleSentence),
      sourceRank: Number(row.sourceRank) || null,
      metadata: row.metadata || {},
    })
  }

  return Array.from(deduped.values())
}

async function fetchJson(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Linswift Public Wordbooks Seeder',
        Accept: 'application/json',
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status} ${response.statusText} (${url})`)
    }

    return response.json()
  } finally {
    clearTimeout(timeout)
  }
}

function parseKyleSimpleRows(data) {
  return (Array.isArray(data) ? data : []).map((entry, index) => {
    const translations = Array.isArray(entry?.translations) ? entry.translations : []
    const meaning = translations
      .map((item) => cleanupMeaning(item?.translation || ''))
      .filter(Boolean)
      .slice(0, 3)
      .join('；')

    return {
      word: entry?.word || '',
      meaning,
      phonetic: '',
      exampleSentence: '',
      sourceRank: index + 1,
      metadata: {
        translationTypes: translations.map((item) => item?.type).filter(Boolean),
      },
    }
  })
}

function parseKyleSentenceRows(data) {
  return (Array.isArray(data) ? data : []).map((entry, index) => {
    const nestedWordData = entry?.content?.word?.content || {}
    const nestedTrans = Array.isArray(nestedWordData?.trans) ? nestedWordData.trans : []
    const nestedSentences = Array.isArray(nestedWordData?.sentence?.sentences) ? nestedWordData.sentence.sentences : []
    const simpleTrans = Array.isArray(entry?.translations) ? entry.translations : []
    const simpleSentences = Array.isArray(entry?.sentences) ? entry.sentences : []
    const translations = nestedTrans.length > 0 ? nestedTrans : simpleTrans
    const sentences = nestedSentences.length > 0 ? nestedSentences : simpleSentences
    const word = entry?.headWord || entry?.word || ''
    const phonetic = nestedWordData?.ukphone
      || nestedWordData?.usphone
      || nestedWordData?.phone
      || entry?.uk
      || entry?.us
      || ''

    return {
      word,
      meaning: translations
        .map((item) => cleanupMeaning(item?.tranCn || item?.tranOther || item?.translation || ''))
        .filter(Boolean)
        .slice(0, 3)
        .join('；'),
      phonetic: cleanupPhonetic(phonetic),
      exampleSentence: cleanupExample(sentences[0]?.sContent || sentences[0]?.sentence || ''),
      sourceRank: Number(entry?.wordRank) || index + 1,
      metadata: {
        sourceWordId: nestedWordData?.wordId || null,
        examplesCn: cleanupExample(sentences[0]?.sCn || sentences[0]?.translation || ''),
      },
    }
  })
}

function parseRankedObjectRows(data) {
  const words = data?.words || {}
  return Object.entries(words).map(([word, rank]) => ({
    word,
    meaning: '',
    phonetic: '',
    exampleSentence: '',
    sourceRank: Number(rank) || null,
    metadata: {},
  }))
}

function parseHeadwordRows(data) {
  return (Array.isArray(data?.headwords) ? data.headwords : []).map((word, index) => ({
    word,
    meaning: '',
    phonetic: '',
    exampleSentence: '',
    sourceRank: index + 1,
    metadata: {},
  }))
}

function parseAwlRows(data) {
  const rows = []
  for (const [sublist, entryMap] of Object.entries(data || {})) {
    for (const [word, payload] of Object.entries(entryMap || {})) {
      rows.push({
        word,
        meaning: '',
        phonetic: '',
        exampleSentence: '',
        sourceRank: rows.length + 1,
        metadata: {
          sublist,
          subwords: Array.isArray(payload?.subwords) ? payload.subwords : [],
        },
      })
    }
  }
  return rows
}

async function loadWordbook(source) {
  const raw = await fetchJson(source.url)

  let rows
  switch (source.parser) {
    case 'kyle_sentence':
      rows = parseKyleSentenceRows(raw)
      break
    case 'kyle_simple':
      rows = parseKyleSimpleRows(raw)
      break
    case 'ranked_object':
      rows = parseRankedObjectRows(raw)
      break
    case 'headwords':
      rows = parseHeadwordRows(raw)
      break
    case 'awl':
      rows = parseAwlRows(raw)
      break
    default:
      throw new Error(`Unknown parser: ${source.parser}`)
  }

  const cleaned = dedupeRows(rows)
  return {
    ...source,
    wordCount: cleaned.length,
    rows: cleaned,
  }
}

function buildInsertQuery(rows, wordbookId) {
  const values = []
  const placeholders = rows.map((row, index) => {
    const offset = index * 7
    values.push(
      wordbookId,
      row.word,
      row.meaning || null,
      row.phonetic || null,
      row.exampleSentence || null,
      row.sourceRank,
      JSON.stringify(row.metadata || {})
    )
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}::jsonb)`
  })

  return {
    text: `
      INSERT INTO public_wordbook_words (
        wordbook_id,
        word,
        meaning,
        phonetic,
        example_sentence,
        source_rank,
        metadata
      )
      VALUES ${placeholders.join(',\n')}
    `,
    values,
  }
}

function escapeSqlString(value) {
  return String(value).replace(/'/g, "''")
}

function toSqlText(value) {
  if (value === null || value === undefined || value === '') return 'NULL'
  return `'${escapeSqlString(value)}'`
}

function toSqlInteger(value) {
  if (value === null || value === undefined || value === '') return 'NULL'
  return Number.isFinite(Number(value)) ? String(Number(value)) : 'NULL'
}

function toSqlJson(value) {
  return `'${escapeSqlString(JSON.stringify(value || {}))}'::jsonb`
}

function toSqlTextArray(values) {
  const list = Array.isArray(values) ? values.filter(Boolean) : []
  if (list.length === 0) return 'ARRAY[]::text[]'
  return `ARRAY[${list.map((item) => toSqlText(item)).join(', ')}]::text[]`
}

function buildSeedSql(wordbooks) {
  const statements = [
    '-- Generated by scripts/sync-public-wordbooks.mjs',
    'BEGIN;',
  ]

  for (const wordbook of wordbooks) {
    statements.push(`
INSERT INTO public_wordbooks (
  slug,
  title,
  subtitle,
  description,
  category,
  exam_type,
  difficulty_label,
  language_code,
  word_count,
  tags,
  source_repo,
  source_license
)
VALUES (
  ${toSqlText(wordbook.slug)},
  ${toSqlText(wordbook.title)},
  ${toSqlText(wordbook.subtitle)},
  ${toSqlText(wordbook.description)},
  ${toSqlText(wordbook.category)},
  ${toSqlText(wordbook.examType || null)},
  ${toSqlText(wordbook.difficultyLabel || null)},
  'en',
  ${toSqlInteger(wordbook.wordCount)},
  ${toSqlTextArray(wordbook.tags)},
  ${toSqlText(wordbook.sourceRepo || null)},
  ${toSqlText(wordbook.sourceLicense || null)}
)
ON CONFLICT (slug)
DO UPDATE SET
  title = EXCLUDED.title,
  subtitle = EXCLUDED.subtitle,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  exam_type = EXCLUDED.exam_type,
  difficulty_label = EXCLUDED.difficulty_label,
  language_code = EXCLUDED.language_code,
  word_count = EXCLUDED.word_count,
  tags = EXCLUDED.tags,
  source_repo = EXCLUDED.source_repo,
  source_license = EXCLUDED.source_license,
  updated_at = NOW();
`)

    statements.push(`
DELETE FROM public_wordbook_words
WHERE wordbook_id = (
  SELECT id FROM public_wordbooks WHERE slug = ${toSqlText(wordbook.slug)}
);
`)

    for (let index = 0; index < wordbook.rows.length; index += INSERT_CHUNK_SIZE) {
      const chunk = wordbook.rows.slice(index, index + INSERT_CHUNK_SIZE)
      const valuesSql = chunk.map((row) => `(
  ${toSqlText(row.word)},
  ${toSqlText(row.meaning || null)},
  ${toSqlText(row.phonetic || null)},
  ${toSqlText(row.exampleSentence || null)},
  ${toSqlInteger(row.sourceRank)},
  ${toSqlJson(row.metadata || {})}
)`).join(',\n')

      statements.push(`
INSERT INTO public_wordbook_words (
  wordbook_id,
  word,
  meaning,
  phonetic,
  example_sentence,
  source_rank,
  metadata
)
SELECT
  public_wordbooks.id,
  seed.word,
  seed.meaning,
  seed.phonetic,
  seed.example_sentence,
  seed.source_rank,
  seed.metadata
FROM public_wordbooks
JOIN (
  VALUES
${valuesSql}
) AS seed(word, meaning, phonetic, example_sentence, source_rank, metadata)
  ON TRUE
WHERE public_wordbooks.slug = ${toSqlText(wordbook.slug)}
ON CONFLICT (wordbook_id, word)
DO UPDATE SET
  meaning = EXCLUDED.meaning,
  phonetic = EXCLUDED.phonetic,
  example_sentence = EXCLUDED.example_sentence,
  source_rank = EXCLUDED.source_rank,
  metadata = EXCLUDED.metadata;
`)
    }

    statements.push(`
UPDATE public_wordbooks
SET word_count = ${toSqlInteger(wordbook.rows.length)},
    updated_at = NOW()
WHERE slug = ${toSqlText(wordbook.slug)};
`)
  }

  statements.push('COMMIT;')
  return `${statements.join('\n')}\n`
}

async function connectDatabase() {
  const directUrl = process.env.SUPABASE_DB_URL
  if (directUrl) {
    const client = new Client({
      connectionString: directUrl,
      ssl: { rejectUnauthorized: false },
    })
    await client.connect()
    return client
  }

  const password = process.env.SUPABASE_DB_PASSWORD
  if (!password) {
    throw new Error('Missing SUPABASE_DB_PASSWORD or SUPABASE_DB_URL')
  }

  let lastError = null
  for (const region of DEFAULT_REGIONS) {
    const client = new Client({
      host: `aws-0-${region}.pooler.supabase.com`,
      port: 6543,
      database: 'postgres',
      user: `postgres.${DEFAULT_PROJECT_REF}`,
      password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    })

    try {
      await client.connect()
      return client
    } catch (error) {
      lastError = error
      await client.end().catch(() => {})
    }
  }

  throw lastError || new Error('Unable to connect to Supabase database')
}

function createSupabaseAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.SUPABASE_URL
    || process.env.VITE_SUPABASE_URL
    || `https://${DEFAULT_PROJECT_REF}.supabase.co`

  if (!serviceRoleKey) return null

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function upsertWordbook(client, wordbook) {
  const { rows } = await client.query(
    `
      INSERT INTO public_wordbooks (
        slug,
        title,
        subtitle,
        description,
        category,
        exam_type,
        difficulty_label,
        language_code,
        word_count,
        tags,
        source_repo,
        source_license
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, 'en', $8, $9::text[], $10, $11
      )
      ON CONFLICT (slug)
      DO UPDATE SET
        title = EXCLUDED.title,
        subtitle = EXCLUDED.subtitle,
        description = EXCLUDED.description,
        category = EXCLUDED.category,
        exam_type = EXCLUDED.exam_type,
        difficulty_label = EXCLUDED.difficulty_label,
        word_count = EXCLUDED.word_count,
        tags = EXCLUDED.tags,
        source_repo = EXCLUDED.source_repo,
        source_license = EXCLUDED.source_license,
        updated_at = NOW()
      RETURNING id
    `,
    [
      wordbook.slug,
      wordbook.title,
      wordbook.subtitle,
      wordbook.description,
      wordbook.category,
      wordbook.examType || null,
      wordbook.difficultyLabel || null,
      wordbook.wordCount,
      wordbook.tags,
      wordbook.sourceRepo || null,
      wordbook.sourceLicense || null,
    ]
  )

  const wordbookId = rows[0]?.id
  if (!wordbookId) {
    throw new Error(`Failed to upsert wordbook: ${wordbook.slug}`)
  }

  await client.query('DELETE FROM public_wordbook_words WHERE wordbook_id = $1', [wordbookId])

  for (let index = 0; index < wordbook.rows.length; index += INSERT_CHUNK_SIZE) {
    const chunk = wordbook.rows.slice(index, index + INSERT_CHUNK_SIZE)
    const query = buildInsertQuery(chunk, wordbookId)
    await client.query(query.text, query.values)
  }

  await client.query(
    'UPDATE public_wordbooks SET word_count = $2, updated_at = NOW() WHERE id = $1',
    [wordbookId, wordbook.rows.length]
  )

  return wordbookId
}

async function upsertWordbookWithServiceRole(supabase, wordbook) {
  const { data: bookRow, error: wordbookError } = await supabase
    .from('public_wordbooks')
    .upsert({
      slug: wordbook.slug,
      title: wordbook.title,
      subtitle: wordbook.subtitle,
      description: wordbook.description,
      category: wordbook.category,
      exam_type: wordbook.examType || null,
      difficulty_label: wordbook.difficultyLabel || null,
      language_code: 'en',
      word_count: wordbook.wordCount,
      tags: wordbook.tags,
      source_repo: wordbook.sourceRepo || null,
      source_license: wordbook.sourceLicense || null,
    }, {
      onConflict: 'slug',
    })
    .select('id')
    .single()

  if (wordbookError || !bookRow?.id) {
    throw new Error(wordbookError?.message || `Failed to upsert wordbook: ${wordbook.slug}`)
  }

  const wordbookId = Number(bookRow.id)

  const { error: deleteError } = await supabase
    .from('public_wordbook_words')
    .delete()
    .eq('wordbook_id', wordbookId)

  if (deleteError) {
    throw new Error(deleteError.message)
  }

  for (let index = 0; index < wordbook.rows.length; index += INSERT_CHUNK_SIZE) {
    const chunk = wordbook.rows.slice(index, index + INSERT_CHUNK_SIZE).map((row) => ({
      wordbook_id: wordbookId,
      word: row.word,
      meaning: row.meaning || null,
      phonetic: row.phonetic || null,
      example_sentence: row.exampleSentence || null,
      source_rank: row.sourceRank,
      metadata: row.metadata || {},
    }))

    const { error: insertError } = await supabase
      .from('public_wordbook_words')
      .insert(chunk)

    if (insertError) {
      throw new Error(insertError.message)
    }
  }

  const { error: updateError } = await supabase
    .from('public_wordbooks')
    .update({
      word_count: wordbook.rows.length,
      updated_at: new Date().toISOString(),
    })
    .eq('id', wordbookId)

  if (updateError) {
    throw new Error(updateError.message)
  }

  return wordbookId
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const sqlOutIndex = process.argv.indexOf('--sql-out')
  const sqlOutPath = sqlOutIndex >= 0 ? process.argv[sqlOutIndex + 1] : ''
  const sqlDirIndex = process.argv.indexOf('--sql-dir')
  const sqlDirPath = sqlDirIndex >= 0 ? process.argv[sqlDirIndex + 1] : ''
  const wordbooks = []

  for (const source of WORD_SOURCES) {
    const wordbook = await loadWordbook(source)
    wordbooks.push(wordbook)
    console.log(`Prepared ${wordbook.slug}: ${wordbook.wordCount} words`)
  }

  if (dryRun) {
    console.table(wordbooks.map((item) => ({
      slug: item.slug,
      title: item.title,
      category: item.category,
      count: item.wordCount,
    })))
    return
  }

  if (sqlOutPath) {
    const sql = buildSeedSql(wordbooks)
    writeFileSync(sqlOutPath, sql, 'utf8')
    console.log(`Generated SQL seed file: ${sqlOutPath}`)
    return
  }

  if (sqlDirPath) {
    mkdirSync(sqlDirPath, { recursive: true })

    for (const wordbook of wordbooks) {
      const filePath = `${sqlDirPath}/${wordbook.slug}.sql`
      writeFileSync(filePath, buildSeedSql([wordbook]), 'utf8')
      console.log(`Generated SQL seed file: ${filePath}`)
    }

    return
  }

  const supabaseAdmin = createSupabaseAdminClient()
  if (supabaseAdmin) {
    for (const wordbook of wordbooks) {
      const id = await upsertWordbookWithServiceRole(supabaseAdmin, wordbook)
      console.log(`Synced ${wordbook.slug} -> id=${id}, words=${wordbook.rows.length}`)
    }
    return
  }

  const client = await connectDatabase()
  try {
    await client.query('BEGIN')
    for (const wordbook of wordbooks) {
      const id = await upsertWordbook(client, wordbook)
      console.log(`Synced ${wordbook.slug} -> id=${id}, words=${wordbook.rows.length}`)
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
