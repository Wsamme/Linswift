const DEFAULT_SETTINGS = {
  level: 'intermediate',
  maxResults: 18,
  inlineTranslateEnabled: false,
  autoTranslateOnLoad: true,
  translationLanguage: 'zh-CN',
  translationMode: 'ai',
  disabledAutoTranslateHosts: [],
  youtubeSubtitleMode: 'vocab',
  uiScale: 0.56,
  moonshotApiKey: '',
}

const RUNTIME_MESSAGE_TIMEOUT_MS = 15000

const urlParams = new URLSearchParams(window.location.search)
const explicitTargetUrl = urlParams.get('targetUrl')
const explicitView = urlParams.get('view')
const explicitTabId = (() => {
  const raw = urlParams.get('targetTab')
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
})()

const refs = {
  headerBackButton: document.getElementById('headerBackButton'),
  headerCloseButton: document.getElementById('headerCloseButton'),
  translateView: document.getElementById('translateView'),
  settingsView: document.getElementById('settingsView'),
  loginView: document.getElementById('loginView'),
  sentenceView: document.getElementById('sentenceView'),
  translateTabButton: document.getElementById('translateTabButton'),
  settingsTabButton: document.getElementById('settingsTabButton'),
  settingsTranslateTabButton: document.getElementById('settingsTranslateTabButton'),
  settingsSettingsTabButton: document.getElementById('settingsSettingsTabButton'),
  scanButton: document.getElementById('scanButton'),
  rescanButton: document.getElementById('rescanButton'),
  toggleSavedButton: document.getElementById('toggleSavedButton'),
  openSentenceButton: document.getElementById('openSentenceButton'),
  openLoginButton: document.getElementById('openLoginButton'),
  pageMeta: document.getElementById('pageMeta'),
  authBadge: document.getElementById('authBadge'),
  syncSummary: document.getElementById('syncSummary'),
  status: document.getElementById('status'),
  tokenCount: document.getElementById('tokenCount'),
  candidateCount: document.getElementById('candidateCount'),
  knownCount: document.getElementById('knownCount'),
  resultsSection: document.getElementById('resultsSection'),
  savedSection: document.getElementById('savedSection'),
  translationLanguageSelect: document.getElementById('translationLanguageSelect'),
  translationModeSelect: document.getElementById('translationModeSelect'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  uiScaleSelect: document.getElementById('uiScaleSelect'),
  inlineTranslateToggle: document.getElementById('inlineTranslateToggle'),
  autoTranslateToggle: document.getElementById('autoTranslateToggle'),
  inlineTranslateValue: document.getElementById('inlineTranslateValue'),
  autoTranslateValue: document.getElementById('autoTranslateValue'),
  currentHost: document.getElementById('currentHost'),
  settingsSyncButton: document.getElementById('settingsSyncButton'),
  settingsAuthButton: document.getElementById('settingsAuthButton'),
  settingsAuthSummary: document.getElementById('settingsAuthSummary'),
  emailInput: document.getElementById('emailInput'),
  passwordInput: document.getElementById('passwordInput'),
  loginSubmitButton: document.getElementById('loginSubmitButton'),
  forgotPasswordButton: document.getElementById('forgotPasswordButton'),
  googleLoginButton: document.getElementById('googleLoginButton'),
  appleLoginButton: document.getElementById('appleLoginButton'),
  registerButton: document.getElementById('registerButton'),
  sentenceModeChip: document.getElementById('sentenceModeChip'),
  sentenceContextBefore: document.getElementById('sentenceContextBefore'),
  sentenceHighlightText: document.getElementById('sentenceHighlightText'),
  sentenceContextAfter: document.getElementById('sentenceContextAfter'),
  sentenceCardTitle: document.getElementById('sentenceCardTitle'),
  sentenceTranslation: document.getElementById('sentenceTranslation'),
  sentenceVocabTitle: document.getElementById('sentenceVocabTitle'),
  sentenceVocabList: document.getElementById('sentenceVocabList'),
  saveSentenceButton: document.getElementById('saveSentenceButton'),
  speakSentenceButton: document.getElementById('speakSentenceButton'),
  collectSentenceWordsButton: document.getElementById('collectSentenceWordsButton'),
  sentenceResumeButton: document.getElementById('sentenceResumeButton'),
}

let activeTabId = null
let activeTabUrl = ''
let activeTabTitle = ''
let extensionState = {
  settings: { ...DEFAULT_SETTINGS },
  knownWords: [],
  savedWords: {},
}
let authState = {
  isAuthenticated: false,
  email: '',
  userId: '',
  expiresAt: null,
}
let lastAnalysis = null
let lastPageData = null
let currentView = 'translate'
let showingSaved = false
let sentenceState = {
  sentence: '',
  translation: '',
  before: '',
  after: '',
  vocab: [],
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getHostname(url) {
  try {
    return new URL(url).hostname
  } catch {
    return url || '当前网页'
  }
}

function getMergedSettings() {
  return {
    ...DEFAULT_SETTINGS,
    ...(extensionState.settings || {}),
  }
}

function setStatus(message) {
  refs.status.textContent = message
}

function toggleHidden(element, hidden) {
  element.classList.toggle('hidden', hidden)
}

function setButtonLoading(button, loading, label) {
  if (!button) return
  if (loading) {
    button.dataset.originalText = button.textContent
    button.textContent = label
    button.disabled = true
    return
  }
  button.disabled = false
  if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText
    delete button.dataset.originalText
  }
}

function sanitizeSentence(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/^\.\.\./, '')
    .replace(/\.\.\.$/, '')
    .trim()
}

