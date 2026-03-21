import { DEEPL_PROXY_URL, MOONSHOT_MODEL } from './config.js'

const DICTIONARY_API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en'
const MOONSHOT_API_BASE = 'https://api.moonshot.cn/v1/chat/completions'
const PUBLIC_TRANSLATE_API_BASE = 'https://translate.googleapis.com/translate_a/single'
const CONTEXT_STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'with', 'from', 'this', 'into', 'such', 'left',
  'than', 'then', 'were', 'been', 'have', 'has', 'had', 'will', 'would', 'could',
  'should', 'about', 'after', 'before', 'over', 'under', 'through', 'between',
  'where', 'when', 'while', 'which', 'what', 'their', 'there', 'original',
  'plate', 'used', 'using', 'very', 'more', 'most', 'some', 'much', 'many',
])
const MEDICAL_HINTS = [
  'rabies', 'disease', 'symptom', 'suffering', 'patient', 'disorder', 'illness',
  'fever', 'infection', 'clinical', 'medical', 'diagnosis', 'syndrome', 'aversion',
  'hydrophobia',
]
const SCIENCE_HINTS = [
  'water', 'absorb', 'wetted', 'repel', 'repels', 'surface', 'coating', 'material',
  'membrane', 'molecule', 'molecular', 'chemical', 'chemistry', 'physics', 'oil',
  'solvent', 'fat', 'lipid', 'resin', 'polymer', 'ink', 'varnish', 'medium',
  'affinity', 'aqueous', 'nonpolar',
]
const HUMAN_CONTEXT_HINTS = [
  'person', 'people', 'man', 'woman', 'child', 'children', 'dog', 'bite', 'animal',
  'doctor', 'hospital', 'symptom', 'patient', 'medical', 'disease', 'rabies',
]
const TRANSLATION_LANGUAGE_MAP = {
  'zh-CN': { label: '简体中文', instruction: '简体中文' },
  'zh-TW': { label: '繁體中文', instruction: '繁體中文' },
  en: { label: 'English', instruction: 'English' },
  ja: { label: '日本語', instruction: '日语' },
  ko: { label: '한국어', instruction: '韩语' },
}

