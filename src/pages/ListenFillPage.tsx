import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft, Play, Pause, SkipBack, SkipForward, Check, X as XIcon,
  Volume2, RotateCcw,
} from 'lucide-react'
import { stopSpeaking, loadTTSSettings } from '../lib/tts'
import { supabase, type ListeningContent } from '../lib/supabase'
import { useLogicalBack } from '../hooks/useLogicalBack'

interface LyricLine {
  fullText: string
  blankWord?: string
  displayText: string
}

interface SongData {
  id: number
  title: string
  artist: string
  lyrics: LyricLine[]
}

type BlankStatus = 'locked' | 'active' | 'correct' | 'wrong'

const PUBLIC_DOMAIN_SONGS: Array<{ id: number; title: string; artist: string; transcript: string }> = [
  {
    id: -1,
    title: 'Twinkle Twinkle Little Star',
    artist: 'Public Domain / Traditional',
    transcript: `Twinkle, twinkle, little star, how I wonder what you are.
Up above the world so high, like a diamond in the sky.
When the blazing sun is gone, when he nothing shines upon.
Then you show your little light, twinkle, twinkle, all the night.
Then the traveler in the dark, thanks you for your tiny spark.
He could not see which way to go, if you did not twinkle so.
In the dark blue sky you keep, and often through my curtains peep.
For you never shut your eye, till the sun is in the sky.`,
  },
]

function buildLyrics(transcript: string): LyricLine[] {
  const sentences = transcript
    .split(/(?<=[.!?。！？])\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)

  return sentences.map((line, idx) => {
    const words = line.match(/[A-Za-z]+/g) || []
    const blankCandidate = words
      .map((w) => w.trim())
      .filter((w) => w.length >= 5)
      .sort((a, b) => b.length - a.length)[0]

    if (!blankCandidate || idx % 2 === 1) {
      return { fullText: line, displayText: line }
    }

    return {
      fullText: line,
      blankWord: blankCandidate,
      displayText: line.replace(new RegExp(`\\b${blankCandidate}\\b`, 'i'), '___'),
    }
  })
}