async function sendRuntimeMessage(payload) {
  const response = await Promise.race([
    chrome.runtime.sendMessage(payload),
    new Promise((_, reject) => {
      globalThis.setTimeout(() => {
        reject(new Error('扩展服务响应超时，请刷新插件后重试'))
      }, RUNTIME_MESSAGE_TIMEOUT_MS)
    }),
  ])
  if (!response?.ok) {
    throw new Error(response?.error || '请求失败')
  }
  return response
}

async function getActiveTab() {
  if (explicitTabId) {
    try {
      return await chrome.tabs.get(explicitTabId)
    } catch {
      return null
    }
  }

  if (explicitTargetUrl) {
    const matchedTabs = await chrome.tabs.query({ url: explicitTargetUrl })
    return matchedTabs[0] || null
  }

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  return tabs[0] || null
}

async function sendToActiveTab(payload) {
  let targetTabId = explicitTabId ?? activeTabId
  if (!targetTabId && explicitTargetUrl) {
    const matchedTabs = await chrome.tabs.query({ url: explicitTargetUrl })
    targetTabId = matchedTabs[0]?.id || null
  }
  if (!targetTabId) {
    throw new Error('当前没有可操作的网页标签页')
  }
  return chrome.tabs.sendMessage(targetTabId, payload)
}

function updateViewTabs() {
  const translateActive = currentView === 'translate'
  const settingsActive = currentView === 'settings'

  refs.translateTabButton.classList.toggle('view-tab--active', translateActive)
  refs.settingsTabButton.classList.toggle('view-tab--active', settingsActive)
  refs.settingsTranslateTabButton.classList.toggle('view-tab--active', translateActive)
  refs.settingsSettingsTabButton.classList.toggle('view-tab--active', settingsActive)
}

function setView(view) {
  if (!authState.isAuthenticated && view !== 'login') {
    view = 'login'
  }
  currentView = view
  toggleHidden(refs.translateView, view !== 'translate')
  toggleHidden(refs.settingsView, view !== 'settings')
  toggleHidden(refs.loginView, view !== 'login')
  toggleHidden(refs.sentenceView, view !== 'sentence')
  refs.headerBackButton.textContent = view === 'sentence' ? '‹' : '−'
  updateViewTabs()
}

function renderHeaderMeta() {
  const hostname = getHostname(activeTabUrl)
  refs.pageMeta.textContent = activeTabTitle
    ? `${activeTabTitle} · ${hostname}`
    : `当前网页 · ${hostname}`
  refs.currentHost.textContent = hostname

  if (authState.isAuthenticated) {
    refs.authBadge.textContent = '账号已连接'
    refs.syncSummary.textContent = authState.email || '已连接 Linswift 账号'
    refs.settingsAuthSummary.textContent = `当前账号：${authState.email || '已登录'}`
    refs.settingsAuthButton.textContent = '退出登录'
    refs.openLoginButton.textContent = '同步完成'
  } else {
    refs.authBadge.textContent = '请先登录'
    refs.syncSummary.textContent = '登录后同步生词夹、阅读进度与插件设置'
    refs.settingsAuthSummary.textContent = '未登录时无法继续使用翻译插件，请先登录。'
    refs.settingsAuthButton.textContent = '登录账号'
    refs.openLoginButton.textContent = '登录账号'
  }
}

