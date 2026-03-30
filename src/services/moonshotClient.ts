const DEFAULT_API_BASE = 'https://api.moonshot.ai/v1'

export interface MoonshotMessage {
  role: 'user' | 'assistant'
  content: string
}

interface CallMoonshotOptions {
  messages: MoonshotMessage[]
  systemPrompt?: string
  model: string
  temperature?: number
  apiKey?: string
  apiBase?: string
  logLabel?: string
  signal?: AbortSignal
}

interface ProxyCallResult {
  content: string | null
  allowDirectFallback: boolean
}

function resolveTemperatureForModel(model: string, requestedTemperature: number) {
  if (model === 'kimi-k2.5') return 1
  return requestedTemperature
}

function shouldAllowDirectFallback(status: number) {
  return status === 404 || status === 408 || status === 409 || status === 425 || status === 429 || status >= 500
}

function shouldUseMoonshotProxy() {
  if (typeof window === 'undefined') return false

  const { protocol, hostname } = window.location
  if (protocol === 'file:') return false
  if (hostname === 'localhost' || hostname === '127.0.0.1') return false
  return true
}

async function callMoonshotViaProxy({
  messages,
  systemPrompt,
  model,
  temperature,
  logLabel,
  signal,
}: Omit<CallMoonshotOptions, 'apiKey' | 'apiBase'>): Promise<ProxyCallResult> {
  if (!shouldUseMoonshotProxy()) {
    return {
      content: null,
      allowDirectFallback: true,
    }
  }

  try {
    const response = await fetch('/api/moonshot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        systemPrompt,
        model,
        temperature,
      }),
      signal,
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const message = payload?.error || `${response.status}`
      console.warn(`${logLabel || 'Moonshot'} 代理调用失败:`, message)
      return {
        content: null,
        allowDirectFallback: shouldAllowDirectFallback(response.status),
      }
    }

    const content = typeof payload?.content === 'string' ? payload.content.trim() : ''
    return {
      content: content || null,
      allowDirectFallback: false,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`${logLabel || 'Moonshot'} 代理请求异常:`, message)
    return {
      content: null,
      allowDirectFallback: true,
    }
  }
}

async function callMoonshotDirect({
  messages,
  systemPrompt,
  model,
  temperature = 0.2,
  apiKey,
  apiBase = DEFAULT_API_BASE,
  logLabel,
  signal,
}: CallMoonshotOptions): Promise<string | null> {
  if (!apiKey) return null

  try {
    const allMessages = systemPrompt
      ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
      : messages

    const response = await fetch(`${apiBase.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: allMessages,
        temperature: resolveTemperatureForModel(model, temperature),
      }),
      signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`${logLabel || 'Moonshot'} 直连 API 错误:`, response.status, errorText)
      return null
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content ?? null
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }
    const message = error instanceof Error ? error.message : String(error)
    console.error(`${logLabel || 'Moonshot'} 直连调用失败:`, message)
    return null
  }
}

export async function callMoonshot(options: CallMoonshotOptions): Promise<string | null> {
  const proxied = await callMoonshotViaProxy(options)
  if (proxied.content) return proxied.content
  if (!proxied.allowDirectFallback) return null
  return callMoonshotDirect(options)
}
