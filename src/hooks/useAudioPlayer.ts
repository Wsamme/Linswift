/**
 * useAudioPlayer - 基于 TTS 的音频播放器 Hook
 *
 * 功能：
 *  1. 将文本内容按句子拆分，用 TTS 逐句朗读
 *  2. 支持播放/暂停/停止/跳到下一句/跳到上一句
 *  3. 实时追踪播放进度（当前句子索引 + 时间）
 *  4. 支持自定义语速和口音
 *  5. 支持传入结构化的"段落/句子"列表，也支持纯文本自动拆分
 *
 * 使用场景：
 *  - 随行听（ListenGoPage）—— TED/新闻/课程的 TTS 朗读
 *  - 听·图书馆（ListenLibPage）—— 博客/图书内容朗读
 *  - 听歌填字（ListenFillPage）—— 歌词逐行朗读
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { findPreferredVoiceByLang, loadTTSSettings } from '../lib/tts'

// ========== 类型定义 ==========

/** 单个可播放片段（一句话） */
export interface AudioSegment {
  /** 片段文本内容 */
  text: string
  /** 预估时长（秒），根据文本长度自动估算 */
  estimatedDuration?: number
}

/** 播放器状态 */
export interface AudioPlayerState {
  /** 是否正在播放 */
  isPlaying: boolean
  /** 当前播放到第几个片段（0-based） */
  currentIndex: number
  /** 总片段数 */
  totalSegments: number
  /** 当前片段已播放时间（秒） */
  currentTime: number
  /** 估算的总时长（秒） */
  totalDuration: number
  /** 累计已播放时间（秒） */
  elapsedTime: number
  /** 播放进度百分比 0~100 */
  progress: number
}

/** Hook 返回值 */
export interface UseAudioPlayerReturn extends AudioPlayerState {
  /** 开始 / 恢复播放 */
  play: () => void
  /** 暂停播放 */
  pause: () => void
  /** 停止并重置到开头 */
  stop: () => void
  /** 跳到下一句 */
  next: () => void
  /** 跳到上一句 */
  prev: () => void
  /** 跳到指定句子 */
  seekTo: (index: number) => void
  /** 当前倍速 */
  playbackRate: number
  /** 设置倍速 */
  setPlaybackRate: (rate: number) => void
  /** 加载新内容（不自动播放） */
  loadContent: (segments: AudioSegment[]) => void
  /** 加载新内容并自动播放 */
  loadAndPlay: (segments: AudioSegment[]) => void
  /** 格式化时间为 mm:ss */
  formatTime: (seconds: number) => string
}

// ========== 工具函数 ==========

/**
 * 将纯文本按句子拆分为 AudioSegment 数组
 * 支持英文句号、问号、感叹号以及中文句号作为分隔符
 */
export function textToSegments(text: string): AudioSegment[] {
  // 按句子分割（保留分隔符在前一个句子中）
  const sentences = text
    .split(/(?<=[.!?。！？])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)

  return sentences.map(s => ({
    text: s,
    // 粗略估算：英文每分钟约 150 词，平均每词 5 个字符
    // 中文每分钟约 200 字
    estimatedDuration: estimateDuration(s),
  }))
}

/**
 * 估算一段文本的朗读时长（秒）
 */
function estimateDuration(text: string): number {
  // 统计中文字符数
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
  // 统计英文单词数
  const englishWords = text
    .replace(/[\u4e00-\u9fff]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 0).length

  // 中文约 200 字/分钟，英文约 150 词/分钟
  const chineseSec = (chineseChars / 200) * 60
  const englishSec = (englishWords / 150) * 60

  // 至少 1 秒
  return Math.max(1, Math.round(chineseSec + englishSec))
}

/**
 * 格式化秒数为 mm:ss 格式
 */