function renderStats(meta = null) {
  refs.tokenCount.textContent = String(meta?.totalTokens || 0)
  refs.candidateCount.textContent = String(meta?.resultCount || 0)
  refs.knownCount.textContent = String((extensionState.knownWords || []).length)
}

function renderSettings() {
  const settings = getMergedSettings()
  refs.translationLanguageSelect.value = settings.translationLanguage
  refs.translationModeSelect.value = settings.translationMode
  refs.apiKeyInput.value = settings.moonshotApiKey || ''
  refs.uiScaleSelect.value = String(settings.uiScale)
  refs.inlineTranslateToggle.setAttribute('aria-pressed', String(Boolean(settings.inlineTranslateEnabled)))
  refs.autoTranslateToggle.setAttribute('aria-pressed', String(Boolean(settings.autoTranslateOnLoad)))
  refs.inlineTranslateValue.textContent = settings.inlineTranslateEnabled ? '开' : '关'
  refs.autoTranslateValue.textContent = settings.autoTranslateOnLoad ? '开' : '关'
}

function getSavedEntries() {
  return Object.values(extensionState.savedWords || {}).sort((left, right) => {
    return new Date(right.savedAt || 0).getTime() - new Date(left.savedAt || 0).getTime()
  })
}

function renderSavedWords() {
  const savedEntries = getSavedEntries()
  refs.toggleSavedButton.textContent = showingSaved ? '返回结果' : `收藏夹 ${savedEntries.length}`

  if (savedEntries.length === 0) {
    refs.savedSection.innerHTML = '<div class="empty-state">还没有收藏生词。识别后把值得复习的词收进词夹。</div>'
    return
  }

  refs.savedSection.innerHTML = savedEntries
    .map((entry) => {
      return `
        <article class="saved-card" data-word="${escapeHtml(entry.word)}">
          <div class="saved-card__top">
            <div>
              <p class="saved-card__word">${escapeHtml(entry.word)}</p>
              <p class="saved-card__meta">${escapeHtml(entry.pageTitle || 'Linswift 云端词库')}</p>
            </div>
            <span class="tag-pill">收藏</span>
          </div>
          <p class="saved-card__meaning">${escapeHtml(entry.meaning || entry.note || '暂无解释')}</p>
          <div class="saved-card__actions">
            <button data-action="locate" data-word="${escapeHtml(entry.word)}">定位</button>
            <button data-action="sentence" data-word="${escapeHtml(entry.word)}">整句</button>
            <button class="danger" data-action="remove" data-word="${escapeHtml(entry.word)}">移除</button>
          </div>
        </article>
      `
    })
    .join('')
}

function renderResults(results) {
  if (!results || results.length === 0) {
    refs.resultsSection.innerHTML = `
      <div class="empty-state">
        当前页还没有识别到明确值得学习的单词。<br />
        可以重新扫描，或同步词库后再试一次。
      </div>
    `
    return
  }

  refs.resultsSection.innerHTML = results
    .map((item) => {
      const saved = Boolean(extensionState.savedWords?.[item.word])
      return `
        <article class="result-card" data-word="${escapeHtml(item.word)}">
          <div class="result-card__top">
            <div>
              <p class="result-card__word">${escapeHtml(item.word)}</p>
              <p class="result-card__meta">出现 ${item.count} 次 · ${escapeHtml(item.difficulty)}${item.rank ? ` · 词频 ${item.rank}` : ''}</p>
            </div>
            <span class="score-pill">${Math.round((item.score || 0) * 100)}%</span>
          </div>

          <div class="tag-row">
            <span class="tag-pill">待学习</span>
            <span class="tag-pill tag-pill--blue">${saved ? '已在生词本' : '加入生词本'}</span>
          </div>

          <div class="meta-chip-row">
            <span class="tag-pill tag-pill--neutral">例句 ${Math.max(1, item.count || 1)}</span>
            <span class="tag-pill tag-pill--neutral">建议复习 1 次</span>
          </div>

          <p class="result-card__meaning">${escapeHtml(item.meaning || item.snippet || '正在加载释义...')}</p>
          <p class="result-card__note">${escapeHtml(item.note || '按词形 / 直译推断')}</p>

          <div class="result-card__actions">
            <button data-action="locate" data-word="${escapeHtml(item.word)}">定位</button>
            <button data-action="known" data-word="${escapeHtml(item.word)}">掌握</button>
            <button class="${saved ? 'danger' : ''}" data-action="save" data-word="${escapeHtml(item.word)}">${saved ? '取消收藏' : '收藏'}</button>
          </div>
        </article>
      `
    })
    .join('')
}

