import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Play, Pause, SkipBack, SkipForward, Check, X as XIcon,
  Volume2, RotateCcw, ChevronRight,
} from 'lucide-react'
import { stopSpeaking, loadTTSSettings } from '../lib/tts'

/**
 * 听歌填字 —— 听力模块
 *
 * 核心玩法：
 *  1. TTS 逐行朗读歌词
 *  2. 读到有填空的行时，自动暂停，等待用户填写
 *  3. 用户填对 → 自动朗读下一行
 *  4. 用户填错 → 显示正确答案，不自动播放（需手动继续）
 *  5. 无填空的行 → 自动连续朗读
 *  6. 支持多首歌曲切换
 *  7. 退出页面自动停止
 */

// ===== 歌词数据结构 =====
interface LyricLine {
  fullText: string       // 完整歌词文本
  blankWord?: string     // 需要填空的单词
  displayText: string    // 带 ___ 占位符的显示文本
}

// ===== 歌曲列表（更多歌曲） =====
const songs = [
  {
    title: 'Shape of You',
    artist: 'Ed Sheeran',
    emoji: '🎵',
    gradient: 'from-[#FF6B6B] to-[#FF8400]',
    shadowColor: 'rgba(255,132,0,0.3)',
    lyrics: [
      { fullText: "The club isn't the best place to find a lover", blankWord: 'lover', displayText: "The club isn't the best place to find a ___" },
      { fullText: "So the bar is where I go", blankWord: 'go', displayText: "So the bar is where I ___" },
      { fullText: "Me and my friends at the table doing shots", blankWord: 'shots', displayText: "Me and my friends at the table doing ___" },
      { fullText: "Drinking fast and then we talk slow", blankWord: 'slow', displayText: "Drinking fast and then we talk ___" },
      { fullText: "Come over and start up a conversation with just me", blankWord: 'conversation', displayText: "Come over and start up a ___ with just me" },
      { fullText: "And trust me I'll give it a chance now", blankWord: 'chance', displayText: "And trust me I'll give it a ___ now" },
      { fullText: "Take my hand, stop, put Van the Man on the jukebox", blankWord: undefined, displayText: "Take my hand, stop, put Van the Man on the jukebox" },
      { fullText: "And then we start to dance, and now I'm singing like", blankWord: 'dance', displayText: "And then we start to ___, and now I'm singing like" },
    ] as LyricLine[],
  },
  {
    title: 'Someone Like You',
    artist: 'Adele',
    emoji: '🎶',
    gradient: 'from-[#8B5CF6] to-[#6366F1]',
    shadowColor: 'rgba(139,92,246,0.3)',
    lyrics: [
      { fullText: "I heard that you're settled down", blankWord: 'settled', displayText: "I heard that you're ___ down" },
      { fullText: "That you found a girl and you're married now", blankWord: 'married', displayText: "That you found a girl and you're ___ now" },
      { fullText: "I heard that your dreams came true", blankWord: 'dreams', displayText: "I heard that your ___ came true" },
      { fullText: "Guess she gave you things I didn't give to you", blankWord: 'give', displayText: "Guess she gave you things I didn't ___ to you" },
      { fullText: "Old friend, why are you so shy?", blankWord: 'shy', displayText: "Old friend, why are you so ___?" },
      { fullText: "Ain't like you to hold back or hide from the light", blankWord: 'light', displayText: "Ain't like you to hold back or hide from the ___" },
      { fullText: "Never mind, I'll find someone like you", blankWord: 'someone', displayText: "Never mind, I'll find ___ like you" },
      { fullText: "I wish nothing but the best for you too", blankWord: 'best', displayText: "I wish nothing but the ___ for you too" },
    ] as LyricLine[],
  },
  {
    title: 'Let It Be',
    artist: 'The Beatles',
    emoji: '🎹',
    gradient: 'from-[#10B981] to-[#059669]',
    shadowColor: 'rgba(16,185,129,0.3)',
    lyrics: [
      { fullText: "When I find myself in times of trouble", blankWord: 'trouble', displayText: "When I find myself in times of ___" },
      { fullText: "Mother Mary comes to me", blankWord: undefined, displayText: "Mother Mary comes to me" },
      { fullText: "Speaking words of wisdom, let it be", blankWord: 'wisdom', displayText: "Speaking words of ___, let it be" },
      { fullText: "And in my hour of darkness", blankWord: 'darkness', displayText: "And in my hour of ___" },
      { fullText: "She is standing right in front of me", blankWord: 'standing', displayText: "She is ___ right in front of me" },
      { fullText: "Speaking words of wisdom, let it be", blankWord: undefined, displayText: "Speaking words of wisdom, let it be" },
      { fullText: "Let it be, let it be, let it be, let it be", blankWord: undefined, displayText: "Let it be, let it be, let it be, let it be" },
      { fullText: "Whisper words of wisdom, let it be", blankWord: 'Whisper', displayText: "___ words of wisdom, let it be" },
    ] as LyricLine[],
  },
  {
    title: 'Yesterday',
    artist: 'The Beatles',
    emoji: '🌅',
    gradient: 'from-[#F59E0B] to-[#D97706]',
    shadowColor: 'rgba(245,158,11,0.3)',
    lyrics: [
      { fullText: "Yesterday, all my troubles seemed so far away", blankWord: 'troubles', displayText: "Yesterday, all my ___ seemed so far away" },
      { fullText: "Now it looks as though they're here to stay", blankWord: 'stay', displayText: "Now it looks as though they're here to ___" },
      { fullText: "Oh, I believe in yesterday", blankWord: 'believe', displayText: "Oh, I ___ in yesterday" },
      { fullText: "Suddenly, I'm not half the man I used to be", blankWord: 'Suddenly', displayText: "___, I'm not half the man I used to be" },
      { fullText: "There's a shadow hanging over me", blankWord: 'shadow', displayText: "There's a ___ hanging over me" },
      { fullText: "Oh, yesterday came suddenly", blankWord: 'suddenly', displayText: "Oh, yesterday came ___" },
      { fullText: "Why she had to go, I don't know, she wouldn't say", blankWord: 'say', displayText: "Why she had to go, I don't know, she wouldn't ___" },
      { fullText: "I said something wrong, now I long for yesterday", blankWord: 'wrong', displayText: "I said something ___, now I long for yesterday" },
    ] as LyricLine[],
  },
  {
    title: 'Perfect',
    artist: 'Ed Sheeran',
    emoji: '💕',
    gradient: 'from-[#EC4899] to-[#BE185D]',
    shadowColor: 'rgba(236,72,153,0.3)',
    lyrics: [
      { fullText: "I found a love for me", blankWord: 'love', displayText: "I found a ___ for me" },
      { fullText: "Darling just dive right in and follow my lead", blankWord: 'follow', displayText: "Darling just dive right in and ___ my lead" },
      { fullText: "Well I found a girl, beautiful and sweet", blankWord: 'beautiful', displayText: "Well I found a girl, ___ and sweet" },
      { fullText: "Oh I never knew you were the someone waiting for me", blankWord: 'waiting', displayText: "Oh I never knew you were the someone ___ for me" },
      { fullText: "Cause we were just kids when we fell in love", blankWord: undefined, displayText: "Cause we were just kids when we fell in love" },
      { fullText: "Not knowing what it was", blankWord: 'knowing', displayText: "Not ___ what it was" },
      { fullText: "I will not give you up this time", blankWord: 'give', displayText: "I will not ___ you up this time" },
      { fullText: "Baby I'm dancing in the dark with you between my arms", blankWord: 'dancing', displayText: "Baby I'm ___ in the dark with you between my arms" },
    ] as LyricLine[],
  },
  {
    title: 'Imagine',
    artist: 'John Lennon',
    emoji: '☮️',
    gradient: 'from-[#3B82F6] to-[#1D4ED8]',
    shadowColor: 'rgba(59,130,246,0.3)',
    lyrics: [
      { fullText: "Imagine there's no heaven", blankWord: 'heaven', displayText: "Imagine there's no ___" },
      { fullText: "It's easy if you try", blankWord: 'easy', displayText: "It's ___ if you try" },
      { fullText: "No hell below us", blankWord: undefined, displayText: "No hell below us" },
      { fullText: "Above us only sky", blankWord: 'sky', displayText: "Above us only ___" },
      { fullText: "Imagine all the people living for today", blankWord: 'living', displayText: "Imagine all the people ___ for today" },
      { fullText: "Imagine there's no countries", blankWord: 'countries', displayText: "Imagine there's no ___" },
      { fullText: "It isn't hard to do", blankWord: undefined, displayText: "It isn't hard to do" },
      { fullText: "Nothing to kill or die for", blankWord: 'die', displayText: "Nothing to kill or ___ for" },
    ] as LyricLine[],
  },
]