const TRANSLATION_MODE_MAP = {
  hybrid: '混合模式',
  deepl: 'DeepL',
  ai: 'AI',
}
const LOCALIZED_FALLBACKS = {
  'zh-CN': {
    detailUnavailable: '暂无详细释义',
    basicCard: '当前显示基础词卡',
    dictionaryMissing: '未找到词典释义',
    dictionaryView: '当前显示词典释义',
    dictionarySource: '词典来源：Dictionary API',
    baseFormPrefix: '词形还原：',
    translatedFallback: '按词形/直译推断',
    lookupFailed: '词典查询失败',
    retryLater: '请检查网络或稍后重试',
    examplePrefix: '例句：',
  },
  'zh-TW': {
    detailUnavailable: '暫無詳細釋義',
    basicCard: '目前顯示基礎詞卡',
    dictionaryMissing: '未找到詞典釋義',
    dictionaryView: '目前顯示詞典釋義',
    dictionarySource: '詞典來源：Dictionary API',
    baseFormPrefix: '詞形還原：',
    translatedFallback: '依詞形/直譯推斷',
    lookupFailed: '詞典查詢失敗',
    retryLater: '請檢查網路或稍後重試',
    examplePrefix: '例句：',
  },
  en: {
    detailUnavailable: 'Detailed meaning is not available yet',
    basicCard: 'Showing the basic word card',
    dictionaryMissing: 'Dictionary meaning not found',
    dictionaryView: 'Showing dictionary definition',
    dictionarySource: 'Source: Dictionary API',
    baseFormPrefix: 'Base form: ',
    translatedFallback: 'Inferred from morphology/direct translation',
    lookupFailed: 'Dictionary lookup failed',
    retryLater: 'Please check your connection and try again later',
    examplePrefix: 'Example: ',
  },
  ja: {
    detailUnavailable: '詳細な意味はまだありません',
    basicCard: '基本単語カードを表示中',
    dictionaryMissing: '辞書の意味が見つかりません',
    dictionaryView: '辞書の定義を表示中',
    dictionarySource: '出典: Dictionary API',
    baseFormPrefix: '基本形: ',
    translatedFallback: '語形/直訳から推定',
    lookupFailed: '辞書の検索に失敗しました',
    retryLater: '通信を確認して、しばらくしてから再試行してください',
    examplePrefix: '例文: ',
  },
  ko: {
    detailUnavailable: '상세 뜻이 아직 없습니다',
    basicCard: '기본 단어 카드를 표시 중입니다',
    dictionaryMissing: '사전 뜻을 찾지 못했습니다',
    dictionaryView: '사전 정의를 표시 중입니다',
    dictionarySource: '출처: Dictionary API',
    baseFormPrefix: '원형 추정: ',
    translatedFallback: '형태/직역 기반 추정',
    lookupFailed: '사전 조회에 실패했습니다',
    retryLater: '네트워크를 확인한 뒤 다시 시도해 주세요',
    examplePrefix: '예문: ',
  },
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function cleanupJson(raw) {
  return raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
}

function resolveTranslationLanguage(targetLanguage) {
  return TRANSLATION_LANGUAGE_MAP[targetLanguage] || TRANSLATION_LANGUAGE_MAP['zh-CN']
}

function resolveTranslationMode(mode) {
  return TRANSLATION_MODE_MAP[mode] ? mode : 'hybrid'
}

function getLocalizedFallback(targetLanguage) {
  return LOCALIZED_FALLBACKS[targetLanguage] || LOCALIZED_FALLBACKS['zh-CN']
}

function hasTranslatableContent(text) {
  return /[A-Za-z]{2,}/.test(String(text || ''))
}

function normalizeComparableText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeLookupWord(word) {
  return String(word || '')
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
}

function normalizeSenseText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizeSenseText(text) {
  return normalizeSenseText(text)
    .split(/\s+/)
    .filter((token) => token && token.length > 2 && !CONTEXT_STOP_WORDS.has(token))
}

function includesAny(text, keywords) {
  const normalized = normalizeSenseText(text)
  return keywords.some((keyword) => normalized.includes(keyword))
}

function countTokenOverlap(sourceTokens, targetTokens) {
  if (sourceTokens.length === 0 || targetTokens.length === 0) return 0
  const targetSet = new Set(targetTokens)
  let count = 0
  sourceTokens.forEach((token) => {
    if (targetSet.has(token)) count += 1
  })
  return count
}

function flattenDictionarySenses(entries) {
  return (Array.isArray(entries) ? entries : []).flatMap((entry) => {
    const meanings = Array.isArray(entry?.meanings) ? entry.meanings : []
    return meanings.flatMap((meaning, meaningIndex) => {
      const definitions = Array.isArray(meaning?.definitions) ? meaning.definitions : []
      return definitions.map((definitionItem, definitionIndex) => ({
        entry,
        partOfSpeech: String(meaning?.partOfSpeech || '').trim(),
        definition: String(definitionItem?.definition || '').trim(),
        example: String(definitionItem?.example || '').trim(),
        meaningIndex,
        definitionIndex,
      }))
    })
  }).filter((sense) => sense.definition)
}

function scoreDictionarySense(sense, context = '') {
  const contextText = normalizeSenseText(context)
  const contextTokens = tokenizeSenseText(contextText)
  const senseCorpus = `${sense.definition} ${sense.example} ${sense.partOfSpeech}`.trim()
  const senseTokens = tokenizeSenseText(senseCorpus)

  let score = 0
  score -= sense.meaningIndex * 0.35
  score -= sense.definitionIndex * 0.18

  const overlap = countTokenOverlap(contextTokens, senseTokens)
  score += overlap * 3.6

  const senseLooksMedical = includesAny(senseCorpus, MEDICAL_HINTS)
  const senseLooksScientific = includesAny(senseCorpus, SCIENCE_HINTS)
  const contextLooksMedical = includesAny(contextText, HUMAN_CONTEXT_HINTS) || includesAny(contextText, MEDICAL_HINTS)
  const contextLooksScientific = includesAny(contextText, SCIENCE_HINTS)

  if (senseLooksScientific) score += 1.4
  if (senseLooksMedical) score -= 4.2

  if (contextLooksScientific && senseLooksScientific) score += 7.5
  if (contextLooksScientific && sense.definition.includes('water')) score += 2.4
  if (contextLooksMedical && senseLooksMedical) score += 8
  if (!contextLooksMedical && senseLooksMedical) score -= 8.5
  if (!contextLooksMedical && /of,? or having|suffering from|afflicted/i.test(sense.definition)) score -= 3.5
  if (!contextLooksScientific && senseLooksScientific && contextTokens.length === 0) score += 0.8

  return score
}

function selectBestDictionarySense(entries, context = '') {
  const senses = flattenDictionarySenses(entries)
  if (senses.length === 0) return null

  let bestSense = senses[0]
  let bestScore = scoreDictionarySense(bestSense, context)

  for (let index = 1; index < senses.length; index += 1) {
    const nextSense = senses[index]
    const nextScore = scoreDictionarySense(nextSense, context)
    if (nextScore > bestScore) {
      bestSense = nextSense
      bestScore = nextScore
    }
  }

  return bestSense
}

function resolvePublicTranslateTarget(targetLanguage) {
  switch (targetLanguage) {
    case 'zh-TW':
      return 'zh-TW'
    case 'en':
      return 'en'
    case 'ja':
      return 'ja'
    case 'ko':
      return 'ko'
    case 'zh-CN':
    default:
      return 'zh-CN'
  }
}

async function translateWithPublicApi(text, targetLanguage = 'zh-CN') {
  const normalizedText = normalizeComparableText(text)
  if (!normalizedText) return ''
  if (targetLanguage === 'en') return normalizedText

  try {
    const url = new URL(PUBLIC_TRANSLATE_API_BASE)
    url.searchParams.set('client', 'gtx')
    url.searchParams.set('sl', 'en')
    url.searchParams.set('tl', resolvePublicTranslateTarget(targetLanguage))
    url.searchParams.set('dt', 't')
    url.searchParams.set('q', normalizedText)

    const response = await fetch(url.toString())
    if (!response.ok) return normalizedText

    const payload = await response.json()
    const translated = Array.isArray(payload?.[0])
      ? payload[0]
          .map((item) => String(item?.[0] || '').trim())
          .filter(Boolean)
          .join('')
      : ''

    return normalizeComparableText(translated) || normalizedText
  } catch {
    return normalizedText
  }
}

async function translateManyWithPublicApi(texts, targetLanguage = 'zh-CN') {
  const normalized = Array.isArray(texts)
    ? texts.map((text) => normalizeComparableText(text))
    : []

  if (normalized.length === 0) return []
  if (targetLanguage === 'en') return normalized

  const results = [...normalized]
  const batchSize = 8

  for (let start = 0; start < normalized.length; start += batchSize) {
    const batch = normalized.slice(start, start + batchSize)
    const translatedBatch = await Promise.all(
      batch.map(async (text) => {
        if (!text || !hasTranslatableContent(text)) return text
        return translateWithPublicApi(text, targetLanguage)
      })
    )

    translatedBatch.forEach((translated, index) => {
      results[start + index] = translated
    })
  }

  return results
}

async function translateManyWithDeepL(texts, targetLanguage = 'zh-CN') {
  const normalized = Array.isArray(texts)
    ? texts.map((text) => normalizeComparableText(text))
    : []

  if (normalized.length === 0) {
    return {
      lines: [],
      translatedCount: 0,
      fallbackUsed: false,
      unavailable: false,
      provider: 'deepl',
    }
  }

  const response = await fetch(DEEPL_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      texts: normalized,
      sourceLang: 'English',
      targetLang: targetLanguage,
    }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || 'DeepL 字幕翻译暂不可用')
  }

  const lines = Array.isArray(payload?.lines) ? payload.lines : normalized
  const translatedCount = lines.reduce((count, line, index) => {
    return count + (normalizeComparableText(line) !== normalizeComparableText(normalized[index]) ? 1 : 0)
  }, 0)

  return {
    lines,
    translatedCount,
    fallbackUsed: false,
    unavailable: translatedCount === 0,
    provider: 'deepl',
  }
}

