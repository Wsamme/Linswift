import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Play, Pause, BookOpenText, Plus, Headphones,
  SkipForward, SkipBack, Square, ChevronRight,
} from 'lucide-react'
import { useAudioPlayer, textToSegments, type AudioSegment } from '../hooks/useAudioPlayer'
import { supabase, type ListeningContent } from '../lib/supabase'
import { useLogicalBack } from '../hooks/useLogicalBack'

const categories = ['全部', '图书转化', 'AI 原创', '热门'] as const
type CategoryLabel = typeof categories[number]

function mapType(item: ListeningContent): '图书转化' | 'AI 原创' {
  return item.category === 'study' || item.category === 'course' ? '图书转化' : 'AI 原创'
}

export default function ListenLibPage() {
  const navigate = useNavigate()
  const goBack = useLogicalBack('/listening')
  const [activeCategory, setActiveCategory] = useState<CategoryLabel>('全部')
  const [contents, setContents] = useState<ListeningContent[]>([])
  const [activeContentId, setActiveContentId] = useState<number | null>(null)
  const player = useAudioPlayer()

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('listening_content').select('*').order('created_at', { ascending: false })
      const list = data || []
      setContents(list)
      if (list.length > 0) {
        setActiveContentId(list[0].id)
        const segments: AudioSegment[] = textToSegments(list[0].transcript || list[0].title)
        player.loadContent(segments)
      }
    }
    load()
    return () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const current = contents.find((c) => c.id === activeContentId) || contents[0]
  const filtered = useMemo(() => {
    if (activeCategory === '全部') return contents
    if (activeCategory === '热门') return [...contents].sort((a, b) => (b.duration_seconds || 0) - (a.duration_seconds || 0))
    return contents.filter((item) => mapType(item) === activeCategory)
  }, [activeCategory, contents])

  const handleSelect = (id: number) => {
    if (id === activeContentId) {
      if (player.isPlaying) player.pause()
      else player.play()
      return
    }
    const found = contents.find((item) => item.id === id)
    if (!found) return
    setActiveContentId(id)
    const segments: AudioSegment[] = textToSegments(found.transcript || found.title)
    player.loadAndPlay(segments)
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={() => { player.stop(); goBack() }} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">听·图书馆</h1>
      </div>

      {current && (
        <div className="mx-5 mb-4 p-3 bg-[var(--color-card)] rounded-[var(--radius-sm)] border border-[var(--color-border)]" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-10 h-10 rounded-[8px] flex items-center justify-center shrink-0 ${player.isPlaying ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-primary-light)]'}`}>
              <Headphones size={18} className={player.isPlaying ? 'text-white' : 'text-[var(--color-primary)]'} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-[var(--color-foreground)] line-clamp-1">{current.title}</p>
              <p className="text-[11px] text-[var(--color-muted)]">{player.isPlaying ? '正在播放' : '已暂停'} · {mapType(current)}</p>
            </div>
          </div>
          <div className="h-1 bg-[var(--color-background-secondary)] rounded-full mb-1.5 overflow-hidden">
            <div className="h-full bg-[var(--color-primary)] rounded-full transition-all duration-300" style={{ width: `${player.progress}%` }} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--color-muted)]">{player.formatTime(player.elapsedTime)} / {player.formatTime(player.totalDuration)}</span>
            <div className="flex items-center gap-3">
              <button onClick={player.prev} className="p-1 active:scale-90 transition-transform"><SkipBack size={16} className="text-[var(--color-foreground)]" /></button>
              <button onClick={() => player.isPlaying ? player.pause() : player.play()} className="p-1.5 active:scale-90 transition-transform">
                {player.isPlaying ? <Pause size={20} className="text-[var(--color-primary)]" /> : <Play size={20} className="text-[var(--color-primary)]" />}
              </button>
              <button onClick={player.next} className="p-1 active:scale-90 transition-transform"><SkipForward size={16} className="text-[var(--color-foreground)]" /></button>
              <button onClick={player.stop} className="p-1 active:scale-90 transition-transform"><Square size={14} className="text-[var(--color-muted)]" /></button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-5 mb-4">
        <button
          onClick={() => navigate('/bookshelf')}
          className="w-full flex items-center justify-center gap-2 py-3.5 border-2 border-dashed border-[var(--color-primary)]/30 rounded-[var(--radius-md)] text-[var(--color-primary)] active:bg-[var(--color-primary-light)] transition-colors"
        >
          <Plus size={18} />
          <BookOpenText size={18} />
          <span className="text-[14px] font-semibold">从书架内容生成听力材料</span>
        </button>
      </div>

      <div className="flex items-center gap-2 px-5 mb-4 overflow-x-auto">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors shrink-0 ${
              activeCategory === cat ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-background-secondary)] text-[var(--color-muted)]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-8">
        <div className="space-y-3">
          {filtered.map((item) => {
            const isActive = item.id === activeContentId
            return (
              <div
                key={item.id}
                onClick={() => handleSelect(item.id)}
                className={`p-4 rounded-[var(--radius-md)] cursor-pointer active:scale-[0.98] transition-transform ${
                  isActive ? 'bg-[var(--color-primary-light)] border border-[var(--color-primary)]/20' : 'bg-[var(--color-card)]'
                }`}
                style={{ boxShadow: 'var(--shadow-card)' }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px]">🎧</span>
                    <span className="text-[11px] text-[var(--color-muted)]">{mapType(item)}</span>
                  </div>
                  <span className="text-[11px] text-[var(--color-muted)]">{Math.max(1, Math.round((item.duration_seconds || 60) / 60))} 分钟</span>
                </div>
                <h4 className={`text-[15px] font-semibold mb-1 ${isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-foreground)]'}`}>{item.title}</h4>
                <p className="text-[12px] text-[var(--color-muted)] line-clamp-2 mb-2">{item.transcript?.slice(0, 120) || '暂无文本摘要'}</p>
                <div className="flex items-center justify-end">
                  {isActive ? (player.isPlaying ? <Pause size={16} className="text-[var(--color-primary)]" /> : <Play size={16} className="text-[var(--color-primary)]" />) : <ChevronRight size={16} className="text-[var(--color-muted)]" />}
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && <p className="text-[12px] text-[var(--color-muted)]">暂无内容，请先在 Supabase 的 `listening_content` 中插入记录。</p>}
        </div>
      </div>
    </div>
  )
}