function findResultByWord(word) {
  return (lastAnalysis?.results || []).find((item) => item.word === word) || null
}

function pickSentenceContext(seedWord = '') {
  const segments = Array.isArray(lastPageData?.segments) ? lastPageData.segments : []
  const normalizedWord = String(seedWord || '').toLowerCase()
  const matchedIndex = segments.findIndex((segment) => {
    const text = String(segment?.text || '').toLowerCase()
    return normalizedWord && text.includes(normalizedWord)
  })

  const index = matchedIndex >= 0 ? matchedIndex : 0
  const before = sanitizeSentence(segments[index - 1]?.text || 'The article later argues that the section’s central claim is:')
  const sentence = sanitizeSentence(
    segments[index]?.text || findResultByWord(seedWord)?.snippet || 'Cultural genocide precedes physical genocide.'
  )
  const after = sanitizeSentence(segments[index + 1]?.text || 'The paragraph uses the sentence as the core claim of the section.')

  return { before, sentence, after }
}

async function buildSentenceState(seedWord = '') {
  const context = pickSentenceContext(seedWord)
  const settings = getMergedSettings()
  let translation = '正在生成整句译文...'

  try {
    const response = await sendRuntimeMessage({
      type: 'panel-translate-lines',
      lines: [context.sentence],
      targetLanguage: settings.translationLanguage,
      translationMode: settings.translationMode,
    })
    translation = response.lines?.[0] || context.sentence
  } catch {
    translation = context.sentence
  }

  const vocab = (lastAnalysis?.results || [])
    .slice(0, 5)
    .map((item) => ({
      word: item.word,
      meaning: item.meaning || item.note || item.snippet || '',
    }))

  sentenceState = {
    ...context,
    translation,
    vocab,
  }
}

function renderSentenceView() {
  refs.sentenceModeChip.textContent = `${getHostname(activeTabUrl)} · 划句模式`
  refs.sentenceContextBefore.textContent = sentenceState.before || ' '
  refs.sentenceHighlightText.textContent = sentenceState.sentence || ' '
  refs.sentenceContextAfter.textContent = sentenceState.after || ' '
  refs.sentenceCardTitle.textContent = sentenceState.sentence || '句子翻译'
  refs.sentenceTranslation.textContent = sentenceState.translation || '暂无译文'
  refs.sentenceVocabTitle.textContent = `识别到 ${sentenceState.vocab.length} 个值得学习的词汇：`
  refs.sentenceVocabList.innerHTML = sentenceState.vocab
    .map((entry) => {
      return `
        <span class="vocab-chip">
          <span class="vocab-chip__word">${escapeHtml(entry.word)}</span>
          <span class="vocab-chip__meaning">${escapeHtml(entry.meaning)}</span>
          <span class="vocab-chip__plus">+</span>
        </span>
      `
    })
    .join('')
  refs.collectSentenceWordsButton.textContent = `一键收录 ${sentenceState.vocab.length} 个句中生词`
}

async function updateSettings(patch) {
  const previousSettings = {
    ...getMergedSettings(),
    disabledAutoTranslateHosts: Array.isArray(getMergedSettings().disabledAutoTranslateHosts)
      ? [...getMergedSettings().disabledAutoTranslateHosts]
      : [],
  }

  extensionState.settings = {
    ...previousSettings,
    ...(patch || {}),
  }
  renderSettings()

  try {
    const response = await sendRuntimeMessage({
      type: 'panel-save-settings',
      settings: patch,
    })
    extensionState.settings = {
      ...previousSettings,
      ...response.settings,
    }
    renderSettings()
    return true
  } catch (error) {
    extensionState.settings = previousSettings
    renderSettings()
    setStatus(error instanceof Error ? error.message : '设置保存失败')
    return false
  }
}

async function handleHighlight(word) {
  try {
    await sendToActiveTab({ type: 'highlight-word', word })
    setStatus(`已在页面中定位：${word}`)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '页面定位失败')
  }
}