function formatTimeHelper(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ========== Hook 主体 ==========

export function useAudioPlayer(
  initialSegments: AudioSegment[] = []
): UseAudioPlayerReturn {
  // ===== 片段列表 =====
  const [segments, setSegments] = useState<AudioSegment[]>(initialSegments)

  // ===== 播放状态 =====
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [playbackRate, setPlaybackRateState] = useState(() => loadTTSSettings().rate)
  const [isPaused, setIsPaused] = useState(false)

  // ===== 内部引用（避免闭包问题） =====
  const segmentsRef = useRef(segments)
  const currentIndexRef = useRef(currentIndex)
  const isPlayingRef = useRef(isPlaying)
  const isPausedRef = useRef(isPaused)
  const playbackRateRef = useRef(playbackRate)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  // 同步 ref
  useEffect(() => { segmentsRef.current = segments }, [segments])
  useEffect(() => { currentIndexRef.current = currentIndex }, [currentIndex])
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])
  useEffect(() => { isPausedRef.current = isPaused }, [isPaused])
  useEffect(() => { playbackRateRef.current = playbackRate }, [playbackRate])

  // ===== 计算派生状态 =====
  const totalSegments = segments.length
  const totalDuration = segments.reduce((sum, s) => sum + (s.estimatedDuration || 3), 0)

  // 已播放的总秒数 = 之前片段的时长总和 + 当前片段已播放时间
  const elapsedTime = segments
    .slice(0, currentIndex)
    .reduce((sum, s) => sum + (s.estimatedDuration || 3), 0) + currentTime

  // 进度百分比
  const progress = totalDuration > 0 ? Math.min(100, (elapsedTime / totalDuration) * 100) : 0

  // ===== 清理计时器 =====
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startTimer = useCallback(() => {
    clearTimer()
    timerRef.current = setInterval(() => {
      setCurrentTime((prev) => prev + (0.25 * playbackRateRef.current))
    }, 250)
  }, [clearTimer])

  // ===== 停止 TTS =====
  const stopTTS = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    utteranceRef.current = null
    setIsPaused(false)
  }, [])

  // ===== 播放指定索引的片段 =====
  const speakSegment = useCallback((index: number) => {
    if (!('speechSynthesis' in window)) return
    if (index >= segmentsRef.current.length) {
      // 所有片段播放完毕
      setIsPlaying(false)
      setIsPaused(false)
      clearTimer()
      return
    }

    // 停止之前的朗读
    stopTTS()
    clearTimer()

    const segment = segmentsRef.current[index]
    const settings = loadTTSSettings()

    // 创建新的 utterance
    const utterance = new SpeechSynthesisUtterance(segment.text)

    // 判断语言
    const chineseRatio = (segment.text.match(/[\u4e00-\u9fff]/g) || []).length / segment.text.length
    utterance.lang = chineseRatio > 0.3 ? 'zh-CN' : settings.accent
    utterance.rate = playbackRateRef.current || settings.rate
    utterance.volume = settings.volume
    utterance.pitch = 1

    // 尝试匹配最佳语音
    const bestVoice = findPreferredVoiceByLang(utterance.lang)
    if (bestVoice) utterance.voice = bestVoice

    // 播放结束后自动播放下一句
    utterance.onend = () => {
      clearTimer()
      const nextIndex = currentIndexRef.current + 1
      if (nextIndex < segmentsRef.current.length && isPlayingRef.current) {
        setCurrentIndex(nextIndex)
        setCurrentTime(0)
        speakSegment(nextIndex)
      } else {
        // 播放完毕
        setIsPlaying(false)
        setIsPaused(false)
        setCurrentTime(0)
      }
    }

    // 播放出错时也要处理
    utterance.onerror = () => {
      clearTimer()
      // 尝试跳到下一句
      const nextIndex = currentIndexRef.current + 1
      if (nextIndex < segmentsRef.current.length && isPlayingRef.current) {
        setCurrentIndex(nextIndex)
        setCurrentTime(0)
        speakSegment(nextIndex)
      } else {
        setIsPlaying(false)
        setIsPaused(false)
      }
    }

    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)

    // 启动计时器追踪当前片段播放时间
    setCurrentTime(0)
    startTimer()
  }, [clearTimer, startTimer, stopTTS])

  // ===== 播放 =====
  const play = useCallback(() => {
    if (segments.length === 0) return

    if ('speechSynthesis' in window && isPausedRef.current && utteranceRef.current) {
      window.speechSynthesis.resume()
      setIsPaused(false)
      setIsPlaying(true)
      startTimer()
      return
    }

    // 如果已经播完，从头开始
    if (currentIndex >= segments.length) {
      setCurrentIndex(0)
      setCurrentTime(0)
      setIsPlaying(true)
      setIsPaused(false)
      speakSegment(0)
    } else {
      setIsPlaying(true)
      setIsPaused(false)
      speakSegment(currentIndex)
    }
  }, [segments, currentIndex, speakSegment, startTimer])

  // ===== 暂停 =====
  const pause = useCallback(() => {
    if ('speechSynthesis' in window && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause()
      setIsPaused(true)
      setIsPlaying(false)
      clearTimer()
      return
    }

    setIsPlaying(false)
    setIsPaused(false)
    stopTTS()
    clearTimer()
  }, [stopTTS, clearTimer])

  // ===== 停止并重置 =====
  const stop = useCallback(() => {
    setIsPlaying(false)
    setIsPaused(false)
    setCurrentIndex(0)
    setCurrentTime(0)
    stopTTS()
    clearTimer()
  }, [stopTTS, clearTimer])

  // ===== 下一句 =====
  const next = useCallback(() => {
    const nextIdx = Math.min(currentIndex + 1, segments.length - 1)
    stopTTS()
    clearTimer()
    setCurrentIndex(nextIdx)
    setCurrentTime(0)
    setIsPaused(false)
    if (isPlaying) {
      speakSegment(nextIdx)
    }
  }, [currentIndex, segments.length, isPlaying, stopTTS, clearTimer, speakSegment])

  // ===== 上一句 =====
  const prev = useCallback(() => {
    const prevIdx = Math.max(currentIndex - 1, 0)
    stopTTS()
    clearTimer()
    setCurrentIndex(prevIdx)
    setCurrentTime(0)
    setIsPaused(false)
    if (isPlaying) {
      speakSegment(prevIdx)
    }
  }, [currentIndex, isPlaying, stopTTS, clearTimer, speakSegment])

  // ===== 跳到指定句子 =====
  const seekTo = useCallback((index: number) => {
    const safeIndex = Math.max(0, Math.min(index, segments.length - 1))
    stopTTS()
    clearTimer()
    setCurrentIndex(safeIndex)
    setCurrentTime(0)
    setIsPaused(false)
    if (isPlaying) {
      speakSegment(safeIndex)
    }
  }, [segments.length, isPlaying, stopTTS, clearTimer, speakSegment])

  const setPlaybackRate = useCallback((rate: number) => {
    const safeRate = Math.min(2, Math.max(0.5, rate))
    setPlaybackRateState(safeRate)

    if (isPlayingRef.current) {
      const activeIndex = currentIndexRef.current
      setTimeout(() => {
        speakSegment(activeIndex)
      }, 0)
    }
  }, [speakSegment])

  // ===== 加载新内容 =====
  const loadContent = useCallback((newSegments: AudioSegment[]) => {
    stop()
    setSegments(newSegments)
    setCurrentIndex(0)
    setCurrentTime(0)
  }, [stop])

  // ===== 加载新内容并自动播放 =====
  const loadAndPlay = useCallback((newSegments: AudioSegment[]) => {
    stopTTS()
    clearTimer()
    setSegments(newSegments)
    setCurrentIndex(0)
    setCurrentTime(0)
    setIsPlaying(true)
    setIsPaused(false)
    // 需要延迟一帧让 state 更新后再播放
    setTimeout(() => {
      segmentsRef.current = newSegments
      currentIndexRef.current = 0
      isPlayingRef.current = true
      speakSegment(0)
    }, 50)
  }, [stopTTS, clearTimer, speakSegment])

  // ===== 组件卸载时清理 =====
  useEffect(() => {
    return () => {
      stopTTS()
      clearTimer()
    }
  }, [stopTTS, clearTimer])

  return {
    // 状态
    isPlaying,
    currentIndex,
    totalSegments,
    currentTime,
    totalDuration,
    elapsedTime,
    progress,
    playbackRate,
    // 控制方法
    play,
    pause,
    stop,
    next,
    prev,
    seekTo,
    setPlaybackRate,
    loadContent,
    loadAndPlay,
    formatTime: formatTimeHelper,
  }
}
