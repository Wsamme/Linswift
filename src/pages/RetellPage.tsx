import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Play, Pause, Mic, MicOff, RotateCcw, ChevronRight, AlertCircle,
} from 'lucide-react'
import { speakEnglish, stopSpeaking } from '../lib/tts'
import { useSTT } from '../hooks/useSTT'
import { compareTexts } from '../lib/stt'

/**
 * 复述练习 —— 口语模块（已接入 Web Speech API）
 *
 * 流程：
 *  1. 用户听原文（TTS 朗读）
 *  2. 点击录音按钮 → Web Speech API 实时识别用户语音
 *  3. 识别结束后，自动与原文逐词对比
 *  4. 显示准确率、差异高亮
 *  5. 可重新复述或进入下一句
 */

// ===== 练习句子数据（后续可从数据库加载） =====
const sentences = [
  {
    original: "The key to effective communication is not just speaking clearly, but also listening actively to others.",
  },
  {
    original: "In today's rapidly changing world, the ability to adapt quickly has become more important than ever.",
  },
  {
    original: "Learning a new language opens doors to different cultures and perspectives that you never knew existed.",
  },
]

export default function RetellPage() {
  const navigate = useNavigate()

  // ===== 页面状态 =====
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  // ===== STT 语音识别 hook =====
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

  const current = sentences[currentIndex]

  // 用户说的完整文本 = 已确认 + 正在说的中间结果
  const userSpoken = transcript || ''
  const hasSpoken = userSpoken.trim().length > 0

  // ===== 计算评分和差异 =====
  const comparison = hasSpoken ? compareTexts(current.original, userSpoken) : null
  const accuracy = comparison?.accuracy ?? 0
  // 简单的流利度评估：用户词数 / 原文词数（不超过 100%）
  const origWordCount = current.original.split(/\s+/).length
  const userWordCount = userSpoken.split(/\s+/).filter(Boolean).length
  const fluency = hasSpoken
    ? Math.min(100, Math.round((userWordCount / origWordCount) * 100))
    : 0

  // ===== 播放原文 =====
  const handlePlay = () => {
    if (isPlaying) {
      stopSpeaking()
      setIsPlaying(false)
    } else {
      speakEnglish(current.original, 0.8)
      setIsPlaying(true)
      // TTS 结束后自动重置播放状态（约估时间）
      setTimeout(() => setIsPlaying(false), current.original.length * 60)
    }
  }

  // ===== 录音控制 =====
  const handleToggleRecord = () => {
    if (isListening) {
      stopListening()
    } else {
      // 开始新录音前先停 TTS
      stopSpeaking()
      setIsPlaying(false)
      resetTranscript()
      startListening()
    }
  }

  // ===== 重新复述 =====
  const handleRetry = () => {
    resetTranscript()
  }

  // ===== 下一句 =====
  const handleNext = () => {
    stopListening()
    resetTranscript()
    setIsPlaying(false)
    setCurrentIndex(prev => Math.min(prev + 1, sentences.length - 1))
  }

  // ===== 是否最后一句 =====
  const isLast = currentIndex >= sentences.length - 1

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={() => navigate(-1)} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">复述练习</h1>
        <span className="text-[13px] text-[var(--color-muted)]">{currentIndex + 1}/{sentences.length}</span>
      </div>

      {/* ===== 进度条 ===== */}
      <div className="mx-5 mb-5 h-1.5 bg-[var(--color-background-secondary)] rounded-full overflow-hidden">
        <div
          className="h-full bg-[var(--color-primary)] rounded-full transition-all"
          style={{ width: `${((currentIndex + 1) / sentences.length) * 100}%` }}
        />
      </div>

      {/* ===== 原文区域 ===== */}
      <div className="mx-5 mb-4 p-4 bg-[var(--color-card)] rounded-[var(--radius-md)]" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] text-[var(--color-muted)] font-semibold">📖 原文</span>
          <button
            onClick={handlePlay}
            className="p-1.5 rounded-full bg-[var(--color-primary-light)]"
          >
            {isPlaying
              ? <Pause size={14} className="text-[var(--color-primary)]" />
              : <Play size={14} className="text-[var(--color-primary)]" />}
          </button>
        </div>
        <p className="text-[15px] text-[var(--color-foreground)] leading-relaxed">{current.original}</p>
      </div>

      {/* ===== 复述区域 ===== */}
      <div className="mx-5 mb-4 p-4 bg-[var(--color-primary-light)] rounded-[var(--radius-md)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] text-[var(--color-primary)] font-semibold">🎤 你的复述</span>
          {/* 录音按钮 */}
          <button
            onClick={handleToggleRecord}
            disabled={!sttSupported}
            className={`p-2 rounded-full transition-all ${
              isListening
                ? 'bg-[var(--color-error)] animate-pulse shadow-lg shadow-red-200'
                : 'bg-[var(--color-primary)]'
            } disabled:opacity-40`}
          >
            {isListening
              ? <MicOff size={14} className="text-white" />
              : <Mic size={14} className="text-white" />}
          </button>
        </div>

        {/* 识别文本区 */}
        <div className="min-h-[48px]">
          {isListening && !transcript && !interimTranscript && (
            <p className="text-[14px] text-[var(--color-muted)] italic animate-pulse">正在听你说话...</p>
          )}
          {(transcript || interimTranscript) ? (
            <p className="text-[15px] text-[var(--color-foreground)] leading-relaxed">
              {transcript}
              {interimTranscript && (
                <span className="text-[var(--color-muted)] italic"> {interimTranscript}</span>
              )}
            </p>
          ) : !isListening && (
            <p className="text-[14px] text-[var(--color-muted)]">
              {sttSupported ? '点击麦克风按钮开始复述' : '当前浏览器不支持语音识别'}
            </p>
          )}
        </div>

        {/* 评分（有识别结果时显示） */}
        {hasSpoken && !isListening && (
          <div className="flex gap-3 mt-3">
            <ScoreBadge label="准确率" value={accuracy} color="#22C55E" />
            <ScoreBadge label="完整度" value={fluency} color="#3B82F6" />
          </div>
        )}
      </div>

      {/* ===== STT 错误提示 ===== */}
      {sttError && (
        <div className="mx-5 mb-3 p-3 bg-[var(--color-error)]/5 border border-[var(--color-error)]/15 rounded-[var(--radius-sm)] flex items-center gap-2">
          <AlertCircle size={14} className="text-[var(--color-error)] shrink-0" />
          <p className="text-[12px] text-[var(--color-error)]">{sttError}</p>
        </div>
      )}

      {/* ===== 差异对比（有结果时显示） ===== */}
      {comparison && !isListening && (
        <div className="mx-5 mb-4 p-4 bg-[var(--color-card)] rounded-[var(--radius-md)]" style={{ boxShadow: 'var(--shadow-card)' }}>
          <span className="text-[12px] text-[var(--color-muted)] font-semibold mb-2 block">🔍 差异对比</span>
          <p className="text-[14px] leading-relaxed">
            {comparison.words.map((d, i) => (
              <span key={i}>
                {d.match ? (
                  <span className="text-[var(--color-foreground)]">{d.original} </span>
                ) : d.spoken ? (
                  <span>
                    <span className="text-[var(--color-error)] line-through">{d.spoken}</span>{' '}
                    <span className="text-[var(--color-success)] font-semibold">{d.original}</span>{' '}
                  </span>
                ) : (
                  <span className="text-[var(--color-error)] underline">{d.original} </span>
                )}
              </span>
            ))}
          </p>
        </div>
      )}

      {/* ===== 底部操作 ===== */}
      <div className="mt-auto px-5 py-4 flex gap-3">
        <button
          onClick={handleRetry}
          className="flex-1 py-3 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)] text-[14px] font-semibold text-[var(--color-foreground)] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          <RotateCcw size={16} /> 重新复述
        </button>
        <button
          onClick={isLast ? () => navigate(-1) : handleNext}
          className="flex-1 py-3 bg-[var(--color-primary)] rounded-[var(--radius-sm)] text-[14px] font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          {isLast ? '完成' : <>下一句 <ChevronRight size={16} /></>}
        </button>
      </div>
    </div>
  )
}

/* ===== 评分标签子组件 ===== */
function ScoreBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex-1 text-center py-2 bg-white/80 rounded-[var(--radius-xs)]">
      <p className="text-[18px] font-bold" style={{ color }}>{value}%</p>
      <p className="text-[10px] text-[var(--color-muted)]">{label}</p>
    </div>
  )
}
