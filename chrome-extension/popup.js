import { analyzePageText, buildFrequencyData, getDefaultSettings } from './lib/analyzer.js'
import { fetchDictionaryExplanation, fetchLinswiftExplanations } from './lib/ai.js'
import { addKnownWord, loadExtensionState, saveSettings, toggleSavedWord } from './lib/storage.js'

const levelSelect = document.getElementById('levelSelect')
const scanButton = document.getElementById('scanButton')
const showSavedButton = document.getElementById('showSavedButton')
const pageMeta = document.getElementById('pageMeta')
const statusText = document.getElementById('status')
const tokenCount = document.getElementById('tokenCount')
const candidateCount = document.getElementById('candidateCount')
const knownCount = document.getElementById('knownCount')
const resultsSection = document.getElementById('resultsSection')
const savedSection = document.getElementById('savedSection')
const apiKeyInput = document.getElementById('apiKeyInput')
const saveSettingsButton = document.getElementById('saveSettingsButton')
const urlParams = new URLSearchParams(window.location.search)
const explicitTargetUrl = urlParams.get('targetUrl')
const explicitTabId = (() => {
  const raw = urlParams.get('targetTab')
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
})()

let activeTabId = null
let extensionState = {
  settings: getDefaultSettings(),
  knownWords: [],
  savedWords: {},
}
let frequencyDataPromise = null
let lastAnalysis = null
let showingSaved = false

function setStatus(message) {
  statusText.textContent = message
}

function getHostname(url) {
  try {
    return new URL(url).hostname
  } catch {
    return url || '当前网页'
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  return tabs[0] || null
}

async function sendToActiveTab(payload) {
  let targetTabId = explicitTabId ?? activeTabId
  if (!targetTabId && explicitTargetUrl) {
    const matchedTabs = await chrome.tabs.query({ url: explicitTargetUrl })
    targetTabId = matchedTabs[0]?.id || null
  }
  if (!targetTabId) throw new Error('当前没有活动标签页')
  return chrome.tabs.sendMessage(targetTabId, payload)
}

async function loadFrequencyData() {
  if (!frequencyDataPromise) {
    frequencyDataPromise = fetch(chrome.runtime.getURL('assets/30k.txt'))
      .then((response) => response.text())
      .then((text) => buildFrequencyData(text))
  }

  return frequencyDataPromise
}

function renderStats(meta = null) {
  tokenCount.textContent = String(meta?.totalTokens || 0)
  candidateCount.textContent = String(meta?.resultCount || 0)
  knownCount.textContent = String(extensionState.knownWords.length)
}

async function handleHighlight(word) {
  try {
    await sendToActiveTab({ type: 'highlight-word', word })
    setStatus(`已在页面中高亮并定位：${word}`)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '页面高亮失败')
  }
}

async function handleKnown(word) {
  extensionState.knownWords = await addKnownWord(word)
  knownCount.textContent = String(extensionState.knownWords.length)
  if (lastAnalysis) {
    lastAnalysis.results = lastAnalysis.results.filter((item) => item.word !== word)
    lastAnalysis.meta.resultCount = lastAnalysis.results.length
    renderResults(lastAnalysis.results)
    renderStats(lastAnalysis.meta)
  }
  setStatus(`已标记为掌握：${word}`)
}

async function handleSave(entry) {
  extensionState.savedWords = await toggleSavedWord(entry)
  renderResults(lastAnalysis?.results || [])
  renderSavedWords()
}

function renderResults(results) {
  resultsSection.innerHTML = ''

  if (!results || results.length === 0) {
    resultsSection.innerHTML = `
      <div class="empty-state">
        当前页没有识别到明显超出你阶段的词。<br />
        你也可以把阶段切到“高级”再试一次。
      </div>
    `
    return
  }

  results.forEach((item) => {
    const saved = Boolean(extensionState.savedWords[item.word])
    const card = document.createElement('article')
    card.className = 'result-card'
    card.innerHTML = `
      <div class="result-card__top">
        <div>
          <p class="result-card__word">${escapeHtml(item.word)}</p>
          <p class="result-card__meta">出现 ${item.count} 次 · ${escapeHtml(item.difficulty)}${item.rank ? ` · 词频 ${item.rank}` : ''}</p>
        </div>
        <span class="tag">${Math.round(item.score * 100)}%</span>
      </div>
      <p class="result-card__snippet">${escapeHtml(item.snippet)}</p>
      <p class="result-card__meaning">${escapeHtml(item.meaning || '释义加载中...')}</p>
      ${item.note ? `<p class="result-card__note">${escapeHtml(item.note)}</p>` : ''}
      <div class="result-card__actions">
        <button class="ghost" data-action="locate" data-word="${escapeHtml(item.word)}">定位</button>
        <button class="ghost" data-action="known" data-word="${escapeHtml(item.word)}">掌握</button>
        <button class="ghost ${saved ? 'action--danger' : ''}" data-action="save" data-word="${escapeHtml(item.word)}">${saved ? '取消收藏' : '收藏'}</button>
      </div>
    `

    card.querySelector('[data-action="locate"]').addEventListener('click', () => handleHighlight(item.word))
    card.querySelector('[data-action="known"]').addEventListener('click', () => handleKnown(item.word))
    card.querySelector('[data-action="save"]').addEventListener('click', () => handleSave({
      word: item.word,
      meaning: item.meaning || '',
      note: item.note || '',
      pageTitle: lastAnalysis?.meta?.pageTitle || '',
      pageUrl: lastAnalysis?.meta?.pageUrl || '',
      savedAt: new Date().toISOString(),
    }))

    resultsSection.appendChild(card)
  })
}

