/**
 * Moonshot (Kimi) AI 服务层
 * 封装所有与 Moonshot API 的交互逻辑
 * 
 * 使用 Moonshot API（OpenAI 兼容格式）
 * API Key 从环境变量 VITE_MOONSHOT_API_KEY 读取（安全，不硬编码）
 * 
 * ⚡ 内置 fallback 降级机制：
 *    - API 可用时 → 使用真实 Moonshot AI
 *    - API 不可用时（配额耗尽等）→ 自动降级为模拟数据
 *    - 页面始终可用，不会因 API 问题白屏
 */

import {
  buildFallbackLongSentenceAnalysis,
  isLongSentenceRole,
  type LongSentenceAnalysis,
  type LongSentenceConnector,
  type LongSentenceSegment,
} from '../lib/longSentence'
import { filterDictionaryWhitelistedWords } from '../lib/dictionaryWhitelist'
import { callMoonshot as callMoonshotClient } from './moonshotClient'

// ===== Moonshot API 配置 =====
const API_KEY = import.meta.env.VITE_MOONSHOT_API_KEY as string
const API_BASE = 'https://api.moonshot.ai/v1'
const MODEL = 'kimi-k2.5'
const PUBLIC_EN_DICTIONARY_API = 'https://api.dictionaryapi.dev/api/v2/entries/en'
const DEEPL_PROXY_FALLBACK_BASE = 'https://www.linswift.com'
const wordDetailCache = new Map<string, WordDetail>()
const wordDetailInflight = new Map<string, Promise<WordDetail>>()
const flashcardMnemonicCache = new Map<string, string>()
const flashcardMnemonicInflight = new Map<string, Promise<string>>()

if (!API_KEY) {
  console.warn('⚠️ VITE_MOONSHOT_API_KEY 未配置，AI 功能将使用模拟数据')
}

// ===== 类型定义 =====

/** 翻译结果 */
export interface TranslateResult {
  translatedText: string
  unfamiliarWords: UnfamiliarWord[]
}

/** 陌生词汇 */
export interface UnfamiliarWord {
  word: string
  meaning: string
  phonetic?: string
}

/** 单词详情 */
export interface WordDetail {
  word: string
  phonetic: string
  phoneticBr?: string
  phoneticAm?: string
  meaning: string
  partOfSpeechBlocks?: Array<{
    partOfSpeech: string
    meanings: string[]
  }>
  examples: string[]
  synonyms: string[]
  phrasePatterns?: Array<{
    phrase: string
    meaning: string
  }>
  encyclopedia?: string[]
  relatedWords?: Array<{
    word: string
    meaning: string
  }>
  mnemonic: string
}

function fallbackFlashcardMnemonic(word: string, meaning?: string): string {
  const normalizedWord = normalizeComparableText(word) || word
  const normalizedMeaning = normalizeComparableText(meaning || '')

  return [
    `画面联想：把 "${normalizedWord}" 想成一个正在舞台中央表演的小角色，动作越夸张越容易记住它。`,
    normalizedMeaning
      ? `意思挂钩：一看到这个画面，就立刻联想到“${normalizedMeaning}”。`
      : '意思挂钩：把它和你最近真实遇到的一个场景绑在一起，记忆会更牢。',
    `使用技巧：马上用 "${normalizedWord}" 造一个和自己有关的短句，记忆会从“看过”变成“会用”。`,
  ].join('\n')
}

interface PublicDictionaryDefinition {
  definition?: string
  example?: string
  synonyms?: string[]
}

interface PublicDictionaryMeaning {
  partOfSpeech?: string
  definitions?: PublicDictionaryDefinition[]
  synonyms?: string[]
}

interface PublicDictionaryPhonetic {
  text?: string
}

interface PublicDictionaryEntry {
  word?: string
  phonetic?: string
  phonetics?: PublicDictionaryPhonetic[]
  meanings?: PublicDictionaryMeaning[]
}

/** 每日学习推荐 */
export interface DailyRecommendation {
  greeting: string
  motivationalQuote: string
  quoteTranslation: string
  todayTip: string
}

export interface BatchTranslationResult {
  lines: string[]
  batchCount: number
  requestedCount: number
  apiTranslatedCount: number
  fallbackCount: number
  changedCount: number
  fallbackUsed: boolean
  failureReason: string | null
}

interface RawLongSentenceAnalysis {
  translation?: string
  summary?: string
  segments?: Array<{
    text?: string
    role?: LongSentenceSegment['role']
    note?: string
  }>
  clauses?: Array<{
    label?: string
    text?: string
    function?: string
    simplified?: string
  }>
  grammarPoints?: string[]
  connectors?: Array<{
    text?: string
    function?: string
  }>
  simpleRewrites?: string[]
}

// ===== Moonshot API 调用封装 =====

/**
 * 调用 Moonshot Chat Completions API
 * @param messages - 对话消息列表
 * @param systemPrompt - 可选的系统提示词
 * @returns API 返回的文本内容
 */
async function callMoonshot(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  systemPrompt?: string
): Promise<string | null> {
  return callMoonshotClient({
    messages,
    systemPrompt,
    model: MODEL,
    temperature: 0.7,
    apiKey: API_KEY,
    apiBase: API_BASE,
    logLabel: 'Moonshot API',
  })
}

/**
 * 尝试解析 JSON，清理 markdown 包裹
 */