function buildDictionaryLookupCandidates(word) {
  const normalized = normalizeLookupWord(word)
  const candidates = new Set()
  const push = (value) => {
    const next = normalizeLookupWord(value)
    if (next && next.length > 1) candidates.add(next)
  }

  push(normalized)

  if (normalized.endsWith('ies') && normalized.length > 4) {
    push(`${normalized.slice(0, -3)}y`)
  }
  if (normalized.endsWith('es') && normalized.length > 4) {
    push(normalized.slice(0, -2))
  }
  if (normalized.endsWith('s') && normalized.length > 3 && !normalized.endsWith('ss')) {
    push(normalized.slice(0, -1))
  }
  if (normalized.endsWith('ing') && normalized.length > 5) {
    push(normalized.slice(0, -3))
    push(`${normalized.slice(0, -3)}e`)
  }
  if (normalized.endsWith('ed') && normalized.length > 4) {
    push(normalized.slice(0, -2))
    push(`${normalized.slice(0, -1)}`)
    push(`${normalized.slice(0, -2)}e`)
  }

  return Array.from(candidates)
}

async function fetchDictionaryEntry(word) {
  const response = await fetch(`${DICTIONARY_API_BASE}/${encodeURIComponent(word)}`)
  if (!response.ok) return null
  const payload = await response.json()
  return Array.isArray(payload) ? payload.filter(Boolean) : []
}