async function handleKnown(word) {
  const response = await sendRuntimeMessage({
    type: 'panel-add-known',
    word,
  })
  extensionState.knownWords = response.knownWords || extensionState.knownWords
  if (lastAnalysis) {
    lastAnalysis.results = lastAnalysis.results.filter((item) => item.word !== word)
    lastAnalysis.meta.resultCount = lastAnalysis.results.length
  }
  renderStats(lastAnalysis?.meta)
  renderResults(lastAnalysis?.results || [])
  renderSavedWords()
  renderHeaderMeta()
  setStatus(`已标记为掌握：${word}`)
}

async function handleSave(item) {
  const response = await sendRuntimeMessage({
    type: 'panel-toggle-saved',
    entry: {
      word: item.word,
      meaning: item.meaning || '',
      note: item.note || '',
      phonetic: item.phonetic || '',
      pageTitle: lastAnalysis?.meta?.pageTitle || activeTabTitle || '',
      pageUrl: lastAnalysis?.meta?.pageUrl || activeTabUrl || '',
      savedAt: new Date().toISOString(),
    },
  })

  extensionState.savedWords = response.savedWords || extensionState.savedWords
  renderResults(lastAnalysis?.results || [])
  renderSavedWords()
}

async function runScan() {
  try {
    showingSaved = false
    toggleHidden(refs.savedSection, true)
    toggleHidden(refs.resultsSection, false)
    refs.scanButton.textContent = '扫描中...'
    refs.scanButton.disabled = true
    refs.rescanButton.disabled = true

    setStatus('正在抽取当前网页文本...')
    const pageData = await sendToActiveTab({ type: 'extract-page-data' })
    lastPageData = pageData

    const analysisResponse = await sendRuntimeMessage({
      type: 'panel-analyze-page',
      pageData,
    })

    lastAnalysis = analysisResponse.analysis
    extensionState = {
      ...extensionState,
      ...analysisResponse.state,
      settings: {
        ...getMergedSettings(),
        ...(analysisResponse.state?.settings || {}),
      },
    }

    activeTabTitle = pageData?.title || activeTabTitle
    activeTabUrl = pageData?.url || activeTabUrl
    renderHeaderMeta()
    renderSettings()
    renderStats(lastAnalysis.meta)
    renderResults(lastAnalysis.results)
    renderSavedWords()

    if ((lastAnalysis.results || []).length > 0) {
      setStatus(`识别完成，共找到 ${lastAnalysis.results.length} 个候选生词。`)
      const settings = getMergedSettings()
      const enrichResponse = await sendRuntimeMessage({
        type: 'panel-enrich-results',
        results: lastAnalysis.results,
        targetLanguage: settings.translationLanguage,
        translationMode: settings.translationMode,
      })
      lastAnalysis.results = enrichResponse.results || lastAnalysis.results
      renderResults(lastAnalysis.results)
    } else {
      setStatus('当前页还没有识别到明确值得学习的词。')
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '扫描失败，请刷新页面后重试。')
  } finally {
    refs.scanButton.textContent = '先学习'
    refs.scanButton.disabled = false
    refs.rescanButton.disabled = false
  }
}

async function openSentenceView(seedWord = '') {
  if (!lastAnalysis?.results?.length && !lastPageData?.segments?.length) {
    setStatus('请先扫描当前网页，再进入整句模式。')
    return
  }

  setStatus('正在准备整句翻译...')
  await buildSentenceState(seedWord || lastAnalysis?.results?.[0]?.word || '')
  renderSentenceView()
  setView('sentence')
  setStatus('已切换到整句翻译模式。')
}

async function syncCloudState() {
  const response = await sendRuntimeMessage({
    type: 'panel-sync-cloud',
  })
  if (response.state) {
    extensionState = {
      ...extensionState,
      ...response.state,
      settings: {
        ...getMergedSettings(),
        ...(response.state.settings || {}),
      },
    }
  }
  if (response.auth) {
    authState = response.auth
  }
  renderStats(lastAnalysis?.meta)
  renderResults(lastAnalysis?.results || [])
  renderSavedWords()
  renderSettings()
  renderHeaderMeta()
  setStatus(`同步完成，云端词条 ${response.syncSummary?.cloudWords || 0} 条。`)
}

