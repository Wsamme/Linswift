import { DEFAULT_VOCAB_SOURCE, SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js'

function buildHeaders(accessToken, extra = {}) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    ...extra,
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  return headers
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json')
  const payload = isJson ? await response.json() : await response.text()

  if (response.ok) return payload

  const message =
    payload?.msg ||
    payload?.message ||
    payload?.error_description ||
    payload?.error ||
    (typeof payload === 'string' ? payload : '请求失败')

  throw new Error(message)
}

function restUrl(table, params = {}) {
  const url = new URL(`/rest/v1/${table}`, SUPABASE_URL)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  })
  return url.toString()
}

function authUrl(path) {
  return new URL(`/auth/v1/${path}`, SUPABASE_URL).toString()
}

export function summarizeSession(session) {
  if (!session?.access_token || !session?.user) {
    return {
      isAuthenticated: false,
      email: '',
      userId: '',
      expiresAt: null,
    }
  }

  return {
    isAuthenticated: true,
    email: session.user.email || '',
    userId: session.user.id || '',
    expiresAt: session.expires_at || null,
  }
}

export function isSessionExpired(session, skewSeconds = 60) {
  if (!session?.access_token || !session?.refresh_token) return true
  if (!session?.expires_at) return false
  const expiryMs = session.expires_at * 1000
  return expiryMs <= Date.now() + skewSeconds * 1000
}

export async function signInWithPassword(email, password) {
  const response = await fetch(`${authUrl('token')}?grant_type=password`, {
    method: 'POST',
    headers: buildHeaders(null, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ email, password }),
  })

  return parseResponse(response)
}

export async function refreshSession(refreshToken) {
  const response = await fetch(`${authUrl('token')}?grant_type=refresh_token`, {
    method: 'POST',
    headers: buildHeaders(null, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ refresh_token: refreshToken }),
  })

  return parseResponse(response)
}

export async function signOutSession(accessToken) {
  if (!accessToken) return

  try {
    await fetch(authUrl('logout'), {
      method: 'POST',
      headers: buildHeaders(accessToken),
    })
  } catch {}
}

export async function getCurrentUser(accessToken) {
  const response = await fetch(authUrl('user'), {
    headers: buildHeaders(accessToken),
  })

  return parseResponse(response)
}

export async function ensureProfile(accessToken, user) {
  if (!user?.id) return

  const username =
    user.user_metadata?.username ||
    user.email?.split('@')[0] ||
    'User'

  await fetch(`${restUrl('profiles', { on_conflict: 'id' })}`, {
    method: 'POST',
    headers: buildHeaders(accessToken, {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify([{ id: user.id, username }]),
  }).then(parseResponse)

  await fetch(`${restUrl('user_settings', { on_conflict: 'user_id' })}`, {
    method: 'POST',
    headers: buildHeaders(accessToken, {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify([{ user_id: user.id }]),
  }).then(parseResponse)
}

export async function fetchUserVocabulary(accessToken, userId, limit = 500) {
  const response = await fetch(
    restUrl('user_vocabulary', {
      select:
        'id,word,phonetic,meaning,example_sentence,starred,mastery_level,review_count,updated_at,created_at',
      user_id: `eq.${userId}`,
      order: 'updated_at.desc',
      limit,
    }),
    {
      headers: buildHeaders(accessToken),
    }
  )

  return parseResponse(response)
}

function normalizePositiveInteger(value) {
  const normalized = Math.round(Number(value))
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null
}

async function fetchLatestVocabularyTestResult(accessToken, userId) {
  const response = await fetch(
    restUrl('vocab_test_results', {
      select: 'estimated_vocabulary,created_at',
      user_id: `eq.${userId}`,
      order: 'created_at.desc',
      limit: 1,
    }),
    {
      headers: buildHeaders(accessToken),
    }
  )

  return parseResponse(response)
}

async function fetchProfileVocabularyCount(accessToken, userId) {
  const response = await fetch(
    restUrl('profiles', {
      select: 'vocabulary_count',
      id: `eq.${userId}`,
      limit: 1,
    }),
    {
      headers: buildHeaders(accessToken),
    }
  )

  return parseResponse(response)
}

export async function fetchVocabularyEstimate(accessToken, userId) {
  if (!accessToken || !userId) {
    return {
      estimatedVocabulary: null,
      source: null,
      testedAt: null,
    }
  }

  const [latestResultResponse, profileResponse] = await Promise.allSettled([
    fetchLatestVocabularyTestResult(accessToken, userId),
    fetchProfileVocabularyCount(accessToken, userId),
  ])

  const latestResult =
    latestResultResponse.status === 'fulfilled'
      ? latestResultResponse.value?.[0] || null
      : null
  const profile =
    profileResponse.status === 'fulfilled'
      ? profileResponse.value?.[0] || null
      : null

  const latestEstimate = normalizePositiveInteger(latestResult?.estimated_vocabulary)
  if (latestEstimate !== null) {
    return {
      estimatedVocabulary: latestEstimate,
      source: 'vocab_test_results',
      testedAt: latestResult?.created_at || null,
    }
  }

  const profileEstimate = normalizePositiveInteger(profile?.vocabulary_count)
  if (profileEstimate !== null) {
    return {
      estimatedVocabulary: profileEstimate,
      source: 'profiles.vocabulary_count',
      testedAt: null,
    }
  }

  return {
    estimatedVocabulary: null,
    source: null,
    testedAt: latestResult?.created_at || null,
  }
}

export async function upsertVocabularyEntries(accessToken, entries) {
  if (!Array.isArray(entries) || entries.length === 0) return []

  const response = await fetch(
    restUrl('user_vocabulary', { on_conflict: 'user_id,word' }),
    {
      method: 'POST',
      headers: buildHeaders(accessToken, {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      }),
      body: JSON.stringify(
        entries.map((entry) => ({
          source: DEFAULT_VOCAB_SOURCE,
          review_count: 0,
          mastery_level: 0,
          starred: false,
          ...entry,
        }))
      ),
    }
  )

  return parseResponse(response)
}

export async function patchVocabularyEntry(accessToken, userId, word, patch) {
  const response = await fetch(
    restUrl('user_vocabulary', {
      user_id: `eq.${userId}`,
      word: `eq.${word}`,
    }),
    {
      method: 'PATCH',
      headers: buildHeaders(accessToken, {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      }),
      body: JSON.stringify(patch),
    }
  )

  return parseResponse(response)
}
