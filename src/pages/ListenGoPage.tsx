import { useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft, Play, Pause, SkipForward, SkipBack, Volume2,
  VolumeX,
} from 'lucide-react'
import { useAudioPlayer, textToSegments, type AudioSegment } from '../hooks/useAudioPlayer'
import { supabase, type ListeningContent } from '../lib/supabase'
import { useLogicalBack } from '../hooks/useLogicalBack'

const categoryMap: Record<string, string> = {
  all: '推荐',
  ted: 'TED',
  news: '新闻',
  course: '课程',
  study: '学习',
}

export default function ListenGoPage() {
  const goBack = useLogicalBack('/listening')
  const [activeCategory, setActiveCategory] = useState<'all' | 'ted' | 'news' | 'course' | 'study'>('all')
  const [contents, setContents] = useState<ListeningContent[]>([])
  const [activeContentId, setActiveContentId] = useState<number | null>(null)
  const player = useAudioPlayer()

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('listening_content').select('*').in('category', ['ted', 'news', 'course', 'study']).order('created_at', { ascending: false })
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

  const filtered = useMemo(
    () => (activeCategory === 'all' ? contents : contents.filter((item) => item.category === activeCategory)),
    [activeCategory, contents]
  )
  const current = contents.find((c) => c.id === activeContentId) || filtered[0]

  const selectContent = (id: number) => {
    if (!current) return
    if (activeContentId === id) {
      if (player.isPlaying) player.pause()
      else player.play()
      return
    }
    const found = contents.find((c) => c.id === id)
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
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">随行听</h1>
      </div>

      {current && (
        <div className="mx-5 mb-4 p-4 rounded-[var(--radius-md)] text-white" style={{ background: 'linear-gradient(135deg, #3B82F6, #6366F1)' }}>
          <p className="text-[11px] text-white/70 mb-1">{player.isPlaying ? '正在播放' : '已暂停'}</p>
          <h3 className="text-[16px] font-bold mb-1">{current.title}</h3>
          <p className="text-[12px] text-white/80 mb-3">{current.category.toUpperCase()} · {Math.max(1, Math.round((current.duration_seconds || 60) / 60))} 分钟</p>
          <div className="h-1 bg-white/20 rounded-full mb-2">
            <div className="h-full bg-white rounded-full transition-all duration-300" style={{ width: `${player.progress}%` }} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/60">
              {player.formatTime(player.elapsedTime)} / {player.formatTime(player.totalDuration)}
            </span>
            <div className="flex items-center gap-4">
              <button onClick={player.prev} className="active:scale-90 transition-transform"><SkipBack size={18} className="text-white/80" /></button>
              <button onClick={() => player.isPlaying ? player.pause() : player.play()} className="active:scale-90 transition-transform">
                {player.isPlaying ? <Pause size={22} className="text-white" /> : <Play size={22} className="text-white" />}
              </button>
              <button onClick={player.next} className="active:scale-90 transition-transform"><SkipForward size={18} className="text-white/80" /></button>
              <button onClick={player.stop} className="active:scale-90 transition-transform">
                {player.isPlaying ? <Volume2 size={18} className="text-white/80" /> : <VolumeX size={18} className="text-white/40" />}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 px-5 mb-4 overflow-x-auto">
        {Object.entries(categoryMap).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveCategory(key as 'all' | 'ted' | 'news' | 'course' | 'study')}
            className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors shrink-0 ${
              activeCategory === key
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-background-secondary)] text-[var(--color-muted)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-8">
        <div className="space-y-2">
          {filtered.map((item) => {
            const isActive = item.id === activeContentId
            return (
              <div
                key={item.id}
                onClick={() => selectContent(item.id)}
                className={`flex items-center gap-3 p-3 rounded-[var(--radius-sm)] cursor-pointer active:bg-[var(--color-background-secondary)] transition-colors ${
                  isActive ? 'bg-[var(--color-primary-light)] border border-[var(--color-primary)]/20' : 'bg-[var(--color-card)]'
                }`}
                style={{ boxShadow: 'var(--shadow-card)' }}
              >
                <div className={`w-12 h-12 rounded-[10px] flex items-center justify-center shrink-0 ${isActive ? 'bg-[var(--color-primary)]/20' : 'bg-[var(--color-primary-light)]'}`}>
                  {isActive && player.isPlaying ? <Pause size={20} className="text-[var(--color-primary)]" /> : isActive ? <Play size={20} className="text-[var(--color-primary)]" /> : <span className="text-[20px]">🎧</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[14px] font-semibold line-clamp-1 ${isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-foreground)]'}`}>{item.title}</p>
                  <p className="text-[11px] text-[var(--color-muted)]">{item.category.toUpperCase()} · {item.difficulty}</p>
                </div>
                <span className="text-[11px] text-[var(--color-muted)]">{Math.max(1, Math.round((item.duration_seconds || 60) / 60))} 分钟</span>
              </div>
            )
          })}
          {filtered.length === 0 && <p className="text-[12px] text-[var(--color-muted)]">暂无内容，请先向 `listening_content` 写入数据。</p>}
        </div>
      </div>
    </div>
  )
}
