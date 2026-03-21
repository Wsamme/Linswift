import { analyzePageText, buildFrequencyData, getDefaultSettings } from './lib/analyzer.js'
import {
  fetchDictionaryExplanation,
  fetchLinswiftExplanations,
  fetchLinswiftWordDetail,
  translateBatchLines,
} from './lib/ai.js'
import {
  ensureProfile,
  fetchUserVocabulary,
  getCurrentUser,
  isSessionExpired,
  patchVocabularyEntry,
  refreshSession,
  signInWithPassword,
  signOutSession,
  summarizeSession,
  upsertVocabularyEntries,
} from './lib/cloud.js'
import {
  addKnownWord,
  clearAuthSession,
  loadAuthSession,
  loadExtensionState,
  saveAuthSession,
  saveSettings,
  saveWordState,
  toggleSavedWord,
} from './lib/storage.js'

let frequencyDataPromise = null

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'linswift-ping' })
    return
  } catch {}

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content-script.js'],
  })
}

async function loadFrequencyData() {
  if (!frequencyDataPromise) {
    frequencyDataPromise = fetch(chrome.runtime.getURL('assets/30k.txt'))
      .then((response) => response.text())
      .then((text) => buildFrequencyData(text))
  }

  return frequencyDataPromise
}

function getMergedState(state) {
  return {
    ...state,
    settings: {
      ...getDefaultSettings(),
      ...(state.settings || {}),
    },
  }
}

function normalizeWord(rawWord) {
  return String(rawWord || '')
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
}

function wordToCloudRow(userId, word, patch = {}) {
  return {
    user_id: userId,
    word: normalizeWord(word),
    source: 'reading',
    ...patch,
  }
}

function vocabularyToSavedEntry(row, previousEntry = null) {
  return {
    word: row.word,
    meaning: row.meaning || previousEntry?.meaning || '',
    note: previousEntry?.note || row.example_sentence || '来自云端词库',
    phonetic: row.phonetic || previousEntry?.phonetic || '',
    pageTitle: previousEntry?.pageTitle || 'Linswift 云端词库',
    pageUrl: previousEntry?.pageUrl || '',
    savedAt:
      previousEntry?.savedAt ||
      row.updated_at ||
      row.created_at ||
      new Date().toISOString(),
  }
}

function mergeCloudState(state, vocabularyRows) {
  const knownWords = new Set(
    (state.knownWords || []).map((word) => normalizeWord(word)).filter(Boolean)
  )
  const savedWords = { ...(state.savedWords || {}) }

  for (const row of vocabularyRows || []) {
    const normalized = normalizeWord(row.word)
    if (!normalized) continue

    if ((row.mastery_level || 0) >= 5) {
      knownWords.add(normalized)
    }

    if (row.starred) {
      savedWords[normalized] = vocabularyToSavedEntry(row, savedWords[normalized])
    }
  }

  return {
    ...state,
    knownWords: Array.from(knownWords),
    savedWords,
  }
}

async function getUsableSession() {
  let session = await loadAuthSession()
  if (!session) return null

  if (isSessionExpired(session)) {
    try {
      session = await refreshSession(session.refresh_token)
      if (session?.access_token) {
        await saveAuthSession(session)
      }
    } catch {
      await clearAuthSession()
      return null
    }
  }

  if (!session?.user?.id && session?.access_token) {
    try {
      const user = await getCurrentUser(session.access_token)
      session = { ...session, user }
      await saveAuthSession(session)
    } catch {
      await clearAuthSession()
      return null
    }
  }

  return session
}

async function uploadLocalStateToCloud(session, state) {
  const userId = session?.user?.id
  if (!userId) return { uploadedKnown: 0, uploadedSaved: 0 }

  const rows = []

  for (const word of state.knownWords || []) {
    rows.push(
      wordToCloudRow(userId, word, {
        mastery_level: 5,
        review_count: 1,
      })
    )
  }

  for (const entry of Object.values(state.savedWords || {})) {
    rows.push(
      wordToCloudRow(userId, entry.word, {
        meaning: entry.meaning || null,
        phonetic: entry.phonetic || null,
        example_sentence: entry.note || null,
        starred: true,
      })
    )
  }

  if (rows.length > 0) {
    await upsertVocabularyEntries(session.access_token, rows)
  }

  return {
    uploadedKnown: (state.knownWords || []).length,
    uploadedSaved: Object.keys(state.savedWords || {}).length,
  }
}

async function syncCloudState(session) {
  const localState = getMergedState(await loadExtensionState())
  const uploadSummary = await uploadLocalStateToCloud(session, localState)
  const vocabularyRows = await fetchUserVocabulary(
    session.access_token,
    session.user.id,
    1000
  )
  const mergedState = mergeCloudState(localState, vocabularyRows)

  await saveWordState({
    knownWords: mergedState.knownWords,
    savedWords: mergedState.savedWords,
  })

  return {
    state: mergedState,
    summary: {
      cloudWords: Array.isArray(vocabularyRows) ? vocabularyRows.length : 0,
      uploadedKnown: uploadSummary.uploadedKnown,
      uploadedSaved: uploadSummary.uploadedSaved,
    },
  }
}

async function enrichResults(results, apiKey, targetLanguage) {
  const nextResults = results.map((item) => ({ ...item }))
  const words = nextResults.slice(0, 10).map((item) => item.word)
  const aiMap = await fetchLinswiftExplanations(words, apiKey, targetLanguage)

  for (const item of nextResults) {
    const explanation = aiMap?.[item.word]
    if (explanation) {
      item.meaning = explanation.meaning
      item.note = explanation.note
      item.phonetic = explanation.phonetic || ''
      continue
    }

    const dictionary = await fetchDictionaryExplanation(item.word, targetLanguage, item.snippet || '')
    item.meaning = dictionary.meaning
    item.note = dictionary.note
    item.phonetic = dictionary.phonetic || ''
  }

  return nextResults
}