export default function ListenFillPage() {
  const goBack = useLogicalBack('/listening')
  const [songs, setSongs] = useState<SongData[]>([])
  const [songIndex, setSongIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentLineIndex, setCurrentLineIndex] = useState(0)
  const [blankStatuses, setBlankStatuses] = useState<BlankStatus[]>([])
  const [userInputs, setUserInputs] = useState<Record<number, string>>({})
  const [activeInput, setActiveInput] = useState('')
  const [score, setScore] = useState({ correct: 0, wrong: 0 })
  const isPlayingRef = useRef(false)
  const blankStatusesRef = useRef<BlankStatus[]>([])

  const song = songs[songIndex]

  const initBlankStatuses = useCallback((lyrics: LyricLine[]) => {
    return lyrics.map((line, idx) => {
      if (!line.blankWord) return 'correct' as BlankStatus
      return (idx === 0 ? 'active' : 'locked') as BlankStatus
    })
  }, [])

  useEffect(() => {
    async function loadSongs() {
      const { data } = await supabase
        .from('listening_content')
        .select('*')
        .eq('category', 'music')
        .not('transcript', 'is', null)
        .order('created_at', { ascending: false })
      const list = (data || [])
        .filter((item) => item.transcript)
        .map((item: ListeningContent) => ({
          id: item.id,
          title: item.title,
          artist: 'Music Library',
          lyrics: buildLyrics(item.transcript || ''),
        }))
      const pdList = PUBLIC_DOMAIN_SONGS.map((item) => ({
        id: item.id,
        title: item.title,
        artist: item.artist,
        lyrics: buildLyrics(item.transcript),
      }))
      const merged = [...pdList, ...list]
      setSongs(merged)
      if (merged.length > 0) {
        const statuses = initBlankStatuses(merged[0].lyrics)
        setBlankStatuses(statuses)
        blankStatusesRef.current = statuses
      }
    }
    loadSongs()
    return () => stopSpeaking()
  }, [initBlankStatuses])

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  useEffect(() => {
    blankStatusesRef.current = blankStatuses
  }, [blankStatuses])

  const activeLineIndex = useMemo(() => blankStatuses.findIndex((s) => s === 'active'), [blankStatuses])

  const speakLine = useCallback((index: number) => {
    if (!song || index >= song.lyrics.length) {
      setIsPlaying(false)
      return
    }
    const line = song.lyrics[index]
    setCurrentLineIndex(index)
    stopSpeaking()
    const settings = loadTTSSettings()
    const utterance = new SpeechSynthesisUtterance(line.fullText)
    utterance.lang = settings.accent
    utterance.rate = settings.rate * 0.85
    utterance.volume = settings.volume
    utterance.pitch = 1
    utterance.onend = () => {
      if (line.blankWord && blankStatusesRef.current[index] === 'active') {
        setIsPlaying(false)
        return
      }
      if (!isPlayingRef.current) return
      const next = index + 1
      if (next < song.lyrics.length) {
        setTimeout(() => { if (isPlayingRef.current) speakLine(next) }, 350)
      } else {
        setIsPlaying(false)
      }
    }
    window.speechSynthesis.speak(utterance)
  }, [song])

  const togglePlay = () => {
    if (!song) return
    if (isPlaying) {
      setIsPlaying(false)
      stopSpeaking()
    } else {
      setIsPlaying(true)
      speakLine(currentLineIndex)
    }
  }

  const submitAnswer = () => {
    if (!song || activeLineIndex < 0) return
    const line = song.lyrics[activeLineIndex]
    if (!line.blankWord) return
    const ok = activeInput.trim().toLowerCase() === line.blankWord.toLowerCase()
    setBlankStatuses((prev) => {
      const next = [...prev]
      next[activeLineIndex] = ok ? 'correct' : 'wrong'
      const nextBlank = next.findIndex((s, idx) => idx > activeLineIndex && s === 'locked')
      if (nextBlank >= 0) next[nextBlank] = 'active'
      return next
    })
    setUserInputs((prev) => ({ ...prev, [activeLineIndex]: activeInput.trim() }))
    setScore((prev) => ({ correct: prev.correct + (ok ? 1 : 0), wrong: prev.wrong + (ok ? 0 : 1) }))
    setActiveInput('')
    if (ok) {
      const nextIdx = activeLineIndex + 1
      if (nextIdx < song.lyrics.length) {
        setTimeout(() => {
          setIsPlaying(true)
          speakLine(nextIdx)
        }, 500)
      }
    }
  }

  const restart = () => {
    if (!song) return
    stopSpeaking()
    setIsPlaying(false)
    setCurrentLineIndex(0)
    setBlankStatuses(initBlankStatuses(song.lyrics))
    setUserInputs({})
    setActiveInput('')
    setScore({ correct: 0, wrong: 0 })
  }

  const switchSong = (idx: number) => {
    const nextSong = songs[idx]
    if (!nextSong) return
    stopSpeaking()
    setSongIndex(idx)
    setCurrentLineIndex(0)
    const statuses = initBlankStatuses(nextSong.lyrics)
    setBlankStatuses(statuses)
    blankStatusesRef.current = statuses
    setUserInputs({})
    setActiveInput('')
    setScore({ correct: 0, wrong: 0 })
    setIsPlaying(false)
  }

  if (!song) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4">
          <button onClick={goBack} className="p-1">
            <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
          </button>
          <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">听歌填字</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[13px] text-[var(--color-muted)]">暂无 music 内容，请先在 `listening_content` 写入数据。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={() => { stopSpeaking(); goBack() }} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">听歌填字</h1>
      </div>

      <div className="mx-5 mb-4 p-4 rounded-[var(--radius-md)] text-white" style={{ background: 'linear-gradient(135deg, #FF6B6B, #FF8400)' }}>
        <p className="text-[11px] text-white/70 mb-1">当前内容</p>
        <h3 className="text-[16px] font-bold mb-1">{song.title}</h3>
        <p className="text-[12px] text-white/80">{song.artist}</p>
      </div>

      <div className="mx-5 mb-4 flex gap-2 overflow-x-auto">
        {songs.map((item, idx) => (
          <button
            key={item.id}
            onClick={() => switchSong(idx)}
            className={`px-3 py-1.5 rounded-full text-[12px] shrink-0 ${
              idx === songIndex ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-background-secondary)] text-[var(--color-muted)]'
            }`}
          >
            {item.title}
          </button>
        ))}
      </div>

      <div className="px-5 pb-4 flex-1 overflow-y-auto">
        <div className="space-y-2">
          {song.lyrics.map((line, idx) => {
            const status = blankStatuses[idx]
            const isCurrent = idx === currentLineIndex
            return (
              <div key={`${song.id}-${idx}`} className={`p-3 rounded-[var(--radius-sm)] border ${isCurrent ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]' : 'border-[var(--color-border)] bg-[var(--color-card)]'}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] text-[var(--color-foreground)] leading-relaxed">{line.displayText}</p>
                  <button onClick={() => speakLine(idx)} className="p-1.5 rounded-full bg-[var(--color-background-secondary)]">
                    <Volume2 size={14} className="text-[var(--color-muted)]" />
                  </button>
                </div>
                {line.blankWord && (
                  <div className="mt-2 text-[12px]">
                    {status === 'active' ? (
                      <div className="flex gap-2">
                        <input
                          value={activeLineIndex === idx ? activeInput : userInputs[idx] || ''}
                          onChange={(e) => activeLineIndex === idx && setActiveInput(e.target.value)}
                          placeholder="填入单词"
                          className="flex-1 px-2 py-1.5 rounded border border-[var(--color-border)] bg-white text-[var(--color-foreground)]"
                        />
                        {activeLineIndex === idx && (
                          <button onClick={submitAnswer} className="px-3 py-1.5 rounded bg-[var(--color-primary)] text-white">提交</button>
                        )}
                      </div>
                    ) : (
                      <p className={status === 'correct' ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}>
                        {status === 'correct' ? `✓ ${userInputs[idx] || line.blankWord}` : `✗ ${userInputs[idx] || ''} → ${line.blankWord}`}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="px-5 py-4 border-t border-[var(--color-border)]">
        <div className="flex items-center justify-between text-[12px] text-[var(--color-muted)] mb-2">
          <span>正确 {score.correct}</span>
          <span>错误 {score.wrong}</span>
        </div>
        <div className="flex items-center justify-center gap-4">
          <button onClick={() => { const p = Math.max(0, currentLineIndex - 1); setCurrentLineIndex(p); if (isPlaying) speakLine(p) }}><SkipBack size={18} className="text-[var(--color-foreground)]" /></button>
          <button onClick={togglePlay} className="w-10 h-10 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center">{isPlaying ? <Pause size={18} /> : <Play size={18} />}</button>
          <button onClick={() => { const n = Math.min(song.lyrics.length - 1, currentLineIndex + 1); setCurrentLineIndex(n); if (isPlaying) speakLine(n) }}><SkipForward size={18} className="text-[var(--color-foreground)]" /></button>
          <button onClick={restart} className="w-10 h-10 rounded-full bg-[var(--color-background-secondary)] text-[var(--color-foreground)] flex items-center justify-center"><RotateCcw size={16} /></button>
          <div className="w-10 h-10 rounded-full bg-[var(--color-background-secondary)] text-[var(--color-foreground)] flex items-center justify-center">
            {score.correct >= score.wrong ? <Check size={16} /> : <XIcon size={16} />}
          </div>
        </div>
      </div>
    </div>
  )
}
