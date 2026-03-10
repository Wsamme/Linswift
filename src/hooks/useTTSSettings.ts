/**
 * useTTSSettings — TTS 发音设置的 React Hook
 *
 * 功能：
 * 1. 读取 localStorage 中保存的 TTS 设置
 * 2. 提供 updateSettings 方法来修改并持久化设置
 * 3. 组件状态驱动，修改后自动触发 UI 重新渲染
 * 4. 提供便捷方法：试听当前口音、重置为默认设置等
 */

import { useState, useCallback, useEffect } from 'react'
import {
  type TTSSettings,
  type AccentType,
  DEFAULT_TTS_SETTINGS,
  loadTTSSettings,
  saveTTSSettings,
  speakEnglish,
  stopSpeaking,
  waitForVoices,
} from '../lib/tts'

export function useTTSSettings() {
  // ===== 从 localStorage 初始化设置 =====
  const [settings, setSettings] = useState<TTSSettings>(loadTTSSettings)

  // ===== 可用语音列表（部分浏览器异步加载）=====
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  // 等待浏览器语音列表加载完成
  useEffect(() => {
    waitForVoices().then(setVoices)
  }, [])

  /**
   * 更新部分设置项
   * 自动合并到现有设置中，并保存到 localStorage
   * @param partial - 要更新的设置字段
   */
  const updateSettings = useCallback((partial: Partial<TTSSettings>) => {
    const merged = saveTTSSettings(partial) // 保存到 localStorage
    setSettings(merged)                      // 更新 React 状态
  }, [])

  /**
   * 切换口音
   * @param accent - 新的口音（'en-US' | 'en-GB' | 'en-AU'）
   */
  const setAccent = useCallback((accent: AccentType) => {
    updateSettings({ accent })
  }, [updateSettings])

  /**
   * 设置语速
   * @param rate - 0.5 ~ 2.0
   */
  const setRate = useCallback((rate: number) => {
    // 限制范围在 0.5 ~ 2.0
    const clamped = Math.max(0.5, Math.min(2.0, rate))
    updateSettings({ rate: clamped })
  }, [updateSettings])

  /**
   * 设置音量
   * @param volume - 0 ~ 1
   */
  const setVolume = useCallback((volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume))
    updateSettings({ volume: clamped })
  }, [updateSettings])

  /**
   * 切换布尔开关（自动播放、单词发音、例句发音、循环播放）
   * @param key - 设置项的 key
   */
  const toggleSetting = useCallback((key: 'autoPlay' | 'wordPronounce' | 'sentencePronounce' | 'loopPlay') => {
    updateSettings({ [key]: !settings[key] })
  }, [settings, updateSettings])

  /**
   * 试听当前设置的发音效果
   * 用一个示例句子来演示
   */
  const previewVoice = useCallback((text?: string) => {
    const sampleText = text || 'Hello, welcome to Linswift.'
    speakEnglish(sampleText)
  }, [])

  /**
   * 重置所有设置为默认值
   */
  const resetSettings = useCallback(() => {
    const defaults = saveTTSSettings(DEFAULT_TTS_SETTINGS)
    setSettings(defaults)
  }, [])

  /**
   * 停止当前朗读
   */
  const stop = useCallback(() => {
    stopSpeaking()
  }, [])

  return {
    settings,          // 当前的完整设置对象
    voices,            // 可用的语音列表
    updateSettings,    // 更新部分设置
    setAccent,         // 快捷：设置口音
    setRate,           // 快捷：设置语速
    setVolume,         // 快捷：设置音量
    toggleSetting,     // 快捷：切换布尔开关
    previewVoice,      // 试听
    resetSettings,     // 重置为默认
    stop,              // 停止朗读
  }
}