// ===== 填空状态 =====
type BlankStatus = 'locked' | 'active' | 'correct' | 'wrong'

export default function ListenFillPage() {
  const navigate = useNavigate()

  // ===== 歌曲选择 =====
  const [songIndex, setSongIndex] = useState(0)
  const [showSongPicker, setShowSongPicker] = useState(false) // 歌曲选择弹窗
  const song = songs[songIndex]

  // ===== 播放状态 =====
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentLineIndex, setCurrentLineIndex] = useState(0) // 当前朗读到的行
  const isPlayingRef = useRef(false)
  const currentLineRef = useRef(0)

  // ===== 填空状态（每首歌独立管理） =====
  const initBlankStatuses = useCallback((lyrics: LyricLine[]) => {
    return lyrics.map((line, i) => {
      if (!line.blankWord) return 'correct' as BlankStatus // 无填空的行直接标记为正确
      return (i === 0 ? 'active' : 'locked') as BlankStatus
    })
  }, [])

  const [blankStatuses, setBlankStatuses] = useState<BlankStatus[]>(initBlankStatuses(song.lyrics))
  const [userInputs, setUserInputs] = useState<Record<number, string>>({})
  const [activeInput, setActiveInput] = useState('')
  const [score, setScore] = useState({ correct: 0, wrong: 0 })

  // blankStatuses 的 ref，给 speakLine 内部用
  const blankStatusesRef = useRef(blankStatuses)
  useEffect(() => { blankStatusesRef.current = blankStatuses }, [blankStatuses])

  // ===== 找到第一个 active 的填空行索引 =====
  const activeLineIndex = blankStatuses.findIndex(s => s === 'active')

  // 同步 ref
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])
  useEffect(() => { currentLineRef.current = currentLineIndex }, [currentLineIndex])

  // ===== 朗读指定行（只读一行，不会自动连续） =====
  const speakLine = useCallback((index: number) => {
    if (index >= song.lyrics.length) {
      setIsPlaying(false)
      return
    }

    const line = song.lyrics[index]
    setCurrentLineIndex(index)

    if (!('speechSynthesis' in window)) return
    stopSpeaking()

    const settings = loadTTSSettings()
    const utterance = new SpeechSynthesisUtterance(line.fullText)
    utterance.lang = settings.accent
    utterance.rate = settings.rate * 0.85 // 稍微放慢，方便听歌填字
    utterance.volume = settings.volume
    utterance.pitch = 1

    const voices = window.speechSynthesis.getVoices()
    const bestVoice = voices.find(v => v.lang === settings.accent)
      || voices.find(v => v.lang.startsWith('en'))
    if (bestVoice) utterance.voice = bestVoice

    // 关键逻辑：当前行朗读完后
    utterance.onend = () => {
      // 当前行有填空且尚未作答 → 停下来等用户填写
      if (line.blankWord && blankStatusesRef.current[index] === 'active') {
        setIsPlaying(false) // 暂停，等待用户填写
        return
      }

      // 当前行无填空，或已作答 → 检查下一行
      if (isPlayingRef.current) {
        const nextIdx = index + 1
        if (nextIdx < song.lyrics.length) {
          // 下一行有待填空 → 朗读下一行后会停下
          setTimeout(() => {
            if (isPlayingRef.current) {
              speakLine(nextIdx)
            }
          }, 400)
        } else {
          setIsPlaying(false) // 全部播放完毕
        }
      }
    }

    utterance.onerror = () => {
      if (isPlayingRef.current) {
        const nextIdx = index + 1
        if (nextIdx < song.lyrics.length) {
          setTimeout(() => speakLine(nextIdx), 300)
        } else {
          setIsPlaying(false)
        }
      }
    }

    window.speechSynthesis.speak(utterance)
  }, [song.lyrics])

  // ===== 播放/暂停 =====
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false)
      stopSpeaking()
    } else {
      setIsPlaying(true)
      speakLine(currentLineIndex)
    }
  }, [isPlaying, currentLineIndex, speakLine])

  // ===== 上一句 =====
  const prevLine = useCallback(() => {
    const prev = Math.max(0, currentLineIndex - 1)
    stopSpeaking()
    setCurrentLineIndex(prev)
    if (isPlaying) speakLine(prev)
  }, [currentLineIndex, isPlaying, speakLine])

  // ===== 下一句 =====
  const nextLine = useCallback(() => {
    const next = Math.min(song.lyrics.length - 1, currentLineIndex + 1)
    stopSpeaking()
    setCurrentLineIndex(next)
    if (isPlaying) speakLine(next)
  }, [currentLineIndex, song.lyrics.length, isPlaying, speakLine])

  // ===== 重新朗读当前行 =====
  const replayLine = useCallback((lineIndex: number) => {
    stopSpeaking()
    // 单行重听，不影响 isPlaying 状态
    setCurrentLineIndex(lineIndex)

    if (!('speechSynthesis' in window)) return
    const line = song.lyrics[lineIndex]
    const settings = loadTTSSettings()
    const utterance = new SpeechSynthesisUtterance(line.fullText)
    utterance.lang = settings.accent
    utterance.rate = settings.rate * 0.85
    utterance.volume = settings.volume
    utterance.pitch = 1

    const voices = window.speechSynthesis.getVoices()
    const bestVoice = voices.find(v => v.lang === settings.accent)
      || voices.find(v => v.lang.startsWith('en'))
    if (bestVoice) utterance.voice = bestVoice

    // 单行重听：朗读完就停下来，不会自动继续
    utterance.onend = () => { /* 单行重听结束，不做任何事 */ }
    utterance.onerror = () => { /* 忽略错误 */ }

    window.speechSynthesis.speak(utterance)
  }, [song.lyrics])

  // ===== 提交填空答案 =====
  const submitAnswer = useCallback(() => {
    if (activeLineIndex < 0) return
    const line = song.lyrics[activeLineIndex]
    if (!line.blankWord) return

    const userAnswer = activeInput.trim().toLowerCase()
    const correctAnswer = line.blankWord.toLowerCase()
    const isCorrect = userAnswer === correctAnswer

    // 更新填空状态
    setBlankStatuses(prev => {
      const newStatuses = [...prev]
      newStatuses[activeLineIndex] = isCorrect ? 'correct' : 'wrong'
      // 解锁下一个填空行
      const nextBlank = newStatuses.findIndex((s, i) => i > activeLineIndex && s === 'locked')
      if (nextBlank >= 0) {
        newStatuses[nextBlank] = 'active'
      }
      return newStatuses
    })

    // 记录用户输入
    setUserInputs(prev => ({ ...prev, [activeLineIndex]: activeInput.trim() }))

    // 更新分数
    setScore(prev => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      wrong: prev.wrong + (isCorrect ? 0 : 1),
    }))

    // 清空输入
    setActiveInput('')

    // 填对了 → 自动播放下一行
    if (isCorrect) {
      const nextIdx = activeLineIndex + 1
      if (nextIdx < song.lyrics.length) {
        setTimeout(() => {
          setIsPlaying(true)
          isPlayingRef.current = true
          speakLine(nextIdx)
        }, 600) // 给一个短暂的反馈时间后自动播放下一行
      }
    }
    // 填错了 → 不自动播放，用户可以手动按播放或重听
  }, [activeLineIndex, activeInput, song.lyrics, speakLine])

  // ===== 切换歌曲 =====
  const switchSong = useCallback((newIndex: number) => {
    stopSpeaking()
    setIsPlaying(false)
    setSongIndex(newIndex)
    setCurrentLineIndex(0)
    setBlankStatuses(initBlankStatuses(songs[newIndex].lyrics))
    setUserInputs({})
    setActiveInput('')
    setScore({ correct: 0, wrong: 0 })
    setShowSongPicker(false)
  }, [initBlankStatuses])

  // ===== 重新开始当前歌曲 =====
  const restart = useCallback(() => {
    stopSpeaking()
    setIsPlaying(false)
    setCurrentLineIndex(0)
    setBlankStatuses(initBlankStatuses(song.lyrics))
    setUserInputs({})
    setActiveInput('')
    setScore({ correct: 0, wrong: 0 })
  }, [song.lyrics, initBlankStatuses])

  // ===== 退出页面自动停止 =====
  useEffect(() => {
    return () => {
      stopSpeaking()
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  // ===== 播放进度 =====
  const progress = song.lyrics.length > 0
    ? ((currentLineIndex + 1) / song.lyrics.length) * 100
    : 0

  const totalBlanks = song.lyrics.filter(l => l.blankWord).length
  const isAllDone = !blankStatuses.includes('locked') && !blankStatuses.includes('active')

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
      {/* ===== Header ===== */}
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={() => { stopSpeaking(); navigate(-1) }} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">听歌填字</h1>
        {/* 分数显示 */}
        <div className="ml-auto flex items-center gap-3 text-[12px]">
          <span className="text-[var(--color-success)] font-bold">✓ {score.correct}</span>
          <span className="text-[var(--color-error)] font-bold">✗ {score.wrong}</span>
        </div>
      </div>

      {/* ===== 专辑封面 + 信息 ===== */}
      <div className="flex flex-col items-center px-5 mb-4">
        <div
          className={`w-[120px] h-[120px] rounded-[18px] bg-gradient-to-br ${song.gradient} flex items-center justify-center mb-3 cursor-pointer active:scale-95 transition-transform`}
          style={{ boxShadow: `0 8px 30px ${song.shadowColor}` }}
          onClick={() => setShowSongPicker(true)}
        >
          <span className="text-[48px]">{song.emoji}</span>
        </div>
        <h2 className="text-[18px] font-bold text-[var(--color-foreground)]">{song.title}</h2>
        <p className="text-[13px] text-[var(--color-muted)] mb-1">{song.artist}</p>
        {/* 点击切换歌曲 */}
        <button
          onClick={() => setShowSongPicker(true)}
          className="text-[11px] text-[var(--color-primary)] flex items-center gap-1"
        >
          切换歌曲 <ChevronRight size={12} />
        </button>
      </div>

      {/* ===== 播放进度条 ===== */}
      <div className="px-8 mb-3">
        <div className="h-1 bg-[var(--color-background-secondary)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--color-primary)] rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-[var(--color-muted)]">
            第 {currentLineIndex + 1} / {song.lyrics.length} 行
          </span>
          <span className="text-[10px] text-[var(--color-muted)]">
            {score.correct + score.wrong} / {totalBlanks} 已填
          </span>
        </div>
      </div>

      {/* ===== 播放控制 ===== */}
      <div className="flex items-center justify-center gap-8 mb-4">
        <button className="p-2 active:scale-90 transition-transform" onClick={prevLine}>
          <SkipBack size={22} className="text-[var(--color-foreground)]" />
        </button>
        <button
          onClick={togglePlay}
          className="w-14 h-14 rounded-full bg-[var(--color-primary)] flex items-center justify-center active:scale-95 transition-transform"
        >
          {isPlaying
            ? <Pause size={24} className="text-white" />
            : <Play size={24} className="text-white ml-1" />
          }
        </button>
        <button className="p-2 active:scale-90 transition-transform" onClick={nextLine}>
          <SkipForward size={22} className="text-[var(--color-foreground)]" />
        </button>
      </div>

      {/* ===== 提示信息 ===== */}
      {activeLineIndex >= 0 && !isPlaying && (
        <div className="mx-5 mb-3 px-3 py-2 bg-[var(--color-primary-light)] rounded-[var(--radius-xs)] text-center">
          <p className="text-[11px] text-[var(--color-primary)]">
            🎧 听清后填写空白单词，填对自动播放下一句
          </p>
        </div>
      )}

      {/* ===== 歌词填空区域 ===== */}
      <div className="flex-1 px-5 overflow-y-auto pb-8">
        <h3 className="text-[14px] font-bold text-[var(--color-foreground)] mb-3 font-secondary">歌词填空</h3>
        <div className="space-y-3">
          {song.lyrics.map((line, i) => {
            const status = blankStatuses[i]
            const isCurrentlyReading = currentLineIndex === i
            const parts = line.displayText.split('___')

            return (
              <div key={i} className={`p-3 rounded-[var(--radius-sm)] transition-all ${
                isCurrentlyReading
                  ? 'ring-2 ring-[var(--color-primary)]/40'
                  : ''
              } ${
                status === 'active'
                  ? 'bg-[var(--color-primary-light)] border border-[var(--color-primary)]/30'
                  : status === 'correct' && line.blankWord
                    ? 'bg-[var(--color-success)]/5'
                    : status === 'wrong'
                      ? 'bg-[var(--color-error)]/5'
                      : status === 'locked'
                        ? 'bg-[var(--color-background-secondary)] opacity-60'
                        : 'bg-[var(--color-background-secondary)]/50'
              }`}>
                <div className="flex items-start gap-2">
                  {/* 朗读按钮 —— 点击可重新朗读这行 */}
                  <button
                    className="p-1 shrink-0 mt-0.5 active:scale-90 transition-transform"
                    onClick={() => replayLine(i)}
                  >
                    <Volume2 size={14} className={
                      isCurrentlyReading && isPlaying
                        ? 'text-[var(--color-primary)]'
                        : 'text-[var(--color-muted)]'
                    } />
                  </button>

                  {/* 歌词内容 */}
                  <p className="text-[14px] text-[var(--color-foreground)] leading-relaxed flex-1">
                    {!line.blankWord ? (
                      <span>{line.fullText}</span>
                    ) : (
                      <>
                        {parts[0]}
                        {status === 'active' ? (
                          <span className="inline-flex items-center gap-1">
                            <input
                              type="text"
                              value={activeInput}
                              onChange={(e) => setActiveInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') submitAnswer()
                              }}
                              className="inline-block w-[120px] mx-1 px-2 py-0.5 border-b-2 border-[var(--color-primary)] bg-transparent text-[var(--color-primary)] font-semibold outline-none text-center"
                              placeholder="填写..."
                              autoFocus
                            />
                            <button
                              onClick={submitAnswer}
                              className="px-2 py-0.5 bg-[var(--color-primary)] text-white rounded text-[11px] font-bold active:scale-90 transition-transform"
                            >
                              确认
                            </button>
                          </span>
                        ) : status === 'correct' ? (
                          <span className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 bg-[var(--color-success)]/10 rounded text-[var(--color-success)] font-semibold">
                            {line.blankWord} <Check size={12} />
                          </span>
                        ) : status === 'wrong' ? (
                          <span className="inline-flex items-center gap-1 mx-1">
                            <span className="px-2 py-0.5 bg-[var(--color-error)]/10 rounded text-[var(--color-error)] font-semibold line-through">
                              {userInputs[i] || '?'}
                            </span>
                            <span className="px-2 py-0.5 bg-[var(--color-success)]/10 rounded text-[var(--color-success)] font-semibold">
                              {line.blankWord}
                            </span>
                            <XIcon size={12} className="text-[var(--color-error)]" />
                          </span>
                        ) : (
                          <span className="inline-block mx-1 w-[80px] border-b border-dashed border-[var(--color-muted)] text-center text-[var(--color-muted)]">
                            ···
                          </span>
                        )}
                        {parts[1]}
                      </>
                    )}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        {/* ===== 完成提示 ===== */}
        {isAllDone && (
          <div className="mt-6 p-4 bg-[var(--color-card)] rounded-[var(--radius-md)] text-center" style={{ boxShadow: 'var(--shadow-card)' }}>
            <p className="text-[24px] mb-2">🎉</p>
            <p className="text-[16px] font-bold text-[var(--color-foreground)] mb-1">填写完毕！</p>
            <p className="text-[13px] text-[var(--color-muted)] mb-3">
              正确 {score.correct} / 错误 {score.wrong} / 总共 {totalBlanks}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={restart}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)] text-[13px] font-semibold text-[var(--color-foreground)]"
              >
                <RotateCcw size={14} /> 重新来过
              </button>
              <button
                onClick={() => setShowSongPicker(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] rounded-[var(--radius-sm)] text-[13px] font-semibold text-white"
              >
                换一首歌
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== 歌曲选择弹窗 ===== */}
      {showSongPicker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          {/* 背景遮罩 */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowSongPicker(false)}
          />
          {/* 弹窗内容 */}
          <div className="relative w-full max-w-[430px] bg-[var(--color-background)] rounded-t-[20px] p-5 pb-8 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold text-[var(--color-foreground)]">选择歌曲</h3>
              <button onClick={() => setShowSongPicker(false)} className="p-1">
                <XIcon size={20} className="text-[var(--color-muted)]" />
              </button>
            </div>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {songs.map((s, i) => (
                <div
                  key={i}
                  onClick={() => switchSong(i)}
                  className={`flex items-center gap-3 p-3 rounded-[var(--radius-sm)] cursor-pointer active:scale-[0.98] transition-transform ${
                    i === songIndex
                      ? 'bg-[var(--color-primary-light)] border border-[var(--color-primary)]/20'
                      : 'bg-[var(--color-card)]'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-[10px] bg-gradient-to-br ${s.gradient} flex items-center justify-center shrink-0`}>
                    <span className="text-[24px]">{s.emoji}</span>
                  </div>
                  <div className="flex-1">
                    <p className={`text-[14px] font-semibold ${
                      i === songIndex ? 'text-[var(--color-primary)]' : 'text-[var(--color-foreground)]'
                    }`}>{s.title}</p>
                    <p className="text-[12px] text-[var(--color-muted)]">{s.artist} · {s.lyrics.filter(l => l.blankWord).length} 个填空</p>
                  </div>
                  {i === songIndex && (
                    <Check size={18} className="text-[var(--color-primary)] shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
