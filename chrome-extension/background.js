import {
  analyzePageText,
  buildFrequencyData,
  getDefaultSettings,
  inferLevelFromVocabulary,
} from './lib/analyzer.js'
import {
  fetchDictionaryExplanation,
  filterDictionaryWhitelistedResults,
  fetchLinswiftExplanations,
  translateBatchLines,
} from './lib/ai.js'
import {
  ensureProfile,
  fetchVocabularyEstimate,
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

function isInjectableTab(tab) {
  return Boolean(tab?.id) && /^https?:/i.test(tab.url || '')
}

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

async function bootstrapExistingTabs() {
  let tabs = []
  try {
    tabs = await chrome.tabs.query({})
  } catch (error) {
    console.warn('查询现有标签页失败:', error)
    return
  }

  await Promise.allSettled(
    tabs
      .filter(isInjectableTab)
      .map(async (tab) => {
        try {
          await ensureContentScript(tab.id)
        } catch (error) {
          console.warn('恢复网页常驻插件失败:', tab.url, error)
        }
      })
  )
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
  const mergedState = {
    ...state,
    settings: {
      ...getDefaultSettings(),
      ...(state.settings || {}),
    },
  }

  return {
    ...mergedState,
    settings: {
      ...mergedState.settings,
      level: inferLevelFromVocabulary(
        mergedState.settings?.estimatedVocabulary,
        mergedState.knownWords || []
      ),
    },
  }
}

function normalizeWord(rawWord) {
  return String(rawWord || '')
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
}

function resolveRequestedTranslationLanguage(requested, fallback = 'zh-CN') {
  const value = String(requested || '').trim()
  return value || fallback
}

function resolveRequestedTranslationMode(requested, fallback = 'ai') {
  const value = String(requested || '').trim()
  return value || fallback
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
  const [vocabularyRows, vocabularyEstimate] = await Promise.all([
    fetchUserVocabulary(
      session.access_token,
      session.user.id,
      1000
    ),
    fetchVocabularyEstimate(session.access_token, session.user.id),
  ])
  const mergedState = mergeCloudState(localState, vocabularyRows)
  const nextEstimatedVocabulary =
    vocabularyEstimate?.estimatedVocabulary ??
    mergedState.settings?.estimatedVocabulary ??
    null

  mergedState.settings = {
    ...mergedState.settings,
    estimatedVocabulary: nextEstimatedVocabulary,
    estimatedVocabularySource:
      vocabularyEstimate?.source ||
      mergedState.settings?.estimatedVocabularySource ||
      null,
    level: inferLevelFromVocabulary(nextEstimatedVocabulary, mergedState.knownWords || []),
  }

  await saveWordState({
    knownWords: mergedState.knownWords,
    savedWords: mergedState.savedWords,
  })
  await saveSettings(mergedState.settings)

  return {
    state: mergedState,
    summary: {
      cloudWords: Array.isArray(vocabularyRows) ? vocabularyRows.length : 0,
      uploadedKnown: uploadSummary.uploadedKnown,
      uploadedSaved: uploadSummary.uploadedSaved,
      estimatedVocabulary: nextEstimatedVocabulary,
      estimatedVocabularySource: mergedState.settings.estimatedVocabularySource,
    },
  }
}

async function enrichResults(results, apiKey, targetLanguage, translationMode = 'ai') {
  const nextResults = (await filterDictionaryWhitelistedResults(results)).map((item) => ({ ...item }))
  const aiMap = await fetchLinswiftExplanations(
    nextResults.map((item) => ({
      word: item.word,
      snippet: item.snippet || item.note || '',
    })),
    apiKey,
    targetLanguage
  )

  const concurrency = Math.min(4, nextResults.length || 1)
  const enrichedResults = new Array(nextResults.length)
  let nextIndex = 0

  const enrichOne = async (item) => {
    const explanation = aiMap?.[item.word]
    if (explanation) {
      return {
        ...item,
        meaning: explanation.meaning,
        note: explanation.note,
        phonetic: explanation.phonetic || '',
      }
    }

    const dictionary = await fetchDictionaryExplanation(
      item.word,
      targetLanguage,
      item.snippet || '',
      translationMode
    )

    return {
      ...item,
      meaning: dictionary.meaning,
      note: dictionary.note,
      phonetic: dictionary.phonetic || '',
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (nextIndex < nextResults.length) {
        const currentIndex = nextIndex
        nextIndex += 1
        enrichedResults[currentIndex] = await enrichOne(nextResults[currentIndex])
      }
    })
  )

  return enrichedResults
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

chrome.runtime.onStartup.addListener(() => {
  void bootstrapExistingTabs()
})

chrome.runtime.onInstalled.addListener(() => {
  void bootstrapExistingTabs()
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
      const state = getMergedState(await loadExtensionState())

      sendResponse({
        ok: true,
        state,
        auth: summarizeSession(hydratedSession),
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
      const baseAnalysis = analyzePageText(
        message.pageData || {},
        frequencyData,
        state.settings,
        state.knownWords
      )
      const validResults = await filterDictionaryWhitelistedResults(baseAnalysis.results)
      const analysis = {
        ...baseAnalysis,
        meta: {
          ...baseAnalysis.meta,
          resultCount: validResults.length,
        },
        results: validResults,
      }

      sendResponse({ ok: true, analysis, state })
      return
    }

    if (message?.type === 'panel-enrich-results') {
      const state = getMergedState(await loadExtensionState())
      const targetLanguage = resolveRequestedTranslationLanguage(
        message.targetLanguage,
        state.settings.translationLanguage || 'zh-CN'
      )
      const translationMode = resolveRequestedTranslationMode(
        message.translationMode,
        state.settings.translationMode || 'ai'
      )
      const results = await enrichResults(
        Array.isArray(message.results) ? message.results : [],
        state.settings.moonshotApiKey?.trim(),
        targetLanguage,
        translationMode
      )

      sendResponse({ ok: true, results })
      return
    }

    if (message?.type === 'panel-word-detail') {
      const state = getMergedState(await loadExtensionState())
      const word = normalizeWord(message.word)
      const targetLanguage = resolveRequestedTranslationLanguage(
        message.targetLanguage,
        state.settings.translationLanguage || 'zh-CN'
      )
      const translationMode = resolveRequestedTranslationMode(
        message.translationMode,
        state.settings.translationMode || 'ai'
      )

      if (!word) {
        throw new Error('缺少单词')
      }

      const detail = await fetchLinswiftWordDetail(
        word,
        state.settings.moonshotApiKey?.trim(),
        targetLanguage,
        message.context || '',
        translationMode
      )

      sendResponse({ ok: true, detail })
      return
    }

    if (message?.type === 'panel-translate-lines') {
      const state = getMergedState(await loadExtensionState())
      const targetLanguage = resolveRequestedTranslationLanguage(
        message.targetLanguage,
        state.settings.translationLanguage || 'zh-CN'
      )
      const translationMode = resolveRequestedTranslationMode(
        message.translationMode,
        state.settings.translationMode || 'ai'
      )
      const translation = await translateBatchLines(
        Array.isArray(message.lines) ? message.lines : [],
        state.settings.moonshotApiKey?.trim(),
        targetLanguage,
        translationMode
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
      const nextEstimatedVocabulary =
        message.settings?.estimatedVocabulary ?? state.settings.estimatedVocabulary ?? null
      const settings = {
        ...state.settings,
        ...(message.settings || {}),
        level: inferLevelFromVocabulary(nextEstimatedVocabulary, state.knownWords || []),
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
