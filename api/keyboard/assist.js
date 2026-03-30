const MODEL = 'moonshot-v1-8k'

const DEFAULT_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json; charset=utf-8',
}

const REWRITE_TONES = new Set(['natural', 'concise', 'formal'])

function json(res, status, payload) {
  res.statusCode = status
  Object.entries(DEFAULT_HEADERS).forEach(([key, value]) => res.setHeader(key, value))
  res.end(JSON.stringify(payload))
}

function parseBody(req) {
  if (!req.body) return {}
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      return {}
    }
  }
  return req.body
}

function cleanupJson(raw) {
  return String(raw || '')
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim()
}

function parseJSON(raw) {
  try {
    return JSON.parse(cleanupJson(raw))
  } catch {
    return null
  }
}

async function callMoonshot(messages) {
  const apiKey = process.env.MOONSHOT_API_KEY || process.env.VITE_MOONSHOT_API_KEY
  if (!apiKey) {
    throw new Error('MOONSHOT_API_KEY 未配置')
  }

  const response = await fetch('https://api.moonshot.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.25,
      messages,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Moonshot 请求失败：${response.status} ${errorText}`)
  }

  const payload = await response.json()
  const content = payload?.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('Moonshot 返回内容为空')
  }

  return content
}

function buildProofreadPrompt(text) {
  return [
    '你是 Linswift iOS 键盘里的英文写作助手。',
    '任务：对用户当前句子做最小必要改动的英文语法修正。',
    '要求：',
    '- 只修正 grammar / spelling / punctuation / article / tense / agreement / clarity 的硬错误。',
    '- 不要过度改写，不要改变语气。',
    '- issues 最多返回 5 条，每条都要简短。',
    '- 返回严格 JSON，不要 markdown，不要解释。',
    '输出结构：',
    '{"resultText":"","issues":[{"id":"","excerpt":"","suggestion":"","reason":""}],"alternatives":[{"id":"proofread","label":"应用修正","text":"","summary":"最小改动修正语法"}]}',
    `输入文本：${text}`,
  ].join('\n')
}

function buildRewritePrompt(text, tone) {
  const preferredTone = REWRITE_TONES.has(tone) ? tone : 'natural'
  return [
    '你是 Linswift iOS 键盘里的英文改写助手。',
    '任务：在不改变核心含义的前提下，给用户当前句子提供更好的英文改写版本。',
    '要求：',
    '- 必须输出 natural、concise、formal 三种改写。',
    `- 当前优先推荐 ${preferredTone}。`,
    '- 不要解释理论，不要返回 markdown。',
    '- summary 要非常短，适合在键盘候选卡片里显示。',
    '返回严格 JSON：',
    '{"resultText":"","issues":[],"alternatives":[{"id":"natural","label":"自然","text":"","summary":""},{"id":"concise","label":"简洁","text":"","summary":""},{"id":"formal","label":"正式","text":"","summary":""}]}',
    `输入文本：${text}`,
  ].join('\n')
}

function normalizeIssues(issues) {
  return Array.isArray(issues)
    ? issues
        .map((issue, index) => ({
          id: String(issue?.id || `issue-${index + 1}`),
          excerpt: String(issue?.excerpt || '').trim(),
          suggestion: String(issue?.suggestion || '').trim(),
          reason: String(issue?.reason || '').trim(),
        }))
        .filter((issue) => issue.excerpt || issue.suggestion || issue.reason)
        .slice(0, 5)
    : []
}

function normalizeAlternatives(alternatives, fallbackText, mode) {
  const normalized = Array.isArray(alternatives)
    ? alternatives
        .map((item, index) => ({
          id: String(item?.id || item?.label || `${mode}-${index + 1}`),
          label: String(item?.label || `建议 ${index + 1}`).trim(),
          text: String(item?.text || '').trim(),
          summary: String(item?.summary || '').trim(),
        }))
        .filter((item) => item.text)
    : []

  if (normalized.length > 0) return normalized

  return fallbackText
    ? [
        {
          id: mode,
          label: mode === 'proofread' ? '应用修正' : '应用改写',
          text: fallbackText,
          summary: mode === 'proofread' ? '最小改动修正语法' : '使用当前改写结果',
        },
      ]
    : []
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    Object.entries(DEFAULT_HEADERS).forEach(([key, value]) => res.setHeader(key, value))
    res.end()
    return
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' })
    return
  }

  const body = parseBody(req)
  const text = String(body?.text || '').trim()
  const mode = body?.mode === 'rewrite' ? 'rewrite' : 'proofread'
  const tone = REWRITE_TONES.has(String(body?.tone || '').trim()) ? String(body.tone).trim() : 'natural'

  if (!text) {
    json(res, 400, { error: '缺少待处理文本' })
    return
  }

  if (text.length > 2500) {
    json(res, 400, { error: '文本过长，请缩短到 2500 字符以内' })
    return
  }

  try {
    const content = await callMoonshot([
      {
        role: 'system',
        content:
          mode === 'proofread'
            ? '你是严格返回 JSON 的英文语法纠错助手。'
            : '你是严格返回 JSON 的英文重写助手。',
      },
      {
        role: 'user',
        content: mode === 'proofread' ? buildProofreadPrompt(text) : buildRewritePrompt(text, tone),
      },
    ])

    const parsed = parseJSON(content)
    if (!parsed) {
      throw new Error('AI 返回了不可解析的 JSON')
    }

    const resultText = String(parsed?.resultText || '').trim()
    const issues = normalizeIssues(parsed?.issues)
    const alternatives = normalizeAlternatives(parsed?.alternatives, resultText, mode)

    json(res, 200, {
      ok: true,
      mode,
      tone,
      sourceText: text,
      resultText: resultText || alternatives[0]?.text || text,
      issues,
      alternatives,
      model: MODEL,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    json(res, 500, {
      ok: false,
      error: message,
    })
  }
}