function parseJSON<T>(raw: string): T | null {
  const stripComments = (input: string) => {
    let result = ''
    let inString = false
    let escaped = false
    let inLineComment = false
    let inBlockComment = false

    for (let index = 0; index < input.length; index += 1) {
      const current = input[index]
      const next = input[index + 1]

      if (inLineComment) {
        if (current === '\n') {
          inLineComment = false
          result += current
        }
        continue
      }

      if (inBlockComment) {
        if (current === '*' && next === '/') {
          inBlockComment = false
          index += 1
        }
        continue
      }

      if (inString) {
        result += current
        if (escaped) {
          escaped = false
        } else if (current === '\\') {
          escaped = true
        } else if (current === '"') {
          inString = false
        }
        continue
      }

      if (current === '"') {
        inString = true
        result += current
        continue
      }

      if (current === '/' && next === '/') {
        inLineComment = true
        index += 1
        continue
      }

      if (current === '/' && next === '*') {
        inBlockComment = true
        index += 1
        continue
      }

      result += current
    }

    return result
  }

  const extractJsonCandidate = (input: string) => {
    const trimmed = input.trim()
    const objectStart = trimmed.indexOf('{')
    const arrayStart = trimmed.indexOf('[')
    const startCandidates = [objectStart, arrayStart].filter(index => index >= 0)
    if (startCandidates.length === 0) return trimmed

    const start = Math.min(...startCandidates)
    const opener = trimmed[start]
    const closer = opener === '{' ? '}' : ']'
    let depth = 0
    let inString = false
    let escaped = false

    for (let index = start; index < trimmed.length; index += 1) {
      const current = trimmed[index]

      if (inString) {
        if (escaped) {
          escaped = false
        } else if (current === '\\') {
          escaped = true
        } else if (current === '"') {
          inString = false
        }
        continue
      }

      if (current === '"') {
        inString = true
        continue
      }

      if (current === opener) depth += 1
      if (current === closer) {
        depth -= 1
        if (depth === 0) {
          return trimmed.slice(start, index + 1)
        }
      }
    }

    return trimmed.slice(start)
  }

  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const normalized = stripComments(extractJsonCandidate(cleaned)).trim()
    return JSON.parse(normalized) as T
  } catch {
    console.warn('JSON 解析失败:', raw.slice(0, 200))
    return null
  }
}

// ===== Fallback 模拟数据 =====

function fallbackTranslate(text: string, targetLang: string): TranslateResult {
  const isToEnglish = targetLang.toLowerCase().includes('en') || targetLang === 'English'

  if (isToEnglish) {
    return {
      translatedText: `[AI offline] Translation of: "${text}"`,
      unfamiliarWords: [
        { word: 'translation', meaning: '翻译', phonetic: '/trænzˈleɪ.ʃən/' },
        { word: 'offline', meaning: '离线的', phonetic: '/ˌɒfˈlaɪn/' },
      ],
    }
  } else {
    return {
      translatedText: `[AI 离线] ${targetLang}翻译：「${text}」`,
      unfamiliarWords: [],
    }
  }
}

function fallbackWordDetail(word: string): WordDetail {
  return {
    word,
    phonetic: '/---/',
    phoneticBr: '/---/',
    phoneticAm: '/---/',
    meaning: '（AI 暂时不可用，请稍后重试）',
    partOfSpeechBlocks: [
      {
        partOfSpeech: 'n./v.',
        meanings: ['（AI 暂时不可用，请稍后重试）'],
      },
    ],
    examples: [
      `The word "${word}" is commonly used in everyday English.`,
      `Can you use "${word}" in a sentence?`,
    ],
    synonyms: ['N/A'],
    phrasePatterns: [],
    encyclopedia: ['当前 AI 服务暂时不可用，百科说明暂未生成。'],
    relatedWords: [],
    mnemonic: '当前 AI 服务暂时不可用，请检查网络或 API 配额。',
  }
}

function normalizeWordDetailLookup(word: string) {
  return normalizeComparableText(String(word || '')).toLowerCase()
}