async function fetchDictionaryEntryWithVariants(word) {
  const candidates = buildDictionaryLookupCandidates(word)

  for (const candidate of candidates) {
    try {
      const entry = await fetchDictionaryEntry(candidate)
      if (Array.isArray(entry) && entry.length > 0) {
        return {
          entries: entry,
          matchedWord: candidate,
        }
      }
    } catch {}
  }

  return null
}

async function callMoonshot(messages, apiKey, temperature = 0.2) {
  if (!apiKey) return null

  try {
    const response = await fetch(MOONSHOT_API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MOONSHOT_MODEL,
        temperature,
        messages,
      }),
    })

    if (!response.ok) return null

    const payload = await response.json()
    return payload?.choices?.[0]?.message?.content || null
  } catch {
    return null
  }
}

function fallbackWordDetail(word, explanation = null, targetLanguage = 'zh-CN') {
  const copy = getLocalizedFallback(targetLanguage)
  return {
    word,
    phonetic: explanation?.phonetic || '',
    meaning: explanation?.meaning || copy.detailUnavailable,
    note: explanation?.note || copy.basicCard,
    examples: explanation?.note?.startsWith(copy.examplePrefix)
      ? [explanation.note.replace(copy.examplePrefix, '').trim()]
      : [],
  }
}