async function pushKnownWordToCloud(session, word) {
  const userId = session?.user?.id
  if (!userId) return

  await upsertVocabularyEntries(session.access_token, [
    wordToCloudRow(userId, word, {
      mastery_level: 5,
      review_count: 1,
    }),
  ])
}

async function pushSavedWordToCloud(session, entry, saved) {
  const userId = session?.user?.id
  if (!userId) return

  if (saved) {
    await upsertVocabularyEntries(session.access_token, [
      wordToCloudRow(userId, entry.word, {
        meaning: entry.meaning || null,
        phonetic: entry.phonetic || null,
        example_sentence: entry.note || null,
        starred: true,
      }),
    ])
    return
  }

  await patchVocabularyEntry(
    session.access_token,
    userId,
    normalizeWord(entry.word),
    { starred: false }
  )
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !/^https?:/i.test(tab.url || '')) return

  await ensureContentScript(tab.id)
  await chrome.tabs.sendMessage(tab.id, { type: 'toggle-floating-panel' })
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  ;(async () => {
    if (message?.type === 'panel-load-state') {
      let state = getMergedState(await loadExtensionState())
      const session = await getUsableSession()

      if (session?.user?.id) {
        try {
          const synced = await syncCloudState(session)
          state = synced.state
        } catch {}
      }

      sendResponse({
        ok: true,
        state,
        auth: summarizeSession(session),
      })
      return
    }

    if (message?.type === 'panel-auth-sign-in') {
      const email = String(message.email || '').trim()
      const password = String(message.password || '')

      if (!email || !password) {
        throw new Error('请输入邮箱和密码')
      }

      const session = await signInWithPassword(email, password)
      const user = session.user || (await getCurrentUser(session.access_token))
      const hydratedSession = { ...session, user }

      await ensureProfile(hydratedSession.access_token, user)
      await saveAuthSession(hydratedSession)

      const synced = await syncCloudState(hydratedSession)

      sendResponse({
        ok: true,
        state: synced.state,
        auth: summarizeSession(hydratedSession),
        syncSummary: synced.summary,
      })
      return
    }

    if (message?.type === 'panel-auth-sign-out') {
      const session = await getUsableSession()
      await signOutSession(session?.access_token)
      await clearAuthSession()

      sendResponse({
        ok: true,
        auth: summarizeSession(null),
      })
      return
    }

    if (message?.type === 'panel-sync-cloud') {
      const session = await getUsableSession()
      if (!session?.user?.id) {
        throw new Error('请先登录 Linswift 账号')
      }

      const synced = await syncCloudState(session)

      sendResponse({
        ok: true,
        state: synced.state,
        auth: summarizeSession(session),
        syncSummary: synced.summary,
      })
      return
    }

    if (message?.type === 'panel-analyze-page') {
      const state = getMergedState(await loadExtensionState())
      const frequencyData = await loadFrequencyData()
      const analysis = analyzePageText(
        message.pageData || {},
        frequencyData,
        state.settings,
        state.knownWords
      )

      sendResponse({ ok: true, analysis, state })
      return
    }

    if (message?.type === 'panel-enrich-results') {
      const state = getMergedState(await loadExtensionState())
      const results = await enrichResults(
        Array.isArray(message.results) ? message.results : [],
        state.settings.moonshotApiKey?.trim(),
        state.settings.translationLanguage || 'zh-CN'
      )

      sendResponse({ ok: true, results })
      return
    }

    if (message?.type === 'panel-word-detail') {
      const state = getMergedState(await loadExtensionState())
      const word = normalizeWord(message.word)

      if (!word) {
        throw new Error('缺少单词')
      }

      const detail = await fetchLinswiftWordDetail(
        word,
        state.settings.moonshotApiKey?.trim(),
        state.settings.translationLanguage || 'zh-CN',
        message.context || ''
      )

      sendResponse({ ok: true, detail })
      return
    }

    if (message?.type === 'panel-translate-lines') {
      const state = getMergedState(await loadExtensionState())
      const translation = await translateBatchLines(
        Array.isArray(message.lines) ? message.lines : [],
        state.settings.moonshotApiKey?.trim(),
        state.settings.translationLanguage || 'zh-CN'
      )

      sendResponse({ ok: true, ...translation })
      return
    }

    if (message?.type === 'panel-add-known') {
      const word = normalizeWord(message.word)
      const knownWords = await addKnownWord(word)
      const session = await getUsableSession()

      if (session?.user?.id) {
        await pushKnownWordToCloud(session, word)
      }

      sendResponse({
        ok: true,
        knownWords,
        auth: summarizeSession(session),
      })
      return
    }

    if (message?.type === 'panel-toggle-saved') {
      const entry = {
        ...message.entry,
        word: normalizeWord(message.entry?.word),
      }
      const savedWords = await toggleSavedWord(entry)
      const session = await getUsableSession()
      const isSaved = Boolean(savedWords[entry.word])

      if (session?.user?.id) {
        await pushSavedWordToCloud(session, entry, isSaved)
      }

      sendResponse({
        ok: true,
        savedWords,
        auth: summarizeSession(session),
      })
      return
    }

    if (message?.type === 'panel-save-settings') {
      const state = getMergedState(await loadExtensionState())
      const settings = {
        ...state.settings,
        ...(message.settings || {}),
      }
      await saveSettings(settings)
      sendResponse({ ok: true, settings })
      return
    }

    sendResponse({ ok: false, error: 'unknown-message' })
  })().catch((error) => {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'unknown-error',
    })
  })

  return true
})
