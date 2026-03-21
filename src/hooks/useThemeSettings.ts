import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
  applyThemeSettings,
  DEFAULT_THEME,
  loadThemeSettings,
  saveThemeSettings,
  type ThemeSettings,
} from '../lib/theme'

function toDbTheme(mode: ThemeSettings['mode']): 'light' | 'dark' | 'auto' {
  if (mode === 'system') return 'auto'
  return mode
}

function fromDbTheme(theme: string | null | undefined): ThemeSettings['mode'] {
  if (theme === 'dark') return 'dark'
  if (theme === 'auto') return 'system'
  return 'light'
}

export function useThemeSettings() {
  const { user } = useAuth()
  const [settings, setSettings] = useState<ThemeSettings>(loadThemeSettings)
  const lastSyncedModeRef = useRef<ThemeSettings['mode'] | null>(null)

  useEffect(() => {
    saveThemeSettings(settings)
    applyThemeSettings(settings)
  }, [settings])

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media || settings.mode !== 'system') return

    const handleChange = () => applyThemeSettings(settings)
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [settings])

  useEffect(() => {
    async function loadRemoteTheme() {
      if (!user) return
      const { data, error } = await supabase
        .from('user_settings')
        .select('theme')
        .eq('user_id', user.id)
        .single()

      if (error || !data?.theme) return
      const remoteMode = fromDbTheme(data.theme)
      lastSyncedModeRef.current = remoteMode
      setSettings((prev) => ({ ...prev, mode: remoteMode }))
    }

    loadRemoteTheme()
  }, [user])

  useEffect(() => {
    async function persistTheme() {
      if (!user) return
      if (lastSyncedModeRef.current === settings.mode) return
      await supabase
        .from('user_settings')
        .update({ theme: toDbTheme(settings.mode) })
        .eq('user_id', user.id)
      lastSyncedModeRef.current = settings.mode
    }

    persistTheme()
  }, [user, settings.mode])

  const updateSettings = useCallback((partial: Partial<ThemeSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }))
  }, [])

  const resetTheme = useCallback(() => {
    setSettings(DEFAULT_THEME)
  }, [])

  return {
    settings,
    updateSettings,
    resetTheme,
  }
}
