export type LongSentenceRole =
  | 'subject'
  | 'verb'
  | 'object'
  | 'connector'
  | 'modifier'
  | 'adverbial'
  | 'complement'
  | 'relative'
  | 'condition'
  | 'result'

export const LONG_SENTENCE_ROLE_VALUES: LongSentenceRole[] = [
  'subject',
  'verb',
  'object',
  'connector',
  'modifier',
  'adverbial',
  'complement',
  'relative',
  'condition',
  'result',
]

export interface LongSentenceSegment {
  text: string
  role: LongSentenceRole
  note: string
}

export interface LongSentenceClause {
  label: string
  text: string
  function: string
  simplified: string
}

export interface LongSentenceConnector {
  text: string
  function: string
}

export interface LongSentenceAnalysis {
  sentence: string
  translation: string
  summary: string
  segments: LongSentenceSegment[]
  clauses: LongSentenceClause[]
  grammarPoints: string[]
  connectors: LongSentenceConnector[]
  simpleRewrites: string[]
}

export interface LongSentenceReadingItem {
  id: string
  title: string
  category: string
  difficulty: '中阶' | '进阶' | '高阶'
  focus: string
  sentence: string
  analysis: LongSentenceAnalysis
}

export interface LongSentenceWritingPrompt {
  id: string
  title: string
  category: string
  prompt: string
  targetPatterns: string[]
  connectorHints: string[]
  guidance: string[]
  sampleAnswer: string
}

export interface SavedLongSentenceItem {
  id: string
  source: 'reading' | 'ai'
  sourceId?: string
  title: string
  category: string
  sentence: string
  savedAt: string
  analysis: LongSentenceAnalysis
}

export const LONG_SENTENCE_COLLECTION_KEY = 'linswift-long-sentence-collection-v1'

export const LONG_SENTENCE_ROLE_META: Record<
  LongSentenceRole,
  { label: string; color: string; soft: string }
> = {
  subject: { label: '主语', color: '#2563EB', soft: 'rgba(37, 99, 235, 0.14)' },
  verb: { label: '谓语', color: '#DC2626', soft: 'rgba(220, 38, 38, 0.14)' },
  object: { label: '宾语', color: '#16A34A', soft: 'rgba(22, 163, 74, 0.14)' },
  connector: { label: '连接词', color: '#7C3AED', soft: 'rgba(124, 58, 237, 0.14)' },
  modifier: { label: '修饰语', color: '#D97706', soft: 'rgba(217, 119, 6, 0.14)' },
  adverbial: { label: '状语', color: '#0891B2', soft: 'rgba(8, 145, 178, 0.14)' },
  complement: { label: '补语', color: '#EA580C', soft: 'rgba(234, 88, 12, 0.14)' },
  relative: { label: '从句', color: '#9333EA', soft: 'rgba(147, 51, 234, 0.14)' },
  condition: { label: '条件', color: '#0F766E', soft: 'rgba(15, 118, 110, 0.14)' },
  result: { label: '结果', color: '#BE185D', soft: 'rgba(190, 24, 93, 0.14)' },
}

export function isLongSentenceRole(value: unknown): value is LongSentenceRole {
  return typeof value === 'string' && LONG_SENTENCE_ROLE_VALUES.includes(value as LongSentenceRole)
}

const CONNECTOR_HINTS: Array<{ text: string; function: string }> = [
  { text: 'although', function: '让步' },
  { text: 'though', function: '让步' },
  { text: 'because', function: '原因' },
  { text: 'since', function: '原因/时间起点' },
  { text: 'if', function: '条件' },
  { text: 'unless', function: '否定条件' },
  { text: 'when', function: '时间' },
  { text: 'while', function: '对比/时间' },
  { text: 'after', function: '时间先后' },
  { text: 'before', function: '时间先后' },
  { text: 'so that', function: '目的/结果' },
  { text: 'in order that', function: '目的' },
  { text: 'which', function: '非限制性定语从句' },
  { text: 'who', function: '定语从句' },
  { text: 'that', function: '名词性从句/定语从句' },
  { text: 'not only', function: '并列强调' },
  { text: 'but also', function: '并列强调' },
  { text: 'as soon as', function: '时间' },
  { text: 'so', function: '结果' },
  { text: 'therefore', function: '结果' },
]