export async function fetchDictionaryExplanation(word, targetLanguage = 'en', context = '') {
  const copy = getLocalizedFallback(targetLanguage)
  try {
    const dictionaryMatch = await fetchDictionaryEntryWithVariants(word)
    if (!dictionaryMatch?.entries?.length) {
      const translatedFallback =
        targetLanguage === 'en'
          ? copy.dictionaryMissing
          : await translateWithPublicApi(word, targetLanguage)
      return {
        word,
        meaning: translatedFallback || copy.dictionaryMissing,
        note: copy.translatedFallback,
      }
    }

    const bestSense = selectBestDictionarySense(dictionaryMatch.entries, context)
    const fallbackSense = flattenDictionarySenses(dictionaryMatch.entries)[0] || null
    const selectedSense = bestSense || fallbackSense
    const entry = selectedSense?.entry || dictionaryMatch.entries[0]
    const rawDefinition = selectedSense?.definition || copy.dictionaryMissing
    const example = selectedSense?.example || ''
    const phonetic =
      entry?.phonetic ||
      entry?.phonetics?.find((item) => item.text)?.text ||
      ''
    const definition =
      targetLanguage === 'en'
        ? rawDefinition
        : await translateWithPublicApi(rawDefinition, targetLanguage)
    const usedBaseForm =
      dictionaryMatch.matchedWord && dictionaryMatch.matchedWord !== normalizeLookupWord(word)
        ? ` · ${copy.baseFormPrefix}${dictionaryMatch.matchedWord}`
        : ''

    return {
      word,
      meaning: definition,
      phonetic,
      note: example ? `${copy.examplePrefix}${example}` : `${copy.dictionarySource}${usedBaseForm}`,
    }
  } catch {
    return {
      word,
      meaning: copy.lookupFailed,
      note: copy.retryLater,
    }
  }
}

export async function fetchDictionaryWordDetail(word, targetLanguage = 'en', context = '') {
  const copy = getLocalizedFallback(targetLanguage)
  try {
    const dictionaryMatch = await fetchDictionaryEntryWithVariants(word)
    if (!dictionaryMatch?.entries?.length) {
      const translatedFallback =
        targetLanguage === 'en'
          ? copy.dictionaryMissing
          : await translateWithPublicApi(word, targetLanguage)
      return {
        word,
        phonetic: '',
        meaning: translatedFallback || copy.dictionaryMissing,
        note: copy.translatedFallback,
        examples: [],
      }
    }

    const bestSense = selectBestDictionarySense(dictionaryMatch.entries, context)
    const entry = bestSense?.entry || dictionaryMatch.entries[0]
    const phonetic =
      entry?.phonetic ||
      entry?.phonetics?.find((item) => item.text)?.text ||
      ''
    const selectedSense =
      bestSense ||
      flattenDictionarySenses(dictionaryMatch.entries)[0] ||
      null
    const meaningParts = []
    const examples = []

    if (selectedSense) {
      const part = selectedSense.partOfSpeech ? `${selectedSense.partOfSpeech}. ` : ''
      meaningParts.push(`${part}${selectedSense.definition}`)
      if (selectedSense.example) {
        examples.push(selectedSense.example)
      }
    }

    const localizedMeaning =
      targetLanguage === 'en'
        ? meaningParts.join('；') || copy.dictionaryMissing
        : await translateWithPublicApi(
            meaningParts.join('；') || copy.dictionaryMissing,
            targetLanguage
          )
    const usedBaseForm =
      dictionaryMatch.matchedWord && dictionaryMatch.matchedWord !== normalizeLookupWord(word)
        ? ` · ${copy.baseFormPrefix}${dictionaryMatch.matchedWord}`
        : ''

    return {
      word,
      phonetic,
      meaning: localizedMeaning,
      note: `${copy.dictionarySource}${usedBaseForm}`,
      examples,
    }
  } catch {
    return fallbackWordDetail(word, null, targetLanguage)
  }
}

