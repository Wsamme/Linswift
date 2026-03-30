const DEFAULT_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json; charset=utf-8',
}

const DEFAULT_MODEL = 'kimi-k2.5'
const DEFAULT_FALLBACK_MODELS = ['kimi-k2.5']
const DEFAULT_API_BASE = 'https://api.moonshot.ai/v1'
const REQUEST_TIMEOUT_MS = 30000

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

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return []

  return messages
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: String(item?.content || '').trim(),
    }))
    .filter((item) => item.content)
}

function parseModelList(value) {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean)
  }
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function dedupeModels(models) {
  return Array.from(new Set(models.filter(Boolean)))
}

function shouldRetryStatus(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function resolveTemperatureForModel(model, requestedTemperature) {
  if (model === 'kimi-k2.5') return 1
  return requestedTemperature
}

async function requestMoonshot({ apiBase, apiKey, model, messages, temperature }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: resolveTemperatureForModel(model, temperature),
      }),
      signal: controller.signal,
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: payload?.error?.message || payload?.message || payload?.detail || 'Moonshot 调用失败',
      }
    }

    const content = payload?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      return {
        ok: false,
        status: 502,
        error: 'Moonshot 返回内容为空',
      }
    }

    return {
      ok: true,
      content,
      model: payload?.model || model,
    }
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? `Moonshot 请求超时（>${REQUEST_TIMEOUT_MS}ms）`
      : (error instanceof Error ? error.message : String(error))

    return {
      ok: false,
      status: 500,
      error: `Moonshot 请求失败：${message}`,
    }
  } finally {
    clearTimeout(timeout)
  }
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
  const messages = normalizeMessages(body?.messages)
  const systemPrompt = String(body?.systemPrompt || '').trim()
  const model = String(body?.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL
  const fallbackModels = dedupeModels([
    ...parseModelList(body?.fallbackModels),
    ...parseModelList(process.env.MOONSHOT_FALLBACK_MODELS),
    ...DEFAULT_FALLBACK_MODELS,
  ].filter((item) => item !== model))
  const apiBase = String(process.env.MOONSHOT_API_BASE || DEFAULT_API_BASE).replace(/\/$/, '')
  const apiKey = process.env.MOONSHOT_API_KEY || process.env.VITE_MOONSHOT_API_KEY
  const rawTemperature = Number(body?.temperature)
  const temperature = Number.isFinite(rawTemperature)
    ? Math.min(Math.max(rawTemperature, 0), 1.5)
    : 0.2

  if (!apiKey) {
    json(res, 500, { error: 'MOONSHOT_API_KEY 未配置' })
    return
  }

  if (messages.length === 0) {
    json(res, 400, { error: '缺少有效消息' })
    return
  }

  const payloadMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages

  const candidateModels = [model, ...fallbackModels]
  const errors = []

  for (let index = 0; index < candidateModels.length; index += 1) {
    const candidate = candidateModels[index]
    const result = await requestMoonshot({
      apiBase,
      apiKey,
      model: candidate,
      messages: payloadMessages,
      temperature,
    })

    if (result.ok) {
      json(res, 200, {
        content: result.content,
        model: result.model,
        fallbackUsed: candidate !== model,
      })
      return
    }

    errors.push(`${candidate}: ${result.error}`)

    if (!shouldRetryStatus(result.status) || index === candidateModels.length - 1) {
      json(res, result.status || 500, {
        error: result.error,
        triedModels: candidateModels.slice(0, index + 1),
        details: errors,
      })
      return
    }

    await wait(220 * (index + 1))
  }
}
