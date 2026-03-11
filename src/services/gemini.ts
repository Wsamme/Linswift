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

// ===== Moonshot API 配置 =====
const API_KEY = import.meta.env.VITE_MOONSHOT_API_KEY as string
const API_BASE = 'https://api.moonshot.cn/v1'
const MODEL = 'moonshot-v1-8k' // 可选: moonshot-v1-8k, moonshot-v1-32k, moonshot-v1-128k

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
  meaning: string
  examples: string[]
  synonyms: string[]
  mnemonic: string
}

/** 每日学习推荐 */
export interface DailyRecommendation {
  greeting: string
  motivationalQuote: string
  quoteTranslation: string
  todayTip: string
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
  if (!API_KEY) return null

  try {
    const allMessages = systemPrompt
      ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
      : messages

    const response = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: allMessages,
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Moonshot API 错误:', response.status, errorText)
      return null
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content ?? null
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Moonshot API 调用失败:', msg)
    return null
  }
}

/**
 * 尝试解析 JSON，清理 markdown 包裹
 */
function parseJSON<T>(raw: string): T | null {
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(cleaned) as T
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
      translatedText: `[AI 离线] 原文翻译：「${text}」`,
      unfamiliarWords: [],
    }
  }
}

function fallbackWordDetail(word: string): WordDetail {
  return {
    word,
    phonetic: '/---/',
    meaning: '（AI 暂时不可用，请稍后重试）',
    examples: [
      `The word "${word}" is commonly used in everyday English.`,
      `Can you use "${word}" in a sentence?`,
    ],
    synonyms: ['N/A'],
    mnemonic: '当前 AI 服务暂时不可用，请检查网络或 API 配额。',
  }
}

function fallbackDailyRecommendation(): DailyRecommendation {
  const hour = new Date().getHours()
  const greetings = [
    { greeting: 'Good Morning! ☀️', tip: '早起学习效率最高，先来 10 分钟词汇复习吧！' },
    { greeting: 'Good Afternoon! 🌤️', tip: '午后来一段英语听力，提神又学习！' },
    { greeting: 'Good Evening! 🌙', tip: '睡前复习一下今天学的单词吧！' },
  ]
  const timeSlot = hour < 12 ? 0 : hour < 18 ? 1 : 2

  const quotes = [
    { q: '"The limits of my language mean the limits of my world." — Ludwig Wittgenstein', t: '我语言的极限意味着我世界的极限。' },
    { q: '"One language sets you in a corridor for life. Two languages open every door along the way." — Frank Smith', t: '一种语言让你走在走廊里，两种语言为你打开沿途每一扇门。' },
    { q: '"To have another language is to possess a second soul." — Charlemagne', t: '掌握另一门语言就是拥有第二个灵魂。' },
    { q: '"Learning is a treasure that will follow its owner everywhere." — Chinese Proverb', t: '学问是跟随主人走遍天涯的财富。' },
    { q: '"The best time to plant a tree was 20 years ago. The second best time is now." — Chinese Proverb', t: '种一棵树最好的时间是二十年前，其次是现在。' },
  ]
  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)]

  return {
    greeting: greetings[timeSlot].greeting,
    motivationalQuote: randomQuote.q,
    quoteTranslation: randomQuote.t,
    todayTip: greetings[timeSlot].tip,
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
  const prompt = `你是一个英语学习助手。请完成以下任务：

1. 将以下${sourceLang}文本翻译成${targetLang}
2. 从翻译结果中找出 B1 及以上难度的英语词汇（对中国英语学习者来说可能陌生的词），给出中文释义和音标

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
- 一定要返回合法的 JSON`

  const raw = await callMoonshot([{ role: 'user', content: prompt }])
  if (raw) {
    const parsed = parseJSON<TranslateResult>(raw)
    if (parsed) return parsed
  }

  return fallbackTranslate(text, targetLang)
}

/**
 * 获取单词详情
 */
