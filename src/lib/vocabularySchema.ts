export type VocabularySchemaMode = 'modern' | 'legacy' | 'unknown'

const VOCABULARY_SCHEMA_MODE_KEY = 'linswift_vocabulary_schema_mode'

function getStorage() {
  if (typeof window === 'undefined') return null
  return window.localStorage
}

export function getVocabularySchemaMode(): VocabularySchemaMode {
  const storage = getStorage()
  if (!storage) return 'unknown'

  const value = storage.getItem(VOCABULARY_SCHEMA_MODE_KEY)
  if (value === 'modern' || value === 'legacy') return value
  return 'unknown'
}

export function shouldUseLegacyVocabularySchema() {
  return getVocabularySchemaMode() === 'legacy'
}

export function setVocabularySchemaMode(mode: Exclude<VocabularySchemaMode, 'unknown'>) {
  const storage = getStorage()
  if (!storage) return
  storage.setItem(VOCABULARY_SCHEMA_MODE_KEY, mode)
}

export function markVocabularySchemaLegacy() {
  setVocabularySchemaMode('legacy')
}

export function markVocabularySchemaModern() {
  setVocabularySchemaMode('modern')
}

export function rememberVocabularySchemaModeFromRows(rows: Array<Record<string, unknown>>) {
  const firstRow = rows.find(Boolean)
  if (!firstRow) return getVocabularySchemaMode()

  const hasLanguageColumns = Object.prototype.hasOwnProperty.call(firstRow, 'language_code')
    || Object.prototype.hasOwnProperty.call(firstRow, 'language_label')

  setVocabularySchemaMode(hasLanguageColumns ? 'modern' : 'legacy')
  return hasLanguageColumns ? 'modern' : 'legacy'
}