async function initialize() {
  try {
    const [activeTab, panelState] = await Promise.all([
      getActiveTab(),
      sendRuntimeMessage({ type: 'panel-load-state' }),
    ])

    activeTabId = activeTab?.id || null
    activeTabUrl = activeTab?.url || explicitTargetUrl || ''
    activeTabTitle = activeTab?.title || ''
    extensionState = {
      ...extensionState,
      ...panelState.state,
      settings: {
        ...DEFAULT_SETTINGS,
        ...(panelState.state?.settings || {}),
      },
    }
    authState = panelState.auth || authState

    renderHeaderMeta()
    renderStats()
    renderSettings()
    renderSavedWords()

    if (!activeTabId) {
      refs.scanButton.disabled = true
      refs.rescanButton.disabled = true
      setStatus('未找到可扫描的网页标签页。')
    } else if (!/^https?:/i.test(activeTabUrl || '')) {
      refs.scanButton.disabled = true
      refs.rescanButton.disabled = true
      setStatus('当前标签页不是普通网页，暂不支持扫描。')
    } else {
      setStatus('准备扫描当前网页。')
    }

    if (explicitView && ['login', 'translate', 'settings', 'sentence'].includes(explicitView)) {
      setView(explicitView)
      return
    }

    setView(authState.isAuthenticated ? 'translate' : 'login')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '初始化失败')
    setView('login')
  }
}

refs.translateTabButton.addEventListener('click', () => setView('translate'))
refs.settingsTabButton.addEventListener('click', () => setView('settings'))
refs.settingsTranslateTabButton.addEventListener('click', () => setView('translate'))
refs.settingsSettingsTabButton.addEventListener('click', () => setView('settings'))

refs.headerBackButton.addEventListener('click', () => {
  if (currentView === 'sentence') {
    setView('translate')
    return
  }

  if (currentView === 'login' && !authState.isAuthenticated) {
    setView('login')
  }
})

refs.headerCloseButton.addEventListener('click', () => {
  window.close()
})

refs.scanButton.addEventListener('click', runScan)
refs.rescanButton.addEventListener('click', runScan)

refs.toggleSavedButton.addEventListener('click', async () => {
  showingSaved = !showingSaved
  toggleHidden(refs.savedSection, !showingSaved)
  toggleHidden(refs.resultsSection, showingSaved)
  renderSavedWords()
  if (!showingSaved) {
    try {
      await sendToActiveTab({ type: 'clear-highlights' })
    } catch {}
    setStatus('回到识别结果。')
  } else {
    setStatus('正在查看收藏生词。')
  }
})

refs.openSentenceButton.addEventListener('click', () => openSentenceView())
refs.openLoginButton.addEventListener('click', () => setView('login'))

refs.resultsSection.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]')
  if (!button) return

  const word = button.dataset.word || ''
  const action = button.dataset.action || ''
  const item = findResultByWord(word)
  if (!item) return

  if (action === 'locate') {
    await handleHighlight(word)
    return
  }
  if (action === 'known') {
    await handleKnown(word)
    return
  }
  if (action === 'save') {
    await handleSave(item)
  }
})

refs.savedSection.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]')
  if (!button) return

  const word = button.dataset.word || ''
  const savedEntry = extensionState.savedWords?.[word]
  if (!savedEntry) return

  if (button.dataset.action === 'locate') {
    await handleHighlight(word)
    return
  }
  if (button.dataset.action === 'sentence') {
    await openSentenceView(word)
    return
  }
  if (button.dataset.action === 'remove') {
    await handleSave(savedEntry)
  }
})

refs.translationLanguageSelect.addEventListener('change', async () => {
  const saved = await updateSettings({ translationLanguage: refs.translationLanguageSelect.value })
  if (!saved) return
  setStatus(`目标语言已更新：${refs.translationLanguageSelect.options[refs.translationLanguageSelect.selectedIndex]?.text || refs.translationLanguageSelect.value}`)
})

refs.translationModeSelect.addEventListener('change', async () => {
  const saved = await updateSettings({ translationMode: refs.translationModeSelect.value })
  if (!saved) return
  setStatus(`翻译引擎已切换：${refs.translationModeSelect.options[refs.translationModeSelect.selectedIndex]?.text || refs.translationModeSelect.value}`)
})

refs.apiKeyInput.addEventListener('change', async () => {
  const saved = await updateSettings({ moonshotApiKey: refs.apiKeyInput.value.trim() })
  if (!saved) return
  setStatus('Moonshot API Key 已保存。')
})

