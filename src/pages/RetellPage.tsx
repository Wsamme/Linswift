import { useEffect, useState } from 'react'
import {
  ChevronLeft, Play, Pause, Mic, MicOff, RotateCcw, ChevronRight, AlertCircle, Loader2,
} from 'lucide-react'
import { speakEnglish, stopSpeaking } from '../lib/tts'
import { useSTT } from '../hooks/useSTT'
import { compareTexts } from '../lib/stt'
import { supabase } from '../lib/supabase'
import { useLogicalBack } from '../hooks/useLogicalBack'

export default function RetellPage() {
  const goBack = useLogicalBack('/speaking')
  const [sentences, setSentences] = useState<Array<{ id: number; original: string }>>([])
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const {
    supported: sttSupported,
    isListening,
    transcript,
    interimTranscript,
    error: sttError,
    startListening,
    stopListening,
    resetTranscript,
  } = useSTT({ lang: 'en-US', continuous: true })

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('retell_prompts').select('id,content').order('created_at', { ascending: false }).limit(20)
      setSentences((data || []).map((row: any) => ({ id: row.id, original: row.content })))
      setLoading(false)
    }
    load()
  }, [])

  const current = sentences[currentIndex]
  const userSpoken = transcript || ''
  const hasSpoken = userSpoken.trim().length > 0
  const comparison = current && hasSpoken ? compareTexts(current.original, userSpoken) : null
  const accuracy = comparison?.accuracy ?? 0
  const origWordCount = current?.original.split(/\s+/).length || 1
  const userWordCount = userSpoken.split(/\s+/).filter(Boolean).length
  const fluency = hasSpoken ? Math.min(100, Math.round((userWordCount / origWordCount) * 100)) : 0
  const isLast = currentIndex >= sentences.length - 1

  const handlePlay = () => {
    if (!current) return
    if (isPlaying) {
      stopSpeaking()
      setIsPlaying(false)
    } else {
      speakEnglish(current.original, 0.8)
      setIsPlaying(true)
      setTimeout(() => setIsPlaying(false), current.original.length * 60)
    }
  }

  const handleToggleRecord = () => {
    if (isListening) stopListening()
    else {
      stopSpeaking()
      setIsPlaying(false)
      resetTranscript()
      startListening()
    }
  }

  const handleRetry = () => resetTranscript()
  const handleNext = () => {
    stopListening()
    resetTranscript()
    setIsPlaying(false)
    setCurrentIndex((prev) => Math.min(prev + 1, sentences.length - 1))
  }

  if (loading) {
    return <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center"><Loader2 size={24} className="animate-spin text-[var(--color-primary)]" /></div>
  }
  if (!current) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex flex-col items-center justify-center px-6">
        <p className="text-[14px] text-[var(--color-muted)]">暂无复述内容，请先向 `retell_prompts` 写入数据。</p>
        <button onClick={goBack} className="mt-4 px-4 py-2 rounded bg-[var(--color-primary)] text-white text-[13px]">返回</button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={goBack} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">复述练习</h1>
        <span className="text-[13px] text-[var(--color-muted)]">{currentIndex + 1}/{sentences.length}</span>
      </div>

      <div className="mx-5 mb-5 h-1.5 bg-[var(--color-background-secondary)] rounded-full overflow-hidden">
        <div className="h-full bg-[var(--color-primary)] rounded-full transition-all" style={{ width: `${((currentIndex + 1) / sentences.length) * 100}%` }} />
      </div>

      <div className="mx-5 mb-4 p-4 bg-[var(--color-card)] rounded-[var(--radius-md)]" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] text-[var(--color-muted)] font-semibold">📖 原文</span>
          <button onClick={handlePlay} className="p-1.5 rounded-full bg-[var(--color-primary-light)]">
            {isPlaying ? <Pause size={14} className="text-[var(--color-primary)]" /> : <Play size={14} className="text-[var(--color-primary)]" />}
          </button>
        </div>
        <p className="text-[15px] text-[var(--color-foreground)] leading-relaxed">{current.original}</p>
      </div>

      <div className="mx-5 mb-4 p-4 bg-[var(--color-primary-light)] rounded-[var(--radius-md)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] text-[var(--color-primary)] font-semibold">🎤 你的复述</span>
          <button
            onClick={handleToggleRecord}
            disabled={!sttSupported}
            className={`p-2 rounded-full transition-all ${isListening ? 'bg-[var(--color-error)] animate-pulse shadow-lg shadow-red-200' : 'bg-[var(--color-primary)]'} disabled:opacity-40`}
          >
            {isListening ? <MicOff size={14} className="text-white" /> : <Mic size={14} className="text-white" />}
          </button>
        </div>
        <div className="min-h-[48px]">
          {isListening && !transcript && !interimTranscript && <p className="text-[14px] text-[var(--color-muted)] italic animate-pulse">正在听你说话...</p>}
          {(transcript || interimTranscript) ? (
            <p className="text-[15px] text-[var(--color-foreground)] leading-relaxed">
              {transcript}
              {interimTranscript && <span className="text-[var(--color-muted)] italic"> {interimTranscript}</span>}
            </p>
          ) : !isListening && (
            <p className="text-[14px] text-[var(--color-muted)]">{sttSupported ? '点击麦克风按钮开始复述' : '当前浏览器不支持语音识别'}</p>
          )}
        </div>
        {hasSpoken && !isListening && (
          <div className="flex gap-3 mt-3">
            <ScoreBadge label="准确率" value={accuracy} color="#22C55E" />
            <ScoreBadge label="完整度" value={fluency} color="#3B82F6" />
          </div>
        )}
      </div>

      {sttError && (
        <div className="mx-5 mb-3 p-3 bg-[var(--color-error)]/5 border border-[var(--color-error)]/15 rounded-[var(--radius-sm)] flex items-center gap-2">
          <AlertCircle size={14} className="text-[var(--color-error)] shrink-0" />
          <p className="text-[12px] text-[var(--color-error)]">{sttError}</p>
        </div>
      )}

      {comparison && !isListening && (
        <div className="mx-5 mb-4 p-4 bg-[var(--color-card)] rounded-[var(--radius-md)]" style={{ boxShadow: 'var(--shadow-card)' }}>
          <span className="text-[12px] text-[var(--color-muted)] font-semibold mb-2 block">🔍 差异对比</span>
          <p className="text-[14px] leading-relaxed">
            {comparison.words.map((d, i) => (
              <span key={i}>
                {d.match ? (
                  <span className="text-[var(--color-foreground)]">{d.original} </span>
                ) : d.spoken ? (
                  <span><span className="text-[var(--color-error)] line-through">{d.spoken}</span> <span className="text-[var(--color-success)] font-semibold">{d.original}</span> </span>
                ) : (
                  <span className="text-[var(--color-error)] underline">{d.original} </span>
                )}
              </span>
            ))}
          </p>
        </div>
      )}

      <div className="mt-auto px-5 py-4 flex gap-3">
        <button onClick={handleRetry} className="flex-1 py-3 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)] text-[14px] font-semibold text-[var(--color-foreground)] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
          <RotateCcw size={16} /> 重新复述
        </button>
        <button onClick={isLast ? goBack : handleNext} className="flex-1 py-3 bg-[var(--color-primary)] rounded-[var(--radius-sm)] text-[14px] font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
          {isLast ? '完成' : <>下一句 <ChevronRight size={16} /></>}
        </button>
      </div>
    </div>
  )
}

function ScoreBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex-1 text-center py-2 bg-white/80 rounded-[var(--radius-xs)]">
      <p className="text-[18px] font-bold" style={{ color }}>{value}%</p>
      <p className="text-[10px] text-[var(--color-muted)]">{label}</p>
    </div>
  )
}