export async function fetchLinswiftExplanations(words, apiKey, targetLanguage = 'zh-CN') {
  if (!apiKey || words.length === 0) return null
  const language = resolveTranslationLanguage(targetLanguage)

  const prompt = [
    '你是 Linswift 英语学习 APP 的词汇助手。',
    '请按 Linswift 的学习风格，为下面这些单词输出学习卡片。',
    `返回 JSON 数组，每项结构为 {"word":"", "phonetic":"", "meaning":"${language.label}释义（多个义项可用分号分隔）", "note":"${language.label}简短记忆提示或高频例句"}。`,
    '不要返回 markdown，不要返回数组外文本。',
    `meaning 与 note 都必须使用${language.instruction}；note 控制在 24 个字以内；phonetic 尽量提供。`,
    `单词列表：${words.join(', ')}`,
  ].join('\n')

  try {
    const content = await callMoonshot([
      {
        role: 'system',
        content: '你是严格返回 JSON 的 Linswift 词汇学习助手。',
      },
      {
        role: 'user',
        content: prompt,
      },
    ], apiKey)
    if (!content) return null

    const parsed = safeJsonParse(cleanupJson(content))
    if (!Array.isArray(parsed)) return null

    return parsed.reduce((accumulator, item) => {
      if (!item?.word || !item?.meaning) return accumulator
      const normalizedWord = String(item.word).toLowerCase()
      accumulator[normalizedWord] = {
        word: item.word.toLowerCase(),
        meaning: item.meaning,
        phonetic: item.phonetic || '',
        note: item.note || '来自 Linswift AI 词义补全',
      }
      return accumulator
    }, {})
  } catch {
    return null
  }
}

export async function fetchLinswiftWordDetail(word, apiKey, targetLanguage = 'zh-CN', context = '') {
  const language = resolveTranslationLanguage(targetLanguage)
  if (!apiKey) {
    return fetchDictionaryWordDetail(word, targetLanguage, context)
  }

  const prompt = `你是 Linswift 英语学习 APP 的单词老师。请为这个英文单词生成学习卡片。

单词：${word}
${context ? `上下文：${context}` : ''}

严格返回 JSON，不要 markdown，不要解释性文字：
{
  "word": "${word}",
  "phonetic": "音标",
  "meaning": "${language.label}释义（多个义项用分号分隔）",
  "note": "${language.label}一句简短记忆提示",
  "examples": [
    "例句 1",
    "例句 2"
  ]
}

要求：
- examples 最多 2 条
- 例句必须是自然英文短句
- meaning 与 note 必须使用${language.instruction}
- 如果提供了上下文，优先返回最符合该上下文的词义，不要选生僻医学义项
- 一定返回合法 JSON`

  try {
    const content = await callMoonshot([
      {
        role: 'system',
        content: '你是严格返回 JSON 的 Linswift 单词学习助手。',
      },
      {
        role: 'user',
        content: prompt,
      },
    ], apiKey)
    if (!content) {
      return fetchDictionaryWordDetail(word, targetLanguage, context)
    }

    const parsed = safeJsonParse(cleanupJson(content))
    if (!parsed?.word || !parsed?.meaning) {
      return fetchDictionaryWordDetail(word, targetLanguage, context)
    }

    return {
      word: parsed.word,
      phonetic: parsed.phonetic || '',
      meaning: parsed.meaning,
      note: parsed.note || '来自 Linswift AI 词卡',
      examples: Array.isArray(parsed.examples)
        ? parsed.examples.filter(Boolean).slice(0, 2)
        : [],
    }
  } catch {
    return fetchDictionaryWordDetail(word, targetLanguage, context)
  }
}