function isFastEnglishWordLookup(word: string) {
  return /^[a-z][a-z'-]*$/i.test(String(word || '').trim())
}

function buildWordLookupCandidates(word: string) {
  const normalized = normalizeWordDetailLookup(word)
  const candidates = new Set<string>()
  const push = (value: string) => {
    const next = normalizeWordDetailLookup(value)
    if (next && next.length > 1) candidates.add(next)
  }

  push(normalized)

  if (normalized.endsWith('ies') && normalized.length > 4) push(`${normalized.slice(0, -3)}y`)
  if (normalized.endsWith('es') && normalized.length > 4) push(normalized.slice(0, -2))
  if (normalized.endsWith('s') && normalized.length > 3 && !normalized.endsWith('ss')) push(normalized.slice(0, -1))
  if (normalized.endsWith('ing') && normalized.length > 5) {
    push(normalized.slice(0, -3))
    push(`${normalized.slice(0, -3)}e`)
  }
  if (normalized.endsWith('ed') && normalized.length > 4) {
    push(normalized.slice(0, -2))
    push(normalized.slice(0, -1))
    push(`${normalized.slice(0, -2)}e`)
  }

  return Array.from(candidates)
}

function dedupeStrings(values: Array<string | null | undefined>, limit: number) {
  const unique = new Set<string>()
  values.forEach((value) => {
    const normalized = normalizeComparableText(String(value || ''))
    if (!normalized || unique.size >= limit) return
    unique.add(normalized)
  })
  return Array.from(unique)
}

function resolveDeepLProxyBaseUrl() {
  const configuredBase = String(import.meta.env.VITE_DEEPL_PROXY_BASE_URL || '').trim()
  if (configuredBase) return configuredBase.replace(/\/$/, '')

  if (typeof window !== 'undefined') {
    const { origin, protocol, hostname } = window.location
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
    if ((protocol === 'http:' || protocol === 'https:') && !isLocalhost) return origin
  }

  return DEEPL_PROXY_FALLBACK_BASE
}

async function translatePublicDictionaryMeanings(lines: string[]): Promise<string[]> {
  const safeLines = lines.map((line) => normalizeComparableText(String(line || ''))).filter(Boolean)
  if (safeLines.length === 0) return []

  try {
    const response = await fetch(`${resolveDeepLProxyBaseUrl()}/api/deepl/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        texts: safeLines,
        sourceLang: 'English',
        targetLang: '简体中文',
        context: 'These are concise English dictionary definitions for learners. Translate them into concise learner-friendly Simplified Chinese only.',
      }),
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) return safeLines

    const translatedLines = Array.isArray(payload?.lines)
      ? payload.lines.map((line: unknown) => normalizeComparableText(String(line || '')))
      : []

    if (translatedLines.length !== safeLines.length) return safeLines
    return translatedLines.map((line: string, index: number) => line || safeLines[index])
  } catch {
    return safeLines
  }
}

async function buildWordDetailFromPublicDictionary(query: string, entries: PublicDictionaryEntry[]): Promise<WordDetail | null> {
  const first = entries.find(Boolean)
  if (!first) return null

  const phoneticCandidates = [
    first.phonetic,
    ...(first.phonetics || []).map((item) => item?.text).filter(Boolean),
  ]
  const phonetic = dedupeStrings(phoneticCandidates, 2)[0] || ''

  const partOfSpeechBlocks = (first.meanings || [])
    .map((meaning) => ({
      partOfSpeech: normalizeComparableText(meaning.partOfSpeech || '') || '释义',
      meanings: dedupeStrings(
        (meaning.definitions || []).map((definition) => definition.definition),
        4
      ),
    }))
    .filter((block) => block.meanings.length > 0)
    .slice(0, 4)

  const examples = dedupeStrings(
    (first.meanings || []).flatMap((meaning) => (meaning.definitions || []).map((definition) => definition.example)),
    4
  )

  const synonyms = dedupeStrings(
    (first.meanings || []).flatMap((meaning) => [
      ...(meaning.synonyms || []),
      ...(meaning.definitions || []).flatMap((definition) => definition.synonyms || []),
    ]),
    8
  )

  const rawMeaningLines = partOfSpeechBlocks.flatMap((block) => block.meanings)
  const localizedMeaningLines = await translatePublicDictionaryMeanings(rawMeaningLines)
  let localizedCursor = 0
  const localizedPartOfSpeechBlocks = partOfSpeechBlocks.map((block) => ({
    ...block,
    meanings: block.meanings.map((meaning) => localizedMeaningLines[localizedCursor++] || meaning),
  }))

  const summaryMeanings = localizedPartOfSpeechBlocks.flatMap((block) => block.meanings).slice(0, 4)
  const normalizedWord = normalizeComparableText(first.word || query) || query

  return {
    word: normalizedWord,
    phonetic,
    phoneticBr: phonetic,
    phoneticAm: phonetic,
    meaning: summaryMeanings.join('；') || '暂无释义',
    partOfSpeechBlocks: localizedPartOfSpeechBlocks,
    examples,
    synonyms,
    phrasePatterns: [],
    encyclopedia: [],
    relatedWords: synonyms.slice(0, 5).map((word) => ({ word, meaning: '相关近义词' })),
    mnemonic: '已优先使用公共英语词典结果加速展示。',
  }
}

async function fetchPublicDictionaryWordDetail(word: string): Promise<WordDetail | null> {
  const candidates = buildWordLookupCandidates(word)

  for (const candidate of candidates) {
    try {
      const response = await fetch(`${PUBLIC_EN_DICTIONARY_API}/${encodeURIComponent(candidate)}`)
      if (!response.ok) continue

      const payload = await response.json().catch(() => null)
      if (!Array.isArray(payload) || payload.length === 0) continue

      const detail = await buildWordDetailFromPublicDictionary(candidate, payload as PublicDictionaryEntry[])
      if (detail) return detail
    } catch {
      continue
    }
  }

  return null
}

const STATIC_DAILY_QUOTES: Array<{ q: string; t: string }> = [
  { q: '"The limits of my language mean the limits of my world." — Ludwig Wittgenstein', t: '我语言的极限意味着我世界的极限。' },
  { q: '"To have another language is to possess a second soul." — Charlemagne', t: '掌握另一门语言就是拥有第二个灵魂。' },
  { q: '"Learning never exhausts the mind." — Leonardo da Vinci', t: '学习从不会让心智枯竭。' },
  { q: '"Well begun is half done." — Aristotle', t: '好的开始是成功的一半。' },
  { q: '"Knowledge is power." — Francis Bacon', t: '知识就是力量。' },
  { q: '"Practice makes perfect." — Proverb', t: '熟能生巧。' },
  { q: '"Little by little, one travels far." — J.R.R. Tolkien', t: '积少成多，终能远行。' },
  { q: '"Action is the foundational key to all success." — Pablo Picasso', t: '行动是所有成功的根本钥匙。' },
  { q: '"Discipline is the bridge between goals and accomplishment." — Jim Rohn', t: '自律是目标与成就之间的桥梁。' },
  { q: '"Small steps every day." — Proverb', t: '每天一小步，长期一大步。' },
  { q: '"Do what you can, with what you have, where you are." — Theodore Roosevelt', t: '在你所在之处，用你拥有的，做你能做的。' },
  { q: '"If you can dream it, you can do it." — Walt Disney', t: '能想到，就有机会做到。' },
  { q: '"Success is the sum of small efforts repeated day in and day out." — Robert Collier', t: '成功是日复一日小努力的总和。' },
  { q: '"No pain, no gain." — Proverb', t: '不劳无获。' },
  { q: '"Done is better than perfect." — Proverb', t: '完成比完美更重要。' },
  { q: '"Today a reader, tomorrow a leader." — Margaret Fuller', t: '今天阅读，明天引领。' },
  { q: '"He who has a why can bear almost any how." — Friedrich Nietzsche', t: '有目标的人，几乎能承受任何过程。' },
  { q: '"Stay hungry, stay foolish." — Steve Jobs', t: '求知若饥，虚心若愚。' },
  { q: '"Great things are done by a series of small things." — Vincent van Gogh', t: '伟大由一连串小事构成。' },
  { q: '"The secret of getting ahead is getting started." — Mark Twain', t: '领先的秘诀是开始行动。' },
  { q: '"Quality is not an act, it is a habit." — Aristotle', t: '优秀不是一次行为，而是一种习惯。' },
  { q: '"Fall seven times and stand up eight." — Japanese Proverb', t: '跌倒七次，站起来八次。' },
  { q: '"You are what you do, not what you say you will do." — Carl Jung', t: '你是谁，取决于你做了什么，而非你说什么。' },
  { q: '"Believe you can and you are halfway there." — Theodore Roosevelt', t: '相信自己，你已成功一半。' },
  { q: '"Simplicity is the ultimate sophistication." — Leonardo da Vinci', t: '简洁是最高级的复杂。' },
  { q: '"The best time to plant a tree was 20 years ago. The second best time is now." — Proverb', t: '种树最好的时间是二十年前，其次是现在。' },
  { q: '"What gets measured gets improved." — Peter Drucker', t: '可衡量，才可改进。' },
  { q: '"Success is not final, failure is not fatal: it is the courage to continue that counts." — Winston Churchill', t: '成功非终点，失败非终局，重要的是继续前行的勇气。' },
  { q: '"Don’t watch the clock; do what it does. Keep going." — Sam Levenson', t: '别盯着时钟看，像它一样持续前进。' },
  { q: '"A little progress each day adds up to big results." — Proverb', t: '每天一点进步，终会汇成巨大成果。' },
  { q: '"Energy and persistence conquer all things." — Benjamin Franklin', t: '精力与坚持可以征服一切。' },
  { q: '"Learning is a treasure that will follow its owner everywhere." — Chinese Proverb', t: '学问是跟随主人走遍天涯的财富。' },
  { q: '"Never too old to learn." — Proverb', t: '活到老，学到老。' },
  { q: '"Fortune favors the prepared mind." — Louis Pasteur', t: '机会总是眷顾有准备的人。' },
  { q: '"One day or day one. You decide." — Proverb', t: '总有一天，还是就是今天，由你决定。' },
  { q: '"Keep your eyes on the stars and your feet on the ground." — Theodore Roosevelt', t: '仰望星空，脚踏实地。' },
  { q: '"The harder you work, the luckier you get." — Gary Player', t: '越努力，越幸运。' },
  { q: '"Be so good they cannot ignore you." — Steve Martin', t: '把自己做到足够好，让人无法忽视。' },
  { q: '"You miss 100% of the shots you do not take." — Wayne Gretzky', t: '不出手，就没有命中。' },
  { q: '"Doubt kills more dreams than failure ever will." — Suzy Kassem', t: '扼杀梦想最多的不是失败，而是怀疑。' },
  { q: '"Success usually comes to those who are too busy to be looking for it." — Henry David Thoreau', t: '成功常属于那些专注做事而非追逐成功的人。' },
  { q: '"In learning you will teach, and in teaching you will learn." — Phil Collins', t: '学习中你会教人，教学中你会更会学。' },
  { q: '"The beautiful thing about learning is nobody can take it away from you." — B.B. King', t: '学习最美之处在于，没有人能夺走它。' },
  { q: '"It always seems impossible until it is done." — Nelson Mandela', t: '事情在做成之前，总显得不可能。' },
  { q: '"The journey of a thousand miles begins with one step." — Lao Tzu', t: '千里之行，始于足下。' },
  { q: '"Progress, not perfection." — Proverb', t: '追求进步，而非完美。' },
  { q: '"Consistency beats intensity." — Proverb', t: '持续胜过爆发。' },
  { q: '"Focus on the process and the results will come." — Proverb', t: '专注过程，结果自会到来。' },
  { q: '"You do not have to be great to start, but you have to start to be great." — Zig Ziglar', t: '不必很厉害才开始，开始了才会变厉害。' },
  { q: '"One language sets you in a corridor for life. Two languages open every door along the way." — Frank Smith', t: '一种语言让你走在走廊里，两种语言为你打开沿途每一扇门。' },
]

const STATIC_DAILY_TIPS = [
  '先做 10 分钟复习，再学新词。',
  '今天先听后说，输入再输出。',
  '每个新词造 1 句自己的例句。',
  '先攻克 5 个高频词，再加量。',
  '复习旧词优先于盲目加新词。',
  '用 2 分钟回顾昨天错词。',
  '今天多读一句完整英文句子。',
  '听歌时抓 3 个关键词。',
  '学完马上测，记忆更稳。',
  '今晚睡前再看一遍今日词汇。',
]

let lastQuoteIndex = -1
let lastTipIndex = -1

function drawIndex(total: number, last: number): number {
  if (total <= 1) return 0
  let idx = Math.floor(Math.random() * total)
  if (idx === last) idx = (idx + 1) % total
  return idx
}

function normalizeComparableText(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

function hasTranslatableContent(text: string) {
  return /[A-Za-z\u3400-\u9fff]/.test(text)
}

function fallbackDailyRecommendation(): DailyRecommendation {
  const hour = new Date().getHours()
  const greetings = [
    'Good Morning! ☀️',
    'Good Afternoon! 🌤️',
    'Good Evening! 🌙',
  ]
  const timeSlot = hour < 12 ? 0 : hour < 18 ? 1 : 2

  const quoteIdx = drawIndex(STATIC_DAILY_QUOTES.length, lastQuoteIndex)
  const tipIdx = drawIndex(STATIC_DAILY_TIPS.length, lastTipIndex)
  lastQuoteIndex = quoteIdx
  lastTipIndex = tipIdx
  const randomQuote = STATIC_DAILY_QUOTES[quoteIdx]

  return {
    greeting: greetings[timeSlot],
    motivationalQuote: randomQuote.q,
    quoteTranslation: randomQuote.t,
    todayTip: STATIC_DAILY_TIPS[tipIdx],
  }
}

function fallbackChatReply(messages: { role: 'user' | 'assistant'; content: string }[]): string {
  const lastMsg = messages[messages.length - 1]?.content?.toLowerCase() || ''

  if (lastMsg.includes('latte') || lastMsg.includes('coffee') || lastMsg.includes('drink')) {
    return "Great choice! A latte is one of our most popular drinks. Would you like it hot or iced? We also have different sizes — small, medium, and large. 😊\n\n(很好的选择！拿铁是我们最受欢迎的饮品之一。你想要热的还是冰的？我们有小杯、中杯和大杯。)"
  }
  if (lastMsg.includes('menu') || lastMsg.includes('see')) {
    return "Of course! Here's our menu: We have espresso, latte, cappuccino, americano, and mocha. For food, we have sandwiches, croissants, and muffins. What catches your eye? 📋\n\n(当然！这是我们的菜单：我们有浓缩咖啡、拿铁、卡布奇诺、美式咖啡和摩卡。食物有三明治、牛角面包和松饼。有什么吸引你的吗？)"
  }
  if (lastMsg.includes('recommend') || lastMsg.includes('suggest')) {
    return "I'd recommend our signature caramel latte! It's sweet, creamy, and absolutely delicious. If you prefer something lighter, our green tea is also wonderful. ☕\n\n(我推荐我们的招牌焦糖拿铁！甜甜的、奶油味的，非常好喝。如果你喜欢清淡一些的，我们的绿茶也很棒。)"
  }
  if (lastMsg.includes('how much') || lastMsg.includes('price') || lastMsg.includes('pay')) {
    return "A regular latte is $4.50. Would you like to add any extra shots or flavors? That would be an additional $0.50 each. Will you be paying by cash or card? 💳\n\n(一杯普通拿铁是4.50美元。你想加额外的浓缩或调味吗？每样加0.50美元。你用现金还是刷卡？)"
  }
  if (lastMsg.includes('thank') || lastMsg.includes('bye')) {
    return "You're welcome! Enjoy your drink and have a wonderful day! See you next time! 👋☕\n\n(不客气！享用你的饮品，祝你有美好的一天！下次再见！)"
  }

  return "Sure! Is there anything specific you'd like to order today? We have a wide selection of coffee, tea, and pastries. Feel free to ask me anything! 😊\n\n(好的！你今天想点什么特别的吗？我们有各种咖啡、茶和糕点。随时问我！)"
}

function fallbackClassify(words: string[]): Record<string, string[]> {
  const categories: Record<string, string[]> = {
    '日常对话': [],
    '商务办公': [],
    '学术研究': [],
    '旅行出行': [],
    '医疗健康': [],
  }

  const businessWords = ['negotiate', 'deadline', 'revenue', 'fluctuate', 'accommodate']
  const travelWords = ['itinerary', 'boarding']
  const academicWords = ['phenomenon', 'comprehensive', 'elaborate', 'sustainable', 'curriculum', 'dissertation']
  const medicalWords = ['prescription']

  words.forEach(w => {
    const lower = w.toLowerCase()
    if (businessWords.includes(lower)) categories['商务办公'].push(w)
    if (travelWords.includes(lower)) categories['旅行出行'].push(w)
    if (academicWords.includes(lower)) categories['学术研究'].push(w)
    if (medicalWords.includes(lower)) categories['医疗健康'].push(w)
    categories['日常对话'].push(w)
  })

  return Object.fromEntries(
    Object.entries(categories).filter(([, v]) => v.length > 0)
  )
}

// ===== AI 功能函数（带自动降级）=====

/**
 * 翻译文本 + 自动识别陌生词汇
 */
export async function translateText(
  text: string,
  sourceLang: string = '中文',
  targetLang: string = 'English'
): Promise<TranslateResult> {
  const involvesEnglish = sourceLang.toLowerCase().includes('en')
    || targetLang.toLowerCase().includes('en')
    || sourceLang === 'English'
    || targetLang === 'English'

  const taskBlock = involvesEnglish
    ? `1. 将以下${sourceLang}文本翻译成${targetLang}
2. 如果文本中包含英语内容，请找出 B1 及以上难度的英语词汇（对中国英语学习者来说可能陌生的词），给出中文释义和音标`
    : `1. 将以下${sourceLang}文本翻译成${targetLang}
2. unfamiliarWords 返回空数组`

  const prompt = `你是一个英语学习助手。请完成以下任务：

${taskBlock}

输入文本：
"${text}"

请严格按以下 JSON 格式返回（不要包含 markdown 标记）：
{
  "translatedText": "翻译后的完整文本",
  "unfamiliarWords": [
    {"word": "单词", "meaning": "中文释义", "phonetic": "音标"}
  ]
}

注意：
- unfamiliarWords 最多返回 5 个最值得学习的词
- 如果原文是英文翻译成中文，也要从原文中提取陌生词汇
- 严禁返回专有名词、人名、地名、品牌名、机构名、缩写、网络用语、俚语、拼写错误、自造词或虚构词
- 只返回适合进入英语学习词库的普通英文单词，统一使用词典原形/小写
- 一定要返回合法的 JSON`

  const raw = await callMoonshot([{ role: 'user', content: prompt }])
  if (raw) {
    const parsed = parseJSON<TranslateResult>(raw)
    if (parsed) {
      return {
        ...parsed,
        unfamiliarWords: await filterDictionaryWhitelistedWords(parsed.unfamiliarWords || [], 5),
      }
    }
  }

  return fallbackTranslate(text, targetLang)
}

/**
 * 获取单词详情
 */
export async function getWordDetail(word: string): Promise<WordDetail> {
  const trimmedWord = normalizeComparableText(word)
  if (!trimmedWord) return fallbackWordDetail(word)

  const cacheKey = normalizeWordDetailLookup(trimmedWord)
  const cached = wordDetailCache.get(cacheKey)
  if (cached) return cached

  const inflight = wordDetailInflight.get(cacheKey)
  if (inflight) return inflight

  const task = (async () => {
    if (isFastEnglishWordLookup(trimmedWord)) {
      const publicDetail = await fetchPublicDictionaryWordDetail(trimmedWord)
      if (publicDetail) {
        wordDetailCache.set(cacheKey, publicDetail)
        return publicDetail
      }
    }

    const prompt = `你是一个英语词汇学习助手。请为以下单词提供详细的学习信息：

单词：${trimmedWord}

请严格按以下 JSON 格式返回（不要包含 markdown 标记）：
{
  "word": "${trimmedWord}",
  "phonetic": "音标",
  "phoneticBr": "英式音标（没有就复用 phonetic）",
  "phoneticAm": "美式音标（没有就复用 phonetic）",
  "meaning": "中文释义（多个义项用分号分隔）",
  "partOfSpeechBlocks": [
    {
      "partOfSpeech": "det.",
      "meanings": ["义项1", "义项2"]
    }
  ],
  "examples": [
    "含有该单词的英文例句1",
    "含有该单词的英文例句2"
  ],
  "synonyms": ["同义词1", "同义词2", "同义词3"],
  "phrasePatterns": [
    { "phrase": "固定搭配1", "meaning": "中文解释" },
    { "phrase": "固定搭配2", "meaning": "中文解释" }
  ],
  "encyclopedia": [
    "该词的核心用法说明 1",
    "该词的常见语境说明 2"
  ],
  "relatedWords": [
    { "word": "相关词1", "meaning": "中文释义" },
    { "word": "相关词2", "meaning": "中文释义" }
  ],
  "mnemonic": "一个帮助记忆该单词的技巧或联想记忆法（中文）"
}

注意：
- 例句要实用、贴近日常
- partOfSpeechBlocks 尽量按真实词性拆开，不要把所有义项混成一行
- phrasePatterns 返回 2-5 个高频搭配或短语
- encyclopedia 返回 2-4 条更像词典备注/百科说明的短段落
- relatedWords 返回 3-5 个相关词，便于继续查词
- 记忆技巧要有趣好记
- 返回合法 JSON`

    const raw = await callMoonshot([{ role: 'user', content: prompt }])
    if (raw) {
      const parsed = parseJSON<WordDetail>(raw)
      if (parsed) {
        wordDetailCache.set(cacheKey, parsed)
        return parsed
      }
    }

    return fallbackWordDetail(trimmedWord)
  })()

  wordDetailInflight.set(cacheKey, task)
  try {
    return await task
  } finally {
    wordDetailInflight.delete(cacheKey)
  }
}

export async function getFlashcardMnemonic(word: string, meaning?: string): Promise<string> {
  const trimmedWord = normalizeComparableText(word)
  if (!trimmedWord) return fallbackFlashcardMnemonic(word, meaning)

  const cacheKey = `${normalizeWordDetailLookup(trimmedWord)}::${normalizeComparableText(meaning || '')}`
  const cached = flashcardMnemonicCache.get(cacheKey)
  if (cached) return cached

  const inflight = flashcardMnemonicInflight.get(cacheKey)
  if (inflight) return inflight

  const task = (async () => {
    const detail = await getWordDetail(trimmedWord)
    const existingMnemonic = normalizeComparableText(detail.mnemonic)
    const looksLikePlaceholder = !existingMnemonic
      || existingMnemonic.includes('AI 服务暂时不可用')
      || existingMnemonic.includes('公共英语词典结果加速展示')

    if (!looksLikePlaceholder) {
      flashcardMnemonicCache.set(cacheKey, detail.mnemonic)
      return detail.mnemonic
    }

    const prompt = `你是一个擅长“词汇卡片记忆法”的英语老师。请为这个英文单词生成一段适合卡片学习场景的中文助记提示。

单词：${trimmedWord}
参考释义：${normalizeComparableText(meaning || detail.meaning || '暂无释义')}

要求：
1. 一定要生动、有画面感，像在脑海里放一个小短片
2. 尽量结合发音、拼写拆分、谐音、词根、动作场景中的一种或两种
3. 不要写成词典解释，不要空泛鼓励，不要说“请自己造句”
4. 长度控制在 80-140 字
5. 直接输出中文正文，不要 markdown，不要标题`

    const raw = await callMoonshot([{ role: 'user', content: prompt }])
    const mnemonic = normalizeComparableText(raw || '')
    const finalMnemonic = mnemonic || fallbackFlashcardMnemonic(trimmedWord, meaning || detail.meaning)
    flashcardMnemonicCache.set(cacheKey, finalMnemonic)
    return finalMnemonic
  })()

  flashcardMnemonicInflight.set(cacheKey, task)
  try {
    return await task
  } finally {
    flashcardMnemonicInflight.delete(cacheKey)
  }
}

/**
 * 生成每日学习推荐
 */
export async function getDailyRecommendation(): Promise<DailyRecommendation> {
  // 使用本地静态抽签池（50 条语录）确保“刷新”稳定可用、不依赖外部接口。
  return fallbackDailyRecommendation()
}

/**
 * AI 对话（口语练习 & AI 速记）
 */
export async function chat(
  messages: { role: 'user' | 'model'; text: string }[]
): Promise<string> {
  // 转换格式：'model' → 'assistant'，'text' → 'content'
  const moonshotMessages = messages.map(m => ({
    role: (m.role === 'model' ? 'assistant' : 'user') as 'user' | 'assistant',
    content: m.text,
  }))

  const systemPrompt = '你是 Linswift 英语学习APP的AI助手"小林"。你帮助用户学习英语，回答时尽量使用简单英语，并附上中文解释。语气友善、鼓励。'

  const raw = await callMoonshot(moonshotMessages, systemPrompt)
  if (raw) return raw

  return fallbackChatReply(moonshotMessages)
}

/**
 * AI 分析文本中的陌生词汇
 * 用于阅读准备页，从 PDF 提取的文本中识别难词
 */
export async function analyzeUnfamiliarWords(
  text: string,
  maxWords: number = 15
): Promise<UnfamiliarWord[]> {
  // 截取前 2000 字符用于分析（避免 token 过长）
  const snippet = text.slice(0, 2000)

  const prompt = `你是一个英语学习助手。请分析以下英文文本，找出其中对中国英语学习者（B1-B2 水平）最可能陌生的词汇。

文本：
"${snippet}"

请严格按以下 JSON 格式返回（不要包含 markdown 标记）：
[
  {"word": "单词", "meaning": "中文释义", "phonetic": "音标"}
]

注意：
- 最多返回 ${maxWords} 个最值得学习的词
- 不要包含太简单的词（如 the, is, have 等）
- 严禁包含专有名词、人名、地名、缩写、网络用语、品牌名、机构名、拼写错误、自造词或虚构词
- 只保留适合普通英语学习者积累的常见/正规英文单词，统一用原形和小写
- 每个词都要有音标和中文释义
- 返回合法的 JSON 数组`

  const raw = await callMoonshot([{ role: 'user', content: prompt }])
  if (raw) {
    const parsed = parseJSON<UnfamiliarWord[]>(raw)
    if (parsed && Array.isArray(parsed)) {
      return filterDictionaryWhitelistedWords(parsed, maxWords)
    }
  }

  // Fallback：简单提取长单词作为"陌生词"
  const words = snippet
    .split(/\s+/)
    .filter(w => w.length > 7)
    .map(w => w.replace(/[^a-zA-Z]/g, ''))
    .filter(w => w.length > 0)
  const unique = [...new Set(words)].slice(0, maxWords)
  return filterDictionaryWhitelistedWords(unique.map(w => ({
    word: w,
    meaning: '（AI 离线，暂无释义）',
    phonetic: '',
  })), maxWords)
}

/**
 * 批量翻译文本行（用于 PDF 阅读器的页面翻译）
 *
 * 将编号的文本行发送给 AI，返回对应编号的翻译。
 * 如果 API 不可用，返回原始文本。
 *
 * @param lines   - 需要翻译的文本行数组
 * @param targetLang - 目标语言，默认 '中文'
 * @returns 翻译后的文本行数组（与输入一一对应）
 */
export async function translateBatch(
  lines: string[],
  targetLang: string = '中文'
): Promise<BatchTranslationResult> {
  if (lines.length === 0) {
    return {
      lines: [],
      batchCount: 0,
      requestedCount: 0,
      apiTranslatedCount: 0,
      fallbackCount: 0,
      changedCount: 0,
      fallbackUsed: false,
      failureReason: null,
    }
  }

  // 过滤出有实际内容的行（纯数字/标点不翻译）
  const indexedLines = lines.map((l, i) => ({ idx: i, text: l.trim() }))
  const toTranslate = indexedLines.filter(
    l => l.text.length > 0 && hasTranslatableContent(l.text)
  )

  if (toTranslate.length === 0) {
    return {
      lines: [...lines],
      batchCount: 0,
      requestedCount: 0,
      apiTranslatedCount: 0,
      fallbackCount: 0,
      changedCount: 0,
      fallbackUsed: false,
      failureReason: null,
    }
  }

  const result = [...lines]
  const BATCH_SIZE = 24
  let apiTranslatedCount = 0
  let fallbackCount = 0
  let fallbackUsed = false
  let failureReason: string | null = null

  for (let start = 0; start < toTranslate.length; start += BATCH_SIZE) {
    const batch = toTranslate.slice(start, start + BATCH_SIZE)
    const numbered = batch.map(l => `[${l.idx}] ${l.text}`).join('\n')

    const prompt = `你是专业翻译。将以下编号英文文本逐行翻译为${targetLang}。
规则：
- 严格保持原编号，每行格式：[编号] 翻译内容
- 纯数字、表格数据、专有名词可保留原文
- 不要添加解释或额外内容
- 翻译要自然流畅
- 如果目标语言是中文，返回简体中文
- 不要返回拼音、注释、括号补充、项目符号或 markdown
- 不要漏掉任何编号
- 每个编号只返回一行

${numbered}`

    const raw = await callMoonshot([{ role: 'user', content: prompt }])
    const parsedIndexes = new Set<number>()

    if (raw) {
      const lineRegex = /\[(\d+)\]\s*([^\n]+)/g
      let match
      while ((match = lineRegex.exec(raw)) !== null) {
        const idx = parseInt(match[1])
        const text = match[2].trim()
        if (idx >= 0 && idx < result.length && text) {
          result[idx] = text
          parsedIndexes.add(idx)
        }
      }
    }

    const coverage = parsedIndexes.size / batch.length
    if (!raw || coverage < 0.6) {
      fallbackUsed = true
      failureReason ||= !raw
        ? (API_KEY ? 'AI 翻译请求失败' : 'AI 翻译服务未配置')
        : 'AI 翻译结果不完整'

      for (const item of batch) {
        if (parsedIndexes.has(item.idx)) continue
        result[item.idx] = item.text
        fallbackCount += 1
      }
    }

    apiTranslatedCount += parsedIndexes.size
  }

  const changedCount = toTranslate.reduce((count, item) => (
    normalizeComparableText(result[item.idx]) !== normalizeComparableText(lines[item.idx])
      ? count + 1
      : count
  ), 0)

  return {
    lines: result,
    batchCount: Math.ceil(toTranslate.length / BATCH_SIZE),
    requestedCount: toTranslate.length,
    apiTranslatedCount,
    fallbackCount,
    changedCount,
    fallbackUsed,
    failureReason,
  }
}

/**
 * AI 词汇分类
 */
export async function classifyVocabulary(
  words: string[]
): Promise<Record<string, string[]>> {
  const prompt = `你是一个英语词汇分类助手。请将以下单词按使用场景分类：

单词列表：${words.join(', ')}

请按以下 JSON 格式返回分类结果（不要包含 markdown 标记）：
{
  "日常对话": ["word1", "word2"],
  "商务办公": ["word3"],
  "学术研究": ["word4", "word5"],
  "旅行出行": ["word6"]
}

注意：一个单词可以出现在多个场景中；场景名称用中文；至少分 3-6 个场景；返回合法 JSON`

  const raw = await callMoonshot([{ role: 'user', content: prompt }])
  if (raw) {
    const parsed = parseJSON<Record<string, string[]>>(raw)
    if (parsed) return parsed
  }

  return fallbackClassify(words)
}

function normalizeLongSentenceAnalysis(
  sentence: string,
  raw: RawLongSentenceAnalysis | null
): LongSentenceAnalysis | null {
  if (!raw) return null

  const fallback = buildFallbackLongSentenceAnalysis(sentence)
  let segments = Array.isArray(raw.segments)
    ? raw.segments
      .filter((item) => item?.text && item?.role)
      .map((item) => ({
        text: item.text!.replace(/\s+/g, ' '),
        role: isLongSentenceRole(item.role) ? item.role : 'modifier',
        note: item.note?.trim() || 'AI 标注片段',
      }))
    : fallback.segments

  if (segments.length > 0) {
    const sentenceLower = sentence.toLowerCase()
    let cursor = 0
    segments = segments.map((segment) => {
      const normalizedText = segment.text.trim()
      const normalizedLower = normalizedText.toLowerCase()
      const start = normalizedLower ? sentenceLower.indexOf(normalizedLower, cursor) : -1
      if (start === -1) return segment

      const end = start + normalizedText.length
      const prefix = sentence.slice(cursor, start)
      cursor = end
      return {
        ...segment,
        text: `${prefix}${sentence.slice(start, end)}`,
      }
    })

    if (cursor < sentence.length) {
      segments[segments.length - 1] = {
        ...segments[segments.length - 1],
        text: `${segments[segments.length - 1].text}${sentence.slice(cursor)}`,
      }
    }
  }

  if (segments.length === 0) return null

  const connectors: LongSentenceConnector[] = Array.isArray(raw.connectors)
    ? raw.connectors
      .filter((item) => item?.text && item?.function)
      .map((item) => ({ text: item.text!.trim(), function: item.function!.trim() }))
    : fallback.connectors

  return {
    sentence,
    translation: raw.translation?.trim() || fallback.translation,
    summary: raw.summary?.trim() || fallback.summary,
    segments,
    clauses: Array.isArray(raw.clauses) && raw.clauses.length > 0
      ? raw.clauses
        .filter((item) => item?.text)
        .map((item, index) => ({
          label: item.label?.trim() || `意群 ${index + 1}`,
          text: item.text!.trim(),
          function: item.function?.trim() || '补充结构说明',
          simplified: item.simplified?.trim() || item.text!.trim(),
        }))
      : fallback.clauses,
    grammarPoints: Array.isArray(raw.grammarPoints) && raw.grammarPoints.length > 0
      ? raw.grammarPoints.filter(Boolean).map((item) => item.trim())
      : fallback.grammarPoints,
    connectors,
    simpleRewrites: Array.isArray(raw.simpleRewrites) && raw.simpleRewrites.length > 0
      ? raw.simpleRewrites.filter(Boolean).map((item) => item.trim())
      : fallback.simpleRewrites,
  }
}

export async function analyzeLongSentence(sentence: string): Promise<LongSentenceAnalysis> {
  const normalizedSentence = sentence.replace(/\s+/g, ' ').trim()
  if (!normalizedSentence) {
    return buildFallbackLongSentenceAnalysis('请输入一句完整的英文长句。')
  }

  const prompt = `你是一个英语长难句分析老师。请对这句英文做精细语法拆分，输出严格 JSON，不要使用 markdown：

句子：
"${normalizedSentence}"

输出格式：
{
  "translation": "自然中文翻译",
  "summary": "一句中文总结这句的骨架",
  "segments": [
    {"text": "原句中的连续片段，保持原顺序", "role": "subject|verb|object|connector|modifier|adverbial|complement|relative|condition|result", "note": "中文说明"}
  ],
  "clauses": [
    {"label": "如 主句/让步从句/定语从句", "text": "该分句原文", "function": "中文功能说明", "simplified": "把这块改写成更短的英文短句"}
  ],
  "grammarPoints": ["3到5条中文语法提醒"],
  "connectors": [
    {"text": "连接词或触发结构", "function": "逻辑功能"}
  ],
  "simpleRewrites": ["2到4个更短的英文短句"]
}

要求：
1. segments 必须按原句顺序覆盖整句，不要乱序。
2. 尽量细分出主语、谓语、宾语、连接词、修饰语。
3. 如果有从句，要在 clauses 里明确标出功能。
4. 返回合法 JSON。`

  const raw = await callMoonshot([{ role: 'user', content: prompt }])
  if (raw) {
    const parsed = parseJSON<RawLongSentenceAnalysis>(raw)
    const normalized = normalizeLongSentenceAnalysis(normalizedSentence, parsed)
    if (normalized) return normalized
  }

  return buildFallbackLongSentenceAnalysis(normalizedSentence)
}
