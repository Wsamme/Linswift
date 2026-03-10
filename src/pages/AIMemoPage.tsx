import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Sparkles, RefreshCw, Volume2, Star, Clock, Loader2,
} from 'lucide-react'
import { chat } from '../services/gemini'
import { speakAuto, stopSpeaking, isSpeaking } from '../lib/tts'

/**
 * AI 速记生成 —— 背单词模块（接入 Gemini）
 * 功能：
 *  1. AI 根据选定单词生成场景/故事（Gemini 驱动）
 *  2. 单词以标签形式标注在故事下方
 *  3. 操作：朗读故事、换一个、收藏
 *  4. 历史场景列表
 */

// ===== 待记忆的单词 =====
const targetWords = ['elaborate', 'phenomenon', 'conspicuous', 'melancholy', 'inevitable']

export default function AIMemoPage() {
  const navigate = useNavigate()
  const [story, setStory] = useState<string | null>(null)   // AI 生成的故事
  const [isLoading, setIsLoading] = useState(false)          // 加载中
  const [isStarred, setIsStarred] = useState(false)          // 是否收藏

  // ===== 历史场景 =====
  const [histories, setHistories] = useState<string[]>([])

  // ===== 调用 Gemini 生成记忆故事 =====
  const generateStory = async () => {
    setIsLoading(true)
    setIsStarred(false)
    try {
      const response = await chat([{
        role: 'user',
        text: `请用以下 5 个英语单词编写一个有趣、易于记忆的短故事（中英对照，150字以内）。
要求：
1. 故事要生动有趣，有画面感
2. 每个单词在故事中要自然使用，并用【】标注
3. 最后给出每个单词在故事中的含义

单词：${targetWords.join(', ')}

格式：
🎭 英文故事:
(英文内容，目标单词用【】标注)

📖 中文翻译:
(中文翻译)

💡 词义解析:
- word: 含义`
      }])
      setStory(response)
      setHistories(prev => [response, ...prev].slice(0, 5))
    } catch {
      setStory('❌ AI 生成失败，请稍后重试')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* ===== Header ===== */}
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={() => navigate(-1)} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">AI 速记</h1>
        <Sparkles size={16} className="text-[var(--color-primary)]" />
      </div>

      {/* ===== 待记忆单词标签 ===== */}
      <div className="px-5 mb-4">
        <p className="text-[12px] text-[var(--color-muted)] mb-2">待记忆单词</p>
        <div className="flex flex-wrap gap-2">
          {targetWords.map((w, i) => (
            <span key={i} className="px-3 py-1.5 bg-[var(--color-primary-light)] rounded-full text-[13px] font-semibold text-[var(--color-primary)]">
              {w}
            </span>
          ))}
        </div>
      </div>

      {/* ===== 生成按钮 / 加载中 ===== */}
      {!story && !isLoading && (
        <div className="mx-5 mb-5">
          <button
            onClick={generateStory}
            className="w-full py-4 flex items-center justify-center gap-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-[15px] font-semibold active:scale-[0.98] transition-transform"
          >
            <Sparkles size={18} />
            AI 生成记忆故事
          </button>
        </div>
      )}

      {isLoading && (
        <div className="mx-5 mb-5 p-8 bg-[var(--color-card)] rounded-[var(--radius-md)] flex flex-col items-center gap-3"
          style={{ boxShadow: 'var(--shadow-card)' }}>
          <Loader2 size={28} className="text-[var(--color-primary)] animate-spin" />
          <p className="text-[13px] text-[var(--color-muted)]">AI 正在编写记忆故事...</p>
        </div>
      )}

      {/* ===== AI 故事结果 ===== */}
      {story && !isLoading && (
        <div className="mx-5 mb-5 p-4 bg-[var(--color-card)] rounded-[var(--radius-md)] border border-[var(--color-primary)]/15"
          style={{ boxShadow: 'var(--shadow-card)' }}>
          {/* 标题 */}
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={14} className="text-[var(--color-primary)]" />
            <span className="text-[12px] text-[var(--color-primary)] font-semibold">AI 生成</span>
          </div>

          {/* 故事内容 */}
          <div className="text-[14px] text-[var(--color-foreground)] leading-relaxed whitespace-pre-wrap mb-4">
            {story}
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-3 pt-3 border-t border-[var(--color-border)]">
            <button
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-background-secondary)] rounded-[var(--radius-xs)] text-[12px] text-[var(--color-foreground)] active:scale-95 transition-transform"
              onClick={() => {
                // 如果正在朗读就停止，否则开始朗读故事
                if (isSpeaking()) {
                  stopSpeaking()
                } else if (story) {
                  speakAuto(story)
                }
              }}
            >
              <Volume2 size={14} /> {isSpeaking() ? '停止' : '朗读'}
            </button>
            <button
              onClick={generateStory}
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-background-secondary)] rounded-[var(--radius-xs)] text-[12px] text-[var(--color-foreground)]"
            >
              <RefreshCw size={14} /> 换一个
            </button>
            <button
              onClick={() => setIsStarred(!isStarred)}
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-background-secondary)] rounded-[var(--radius-xs)] text-[12px] text-[var(--color-foreground)]"
            >
              <Star size={14} className={isStarred ? 'fill-[var(--color-primary)] text-[var(--color-primary)]' : ''} />
              {isStarred ? '已收藏' : '收藏'}
            </button>
          </div>
        </div>
      )}

      {/* ===== 历史场景 ===== */}
      {histories.length > 1 && (
        <div className="mx-5 pb-8">
          <h3 className="text-[14px] font-bold text-[var(--color-foreground)] mb-3 font-secondary flex items-center gap-2">
            <Clock size={14} className="text-[var(--color-muted)]" /> 历史故事
          </h3>
          <div className="space-y-2">
            {histories.slice(1).map((h, i) => (
              <div key={i} className="p-3 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)]">
                <p className="text-[12px] text-[var(--color-foreground)] line-clamp-3 leading-relaxed">{h}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