export async function getWordDetail(word: string): Promise<WordDetail> {
  const prompt = `你是一个英语词汇学习助手。请为以下单词提供详细的学习信息：

单词：${word}

请严格按以下 JSON 格式返回（不要包含 markdown 标记）：
{
  "word": "${word}",
  "phonetic": "音标",
  "meaning": "中文释义（多个义项用分号分隔）",
  "examples": [
    "含有该单词的英文例句1",
    "含有该单词的英文例句2"
  ],
  "synonyms": ["同义词1", "同义词2", "同义词3"],
  "mnemonic": "一个帮助记忆该单词的技巧或联想记忆法（中文）"
}

注意：例句要实用、贴近日常；记忆技巧要有趣好记；返回合法 JSON`

  const raw = await callMoonshot([{ role: 'user', content: prompt }])
  if (raw) {
    const parsed = parseJSON<WordDetail>(raw)
    if (parsed) return parsed
  }

  return fallbackWordDetail(word)
}

/**
 * 生成每日学习推荐
 */
export async function getDailyRecommendation(): Promise<DailyRecommendation> {
  const hour = new Date().getHours()
  const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'

  const prompt = `你是 Linswift 英语学习APP的AI助手。现在是${timeOfDay}，请生成今日的学习激励内容。

请严格按以下 JSON 格式返回（不要包含 markdown 标记）：
{
  "greeting": "一个简短的英文问候语（3-8个单词，包含emoji）",
  "motivationalQuote": "一句关于学习或成长的英文名言（真实名言，注明作者）",
  "quoteTranslation": "该名言的中文翻译",
  "todayTip": "一个简短的英语学习小贴士（中文，20字以内）"
}

注意：greeting 要根据时间段变化；名言不要太长；返回合法 JSON`

  const raw = await callMoonshot([{ role: 'user', content: prompt }])
  if (raw) {
    const parsed = parseJSON<DailyRecommendation>(raw)
    if (parsed) return parsed
  }

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
- 每个词都要有音标和中文释义
- 返回合法的 JSON 数组`

  const raw = await callMoonshot([{ role: 'user', content: prompt }])
  if (raw) {
    const parsed = parseJSON<UnfamiliarWord[]>(raw)
    if (parsed && Array.isArray(parsed)) return parsed
  }

  // Fallback：简单提取长单词作为"陌生词"
  const words = snippet
    .split(/\s+/)
    .filter(w => w.length > 7)
    .map(w => w.replace(/[^a-zA-Z]/g, ''))
    .filter(w => w.length > 0)
  const unique = [...new Set(words)].slice(0, maxWords)
  return unique.map(w => ({
    word: w,
    meaning: '（AI 离线，暂无释义）',
    phonetic: '',
  }))
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
): Promise<string[]> {
  if (lines.length === 0) return []

  // 过滤出有实际内容的行（纯数字/标点不翻译）
  const indexedLines = lines.map((l, i) => ({ idx: i, text: l.trim() }))
  const toTranslate = indexedLines.filter(
    l => l.text.length > 0 && /[a-zA-Z]/.test(l.text)
  )

  if (toTranslate.length === 0) return [...lines]

  // 限制单次请求行数，避免 token 超限
  const batch = toTranslate.slice(0, 80)
  const numbered = batch.map(l => `[${l.idx}] ${l.text}`).join('\n')

  const prompt = `你是专业翻译。将以下编号英文文本逐行翻译为${targetLang}。
规则：
- 严格保持原编号，每行格式：[编号] 翻译内容
- 纯数字、表格数据、专有名词可保留原文
- 不要添加解释或额外内容
- 翻译要自然流畅

${numbered}`

  const raw = await callMoonshot([{ role: 'user', content: prompt }])
  const result = [...lines]

  if (raw) {
    // 解析 [idx] 翻译内容 格式
    const lineRegex = /\[(\d+)\]\s*(.+)/g
    let match
    while ((match = lineRegex.exec(raw)) !== null) {
      const idx = parseInt(match[1])
      const text = match[2].trim()
      if (idx >= 0 && idx < result.length && text) {
        result[idx] = text
      }
    }
  }

  return result
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