const COMMON_VERBS = new Set([
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'done',
  'have', 'has', 'had',
  'go', 'goes', 'went', 'gone',
  'make', 'makes', 'made',
  'take', 'takes', 'took', 'taken',
  'say', 'says', 'said',
  'explain', 'explained', 'explains',
  'delay', 'delayed', 'delays',
  'notice', 'noticed', 'notices',
  'review', 'reviewed', 'reviews',
  'choose', 'chose', 'chosen',
  'store', 'stored', 'stores',
  'finish', 'finished', 'finishes',
  'update', 'updated', 'updates',
  'need', 'needed', 'needs',
  'arrive', 'arrived', 'arrives',
  'want', 'wanted', 'wants',
  'matter', 'matters', 'mattered',
  'look', 'looked', 'looks',
  'make', 'made', 'makes',
  'compare', 'compared', 'compares',
  'choose', 'chose', 'chooses',
  'affect', 'affected', 'affects',
  'remain', 'remained', 'remains',
  'show', 'showed', 'shows',
  'become', 'became', 'becomes',
  'improve', 'improved', 'improves',
  'allow', 'allowed', 'allows',
  'help', 'helped', 'helps',
  'complain', 'complained', 'complains',
  'announce', 'announced', 'announces',
  'add', 'added', 'adds',
  'contain', 'contained', 'contains',
  'complete', 'completed', 'completes',
  'teach', 'taught', 'teaches',
  'discover', 'discovered', 'discovers',
  'reduce', 'reduced', 'reduces',
  'increase', 'increased', 'increases',
  'encourage', 'encouraged', 'encourages',
  'support', 'supported', 'supports',
  'suggest', 'suggested', 'suggests',
])

function splitIntoClauses(sentence: string) {
  return sentence
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function findConnectors(sentence: string): LongSentenceConnector[] {
  const lower = sentence.toLowerCase()
  return CONNECTOR_HINTS.filter((item) => lower.includes(item.text))
}

function detectVerbIndex(tokens: string[]) {
  return tokens.findIndex((token) => {
    const lower = token.toLowerCase().replace(/[^a-z]/g, '')
    if (!lower) return false
    return (
      COMMON_VERBS.has(lower)
      || /(ed|ing)$/.test(lower)
      || ['will', 'would', 'can', 'could', 'should', 'may', 'might', 'must'].includes(lower)
    )
  })
}

function heuristicSegmentsFromClause(clause: string): LongSentenceSegment[] {
  const trimmed = clause.trim()
  if (!trimmed) return []

  const matchedConnector = CONNECTOR_HINTS.find((item) => trimmed.toLowerCase().startsWith(item.text))
  let workingClause = trimmed
  const segments: LongSentenceSegment[] = []

  if (matchedConnector) {
    const connectorText = trimmed.slice(0, matchedConnector.text.length)
    segments.push({
      text: `${connectorText} `,
      role: matchedConnector.function.includes('条件') ? 'condition' : 'connector',
      note: `${matchedConnector.text} 引导${matchedConnector.function}结构`,
    })
    workingClause = trimmed.slice(matchedConnector.text.length).trim()
  }

  const tokens = workingClause.split(/\s+/)
  const verbIndex = detectVerbIndex(tokens)

  if (verbIndex <= 0) {
    segments.push({
      text: workingClause,
      role: matchedConnector?.function === '结果' ? 'result' : 'modifier',
      note: '离线模式下将该片段整体视为补充信息',
    })
    return segments
  }

  const subject = tokens.slice(0, verbIndex).join(' ')
  const verb = tokens[verbIndex]
  const rest = tokens.slice(verbIndex + 1).join(' ')

  segments.push({ text: `${subject} `, role: 'subject', note: '句子的主语或主语核心部分' })
  segments.push({ text: `${verb} `, role: 'verb', note: '句子的核心谓语' })
  if (rest) {
    segments.push({
      text: rest,
      role: matchedConnector?.function === '结果' ? 'result' : 'object',
      note: '谓语后的宾语、表语或补充说明',
    })
  }
  return segments
}

export function buildFallbackLongSentenceAnalysis(sentence: string): LongSentenceAnalysis {
  const cleaned = sentence.replace(/\s+/g, ' ').trim()
  const clauses = splitIntoClauses(cleaned)
  const connectors = findConnectors(cleaned)
  const segments = clauses.flatMap((clause, index) => {
    const clauseSegments = heuristicSegmentsFromClause(clause)
    if (index < clauses.length - 1 && clauseSegments.length > 0) {
      clauseSegments[clauseSegments.length - 1] = {
        ...clauseSegments[clauseSegments.length - 1],
        text: `${clauseSegments[clauseSegments.length - 1].text}, `,
      }
    }
    return clauseSegments
  })

  return {
    sentence: cleaned,
    translation: '离线模式下未获取 AI 精准翻译，请结合下方拆分先读结构。',
    summary: '已按连接词和逗号先拆出主干，适合先看句子骨架，再逐块补细节。',
    segments: segments.length > 0 ? segments : [{ text: cleaned, role: 'modifier', note: '离线模式下未能稳定拆分，先整体阅读。' }],
    clauses: clauses.map((clause, index) => ({
      label: `片段 ${index + 1}`,
      text: clause,
      function: index === 0 ? '通常先读第一块，找主语和谓语。' : '继续补充原因、条件、结果或修饰信息。',
      simplified: clause,
    })),
    grammarPoints: [
      '先定位连接词，再找每一块里的主语和谓语。',
      '离线结果只提供结构草图；如已配置 AI，可再次分析获得更细颗粒度讲解。',
      '优先把长句改写成 2 到 3 个短句，再反推原句结构。',
    ],
    connectors,
    simpleRewrites: clauses.length > 1 ? clauses : [cleaned],
  }
}