async function translateBatchLinesWithAI(lines, apiKey, targetLanguage = 'zh-CN') {
  const normalizedLines = Array.isArray(lines)
    ? lines.map((line) => String(line || '').trim())
    : []

  if (normalizedLines.length === 0) {
    return {
      lines: [],
      translatedCount: 0,
      fallbackUsed: false,
      unavailable: false,
      provider: 'fallback',
    }
  }

  const indexedLines = normalizedLines
    .map((text, index) => ({ index, text }))
    .filter((item) => item.text && hasTranslatableContent(item.text))

  if (indexedLines.length === 0) {
    return {
      lines: normalizedLines,
      translatedCount: 0,
      fallbackUsed: false,
      unavailable: false,
      provider: 'fallback',
    }
  }

  if (!apiKey) {
    const translatedLines = await translateManyWithPublicApi(normalizedLines, targetLanguage)
    const translatedCount = translatedLines.reduce((count, line, index) => {
      return count + (normalizeComparableText(line) !== normalizeComparableText(normalizedLines[index]) ? 1 : 0)
    }, 0)
    return {
      lines: translatedLines,
      translatedCount,
      fallbackUsed: true,
      unavailable: translatedCount === 0,
      provider: 'fallback',
    }
  }

  const language = resolveTranslationLanguage(targetLanguage)
  const resultLines = [...normalizedLines]
  const batchSize = 12
  let translatedCount = 0
  let fallbackUsed = false

  for (let start = 0; start < indexedLines.length; start += batchSize) {
    const batch = indexedLines.slice(start, start + batchSize)
    const numbered = batch.map((item) => `[${item.index}] ${item.text}`).join('\n')
    const prompt = [
      `你是 Linswift 的 YouTube 字幕翻译助手，请把这些英文字幕翻译成${language.instruction}。`,
      '规则：',
      '- 严格保留原编号，每行格式必须是 [编号] 翻译内容',
      '- 翻译自然、简洁，适合字幕辅助阅读',
      '- 专有名词、频道名、品牌名可保留原文',
      '- 不要添加解释、括号说明、markdown 或任何额外文字',
      '',
      numbered,
    ].join('\n')

    const raw = await callMoonshot(
      [
        {
          role: 'system',
          content: '你是严格按编号逐行返回字幕翻译的助手。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      apiKey
    )

    const parsedIndexes = new Set()
    if (raw) {
      const lineRegex = /\[(\d+)\]\s*([^\n]+)/g
      let match
      while ((match = lineRegex.exec(raw)) !== null) {
        const index = Number(match[1])
        const translated = normalizeComparableText(match[2])
        if (!Number.isFinite(index) || !translated) continue
        if (index < 0 || index >= resultLines.length) continue
        resultLines[index] = translated
        parsedIndexes.add(index)
      }
    }

    if (parsedIndexes.size < batch.length) {
      fallbackUsed = true

      const missingItems = batch.filter((item) => !parsedIndexes.has(item.index))
      if (missingItems.length > 0) {
        const fallbackLines = await translateManyWithPublicApi(
          missingItems.map((item) => item.text),
          targetLanguage
        )

        missingItems.forEach((item, index) => {
          const translated = normalizeComparableText(fallbackLines[index] || item.text)
          resultLines[item.index] = translated || item.text
          if (translated && translated !== item.text) {
            translatedCount += 1
          }
        })
      }
    }
    translatedCount += parsedIndexes.size
  }

  return {
    lines: resultLines,
    translatedCount,
    fallbackUsed,
    unavailable: translatedCount === 0,
    provider: fallbackUsed ? 'fallback' : 'moonshot',
  }
}

export async function translateBatchLines(
  lines,
  apiKey,
  targetLanguage = 'zh-CN',
  translationMode = 'hybrid'
) {
  const mode = resolveTranslationMode(translationMode)

  if (mode === 'ai') {
    return {
      ...(await translateBatchLinesWithAI(lines, apiKey, targetLanguage)),
      mode,
      note: `当前使用 ${TRANSLATION_MODE_MAP[mode]} 翻译网页与字幕`,
    }
  }

  try {
    const deeplResult = await translateManyWithDeepL(lines, targetLanguage)
    return {
      ...deeplResult,
      mode,
      note:
        mode === 'deepl'
          ? '当前使用 DeepL 翻译网页与字幕'
          : '当前使用混合模式：DeepL 负责主译文',
    }
  } catch (error) {
    const fallback = await translateBatchLinesWithAI(lines, apiKey, targetLanguage)
    const message = error instanceof Error ? error.message : String(error)
    return {
      ...fallback,
      mode,
      fallbackUsed: true,
      note:
        mode === 'deepl'
          ? `DeepL 暂不可用，已回退到 ${fallback.provider === 'moonshot' ? 'AI' : '公共翻译'}：${message}`
          : `混合模式里的 DeepL 暂不可用，已回退到 ${fallback.provider === 'moonshot' ? 'AI' : '公共翻译'}：${message}`,
    }
  }
}
