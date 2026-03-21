const SOURCE_LANGUAGE_MAP = {
  '简体中文': 'ZH',
  '繁體中文': 'ZH',
  '中文': 'ZH',
  'zh': 'ZH',
  'zh-cn': 'ZH',
  'zh-hans': 'ZH',
  'zh-tw': 'ZH',
  'zh-hant': 'ZH',
  english: 'EN',
  en: 'EN',
  'en-us': 'EN',
  'en-gb': 'EN',
  '日本語': 'JA',
  ja: 'JA',
  'ja-jp': 'JA',
  '한국어': 'KO',
  ko: 'KO',
  'ko-kr': 'KO',
}

const TARGET_LANGUAGE_MAP = {
  '简体中文': 'ZH-HANS',
  '繁體中文': 'ZH-HANT',
  '中文': 'ZH-HANS',
  'zh': 'ZH-HANS',
  'zh-cn': 'ZH-HANS',
  'zh-hans': 'ZH-HANS',
  'zh-tw': 'ZH-HANT',
  'zh-hant': 'ZH-HANT',
  english: 'EN-US',
  en: 'EN-US',
  'en-us': 'EN-US',
  'en-gb': 'EN-GB',
  '日本語': 'JA',
  ja: 'JA',
  'ja-jp': 'JA',
  '한국어': 'KO',
  ko: 'KO',
  'ko-kr': 'KO',
}

const DEFAULT_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json; charset=utf-8',
}

function normalizeLanguage(value) {
  return String(value || '').trim().toLowerCase()
}

function getSourceLanguage(value) {
  return SOURCE_LANGUAGE_MAP[normalizeLanguage(value)] || null
}

function getTargetLanguage(value) {
  return TARGET_LANGUAGE_MAP[normalizeLanguage(value)] || null
}

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

function normalizeTexts(payload) {
  if (Array.isArray(payload?.texts)) {
    return payload.texts
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  }

  const single = String(payload?.text || '').trim()
  return single ? [single] : []
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
  const { sourceLang, targetLang, context } = body
  const safeTexts = normalizeTexts(body)
  if (safeTexts.length === 0) {
    json(res, 400, { error: '缺少待翻译文本' })
    return
  }

  const deeplTargetLang = getTargetLanguage(targetLang)
  if (!deeplTargetLang) {
    json(res, 400, { error: `DeepL 暂不支持目标语言：${targetLang || 'unknown'}` })
    return
  }

  const deeplSourceLang = getSourceLanguage(sourceLang)
  const apiKey = process.env.DEEPL_API_KEY
  if (!apiKey) {
    json(res, 500, { error: 'DEEPL_API_KEY 未配置' })
    return
  }

  const apiBase = String(
    process.env.DEEPL_API_BASE
    || (apiKey.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com')
  ).replace(/\/$/, '')

  const params = new URLSearchParams()
  safeTexts.forEach((text) => {
    params.append('text', text)
  })
  params.set('target_lang', deeplTargetLang)
  params.set('preserve_formatting', '1')
  if (deeplSourceLang) params.set('source_lang', deeplSourceLang)
  if (typeof context === 'string' && context.trim()) params.set('context', context.trim())

  try {
    const response = await fetch(`${apiBase}/v2/translate`, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      json(res, response.status, {
        error: payload?.message || payload?.detail || 'DeepL 调用失败',
      })
      return
    }

    const translations = Array.isArray(payload?.translations) ? payload.translations : []
    const translation = translations[0]
    if (!translation?.text) {
      json(res, 502, { error: 'DeepL 返回内容为空' })
      return
    }

    if (safeTexts.length > 1) {
      json(res, 200, {
        lines: translations.map((item) => String(item?.text || '').trim()),
        translatedCount: translations.reduce((count, item, index) => {
          const translated = String(item?.text || '').trim()
          return count + (translated && translated !== safeTexts[index] ? 1 : 0)
        }, 0),
        detectedSourceLanguage: translation.detected_source_language || null,
        targetLanguage: deeplTargetLang,
        provider: 'deepl',
      })
      return
    }

    json(res, 200, {
      translatedText: translation.text,
      detectedSourceLanguage: translation.detected_source_language || null,
      targetLanguage: deeplTargetLang,
      provider: 'deepl',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    json(res, 500, { error: `DeepL 请求失败：${message}` })
  }
}