refs.uiScaleSelect.addEventListener('change', async () => {
  const saved = await updateSettings({ uiScale: Number(refs.uiScaleSelect.value) || DEFAULT_SETTINGS.uiScale })
  if (!saved) return
  setStatus(`界面缩放已更新为 ${Math.round((Number(refs.uiScaleSelect.value) || DEFAULT_SETTINGS.uiScale) * 100)}%。`)
})

refs.inlineTranslateToggle.addEventListener('click', async () => {
  const nextValue = !getMergedSettings().inlineTranslateEnabled
  const saved = await updateSettings({ inlineTranslateEnabled: nextValue })
  if (!saved) return
  setStatus(`页内直译已${nextValue ? '开启' : '关闭'}。`)
})

refs.autoTranslateToggle.addEventListener('click', async () => {
  const nextValue = !getMergedSettings().autoTranslateOnLoad
  const saved = await updateSettings({ autoTranslateOnLoad: nextValue })
  if (!saved) return
  setStatus(`自动翻译网页已${nextValue ? '开启' : '关闭'}。`)
})

refs.settingsSyncButton.addEventListener('click', async () => {
  if (!authState.isAuthenticated) {
    setView('login')
    setStatus('请先登录后再同步。')
    return
  }

  try {
    setButtonLoading(refs.settingsSyncButton, true, '同步中...')
    await syncCloudState()
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '同步失败')
  } finally {
    setButtonLoading(refs.settingsSyncButton, false)
  }
})

refs.settingsAuthButton.addEventListener('click', async () => {
  if (!authState.isAuthenticated) {
    setView('login')
    return
  }

  try {
    const response = await sendRuntimeMessage({ type: 'panel-auth-sign-out' })
    authState = response.auth || authState
    renderHeaderMeta()
    setView('login')
    setStatus('已退出 Linswift 账号。')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '退出失败')
  }
})

refs.loginSubmitButton.addEventListener('click', async () => {
  const email = refs.emailInput.value.trim()
  const password = refs.passwordInput.value

  try {
    setButtonLoading(refs.loginSubmitButton, true, '登录中...')
    const response = await sendRuntimeMessage({
      type: 'panel-auth-sign-in',
      email,
      password,
    })
    authState = response.auth || authState
    if (response.state) {
      extensionState = {
        ...extensionState,
        ...response.state,
        settings: {
          ...DEFAULT_SETTINGS,
          ...(response.state.settings || {}),
        },
      }
    }
    renderHeaderMeta()
    renderSettings()
    renderStats(lastAnalysis?.meta)
    renderSavedWords()
    setView('translate')
    setStatus('登录成功，正在同步云端词库...')
    void syncCloudState().catch((error) => {
      setStatus(error instanceof Error ? error.message : '同步失败')
    })
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '登录失败')
  } finally {
    setButtonLoading(refs.loginSubmitButton, false)
  }
})

refs.forgotPasswordButton.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://www.linswift.com/login' })
})

refs.googleLoginButton.addEventListener('click', () => {
  setStatus('当前插件先支持邮箱登录，Google 登录入口稍后开放。')
})

refs.appleLoginButton.addEventListener('click', () => {
  setStatus('当前插件先支持邮箱登录，Apple 登录入口稍后开放。')
})

refs.registerButton.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://www.linswift.com/register' })
})

refs.saveSentenceButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(sentenceState.sentence || '')
    setStatus('句子已复制到剪贴板。')
  } catch {
    setStatus('当前浏览器不支持复制句子。')
  }
})

refs.speakSentenceButton.addEventListener('click', () => {
  const sentence = sentenceState.sentence || ''
  if (!sentence || !window.speechSynthesis) {
    setStatus('当前环境暂不支持朗读。')
    return
  }

  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(sentence)
  utterance.lang = 'en-US'
  window.speechSynthesis.speak(utterance)
  setStatus('正在朗读整句。')
})

refs.collectSentenceWordsButton.addEventListener('click', async () => {
  try {
    for (const entry of sentenceState.vocab) {
      if (!extensionState.savedWords?.[entry.word]) {
        await handleSave({
          word: entry.word,
          meaning: entry.meaning,
          note: '来自句子翻译',
          phonetic: '',
        })
      }
    }
    setStatus('句中生词已收录到收藏夹。')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '收录失败')
  }
})

refs.sentenceResumeButton.addEventListener('click', () => {
  setStatus('已加入阅读例句，稍后可继续复习。')
})

initialize()
