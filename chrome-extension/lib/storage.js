const SETTINGS_KEY = 'linswift_extension_settings'
const KNOWN_WORDS_KEY = 'linswift_known_words'
const SAVED_WORDS_KEY = 'linswift_saved_words'
const AUTH_SESSION_KEY = 'linswift_auth_session'

function getFromStorage(keys) {
  return chrome.storage.sync.get(keys)
}

function setInStorage(payload) {
  return chrome.storage.sync.set(payload)
}

function getFromLocalStorage(keys) {
  return chrome.storage.local.get(keys)
}

function setInLocalStorage(payload) {
  return chrome.storage.local.set(payload)
}

export async function loadExtensionState() {
  const state = await getFromStorage([
    SETTINGS_KEY,
    KNOWN_WORDS_KEY,
    SAVED_WORDS_KEY,
  ])

  return {
    settings: state[SETTINGS_KEY] || {},
    knownWords: Array.isArray(state[KNOWN_WORDS_KEY]) ? state[KNOWN_WORDS_KEY] : [],
    savedWords: state[SAVED_WORDS_KEY] || {},
  }
}

export async function saveSettings(settings) {
  await setInStorage({ [SETTINGS_KEY]: settings })
}

export async function saveWordState({ knownWords, savedWords }) {
  const payload = {}
  if (knownWords) payload[KNOWN_WORDS_KEY] = knownWords
  if (savedWords) payload[SAVED_WORDS_KEY] = savedWords
  await setInStorage(payload)
}

export async function addKnownWord(word) {
  const state = await loadExtensionState()
  const next = Array.from(new Set([...state.knownWords, word]))
  await setInStorage({ [KNOWN_WORDS_KEY]: next })
  return next
}

export async function removeKnownWord(word) {
  const state = await loadExtensionState()
  const next = state.knownWords.filter((item) => item !== word)
  await setInStorage({ [KNOWN_WORDS_KEY]: next })
  return next
}

export async function toggleSavedWord(entry) {
  const state = await loadExtensionState()
  const next = { ...state.savedWords }
  if (next[entry.word]) {
    delete next[entry.word]
  } else {
    next[entry.word] = entry
  }
  await setInStorage({ [SAVED_WORDS_KEY]: next })
  return next
}

export async function loadAuthSession() {
  const state = await getFromLocalStorage([AUTH_SESSION_KEY])
  return state[AUTH_SESSION_KEY] || null
}

export async function saveAuthSession(session) {
  await setInLocalStorage({ [AUTH_SESSION_KEY]: session })
}

export async function clearAuthSession() {
  await chrome.storage.local.remove(AUTH_SESSION_KEY)
}