function renderSavedWords() {
  const savedWords = Object.values(extensionState.savedWords || {}).sort((a, b) => {
    return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
  })

  savedSection.innerHTML = ''
  showSavedButton.textContent = showingSaved ? '返回结果' : `收藏夹 ${savedWords.length}`

  if (savedWords.length === 0) {
    savedSection.innerHTML = '<div class="empty-state">还没有收藏生词。扫描后把值得记住的词留下来。</div>'
    return
  }

  savedWords.forEach((entry) => {
    const card = document.createElement('article')
    card.className = 'saved-card'
    card.innerHTML = `
      <div class="saved-card__top">
        <div>
          <p class="result-card__word">${escapeHtml(entry.word)}</p>
          <p class="saved-card__meta">${escapeHtml(entry.pageTitle || '未记录页面')}</p>
        </div>
        <span class="tag">收藏</span>
      </div>
      <p class="saved-card__meaning">${escapeHtml(entry.meaning || entry.note || '暂无解释')}</p>
      <div class="saved-card__actions">
        <button class="ghost" data-action="locate" data-word="${escapeHtml(entry.word)}">定位</button>
        <button class="ghost action--danger" data-action="remove" data-word="${escapeHtml(entry.word)}">移除</button>
      </div>
    `
    card.querySelector('[data-action="locate"]').addEventListener('click', () => handleHighlight(entry.word))
    card.querySelector('[data-action="remove"]').addEventListener('click', async () => {
      extensionState.savedWords = await toggleSavedWord(entry)
      renderSavedWords()
      renderResults(lastAnalysis?.results || [])
    })
    savedSection.appendChild(card)
  })
}

async function enrichResults(results) {
  const apiKey = extensionState.settings.moonshotApiKey?.trim()
  const targetLanguage = extensionState.settings.translationLanguage || 'zh-CN'
  const words = results.slice(0, 8).map((item) => item.word)
  let aiMap = null

  if (apiKey) {
    setStatus('正在用 AI 补充中文释义...')
    aiMap = await fetchLinswiftExplanations(words, apiKey, targetLanguage)
  }

  for (const item of results) {
    const aiMeaning = aiMap?.[item.word]
    if (aiMeaning) {
      item.meaning = aiMeaning.meaning
      item.note = aiMeaning.note
      continue
    }

    const explanation = await fetchDictionaryExplanation(item.word, targetLanguage)
    item.meaning = explanation.meaning
    item.note = explanation.note
  }

  renderResults(results)
  setStatus(`识别完成，共找到 ${results.length} 个候选生词。`)
}

async function runScan() {
  try {
    showingSaved = false
    savedSection.classList.add('list--hidden')
    resultsSection.classList.remove('list--hidden')

    setStatus('正在抽取当前网页可见文本...')
    const pageData = await sendToActiveTab({ type: 'extract-page-data' })
    const frequencyData = await loadFrequencyData()

    if (!pageData?.segments?.length) {
      renderStats()
      renderResults([])
      setStatus('当前网页可用文本很少，暂时无法识别。')
      return
    }

    setStatus('正在识别可能不会的词...')
    const analysis = analyzePageText(
      pageData,
      frequencyData,
      extensionState.settings,
      extensionState.knownWords
    )

    lastAnalysis = analysis
    pageMeta.textContent = `${pageData.title || '当前网页'} · ${getHostname(pageData.url)}`
    renderStats(analysis.meta)
    renderResults(analysis.results)

    if (analysis.results.length > 0) {
      await enrichResults(analysis.results)
    } else {
      setStatus('当前页没有识别到明显的候选生词。')
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '扫描失败，请刷新页面后重试。')
  }
}

async function initialize() {
  extensionState = await loadExtensionState()
  extensionState.settings = {
    ...getDefaultSettings(),
    ...extensionState.settings,
  }

  renderSavedWords()
  renderStats()

  levelSelect.value = extensionState.settings.level
  apiKeyInput.value = extensionState.settings.moonshotApiKey || ''

  const activeTab = explicitTabId
    ? await chrome.tabs.get(explicitTabId)
    : explicitTargetUrl
      ? (await chrome.tabs.query({ url: explicitTargetUrl }))[0] || null
      : await getActiveTab()
  activeTabId = activeTab?.id || null

  if (!activeTabId) {
    setStatus('未找到可扫描的当前标签页。')
    scanButton.disabled = true
    return
  }

  if (!/^https?:/i.test(activeTab.url || '')) {
    setStatus('当前标签页不是普通网页，Chrome 系统页暂不支持扫描。')
    scanButton.disabled = true
    return
  }

  pageMeta.textContent = activeTab.title
    ? `${activeTab.title} · ${getHostname(activeTab.url)}`
    : '准备扫描当前网页'
}

levelSelect.addEventListener('change', async () => {
  extensionState.settings.level = levelSelect.value
  await saveSettings(extensionState.settings)
  setStatus(`已切换识别阶段：${levelSelect.options[levelSelect.selectedIndex].text}`)
})

scanButton.addEventListener('click', runScan)

showSavedButton.addEventListener('click', async () => {
  showingSaved = !showingSaved
  savedSection.classList.toggle('list--hidden', !showingSaved)
  resultsSection.classList.toggle('list--hidden', showingSaved)
  renderSavedWords()

  if (!showingSaved) {
    await sendToActiveTab({ type: 'clear-highlights' })
    setStatus('回到识别结果。')
  } else {
    setStatus('查看本地收藏的生词。')
  }
})

saveSettingsButton.addEventListener('click', async () => {
  extensionState.settings.moonshotApiKey = apiKeyInput.value.trim()
  await saveSettings(extensionState.settings)
  setStatus('设置已保存。')
})

initialize()
