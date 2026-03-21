import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  LONG_SENTENCE_COLLECTION_KEY,
  type LongSentenceAnalysis,
  type LongSentenceReadingItem,
  type SavedLongSentenceItem,
} from '../lib/longSentence'

function readCollection(): SavedLongSentenceItem[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(LONG_SENTENCE_COLLECTION_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function getEntryKey(source: 'reading' | 'ai', sentence: string) {
  return `${source}::${sentence.trim().toLowerCase()}`
}

export function useLongSentenceCollection() {
  const [items, setItems] = useState<SavedLongSentenceItem[]>(() => readCollection())

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(LONG_SENTENCE_COLLECTION_KEY, JSON.stringify(items))
  }, [items])

  const saveFromReading = useCallback((item: LongSentenceReadingItem) => {
    setItems((prev) => {
      const key = getEntryKey('reading', item.sentence)
      if (prev.some((entry) => getEntryKey(entry.source, entry.sentence) === key)) {
        return prev
      }

      return [
        {
          id: `reading-${item.id}`,
          source: 'reading',
          sourceId: item.id,
          title: item.title,
          category: item.category,
          sentence: item.sentence,
          savedAt: new Date().toISOString(),
          analysis: item.analysis,
        },
        ...prev,
      ]
    })
  }, [])

  const saveAiAnalysis = useCallback((payload: {
    title?: string
    category?: string
    sentence: string
    analysis: LongSentenceAnalysis
  }) => {
    setItems((prev) => {
      const key = getEntryKey('ai', payload.sentence)
      const existing = prev.find((entry) => getEntryKey(entry.source, entry.sentence) === key)
      if (existing) {
        return prev.map((entry) => entry.id === existing.id ? {
          ...entry,
          title: payload.title || existing.title,
          category: payload.category || existing.category,
          analysis: payload.analysis,
          savedAt: new Date().toISOString(),
        } : entry)
      }

      return [
        {
          id: `ai-${Date.now()}`,
          source: 'ai',
          title: payload.title || 'AI 长难句分析',
          category: payload.category || 'AI 收藏',
          sentence: payload.sentence,
          savedAt: new Date().toISOString(),
          analysis: payload.analysis,
        },
        ...prev,
      ]
    })
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const isSentenceSaved = useCallback((source: 'reading' | 'ai', sentence: string) => {
    const key = getEntryKey(source, sentence)
    return items.some((entry) => getEntryKey(entry.source, entry.sentence) === key)
  }, [items])

  const grouped = useMemo(() => ({
    reading: items.filter((item) => item.source === 'reading'),
    ai: items.filter((item) => item.source === 'ai'),
  }), [items])

  return {
    items,
    grouped,
    saveFromReading,
    saveAiAnalysis,
    removeItem,
    isSentenceSaved,
  }
}
