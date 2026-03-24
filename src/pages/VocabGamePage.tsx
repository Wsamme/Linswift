import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Link, PenTool, Headphones, Zap, Trophy, Medal, Award, Lock, Loader2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLogicalBack } from '../hooks/useLogicalBack'
import { navigateSafely } from '../lib/navigation'

const gameModes = [
  {
    icon: Link, name: '单词连连看', desc: '匹配英文和中文释义',
    time: '3-5 分钟', color: '#FF8400', bgColor: '#FFF5EB',
    path: '/word-match', available: true, gameType: 'match',
  },
  {
    icon: PenTool, name: '拼写挑战', desc: '看释义拼出正确单词',
    time: '5-8 分钟', color: '#8B5CF6', bgColor: '#F0EBFF',
    path: '/spelling-game', available: true, gameType: 'spell',
  },
  {
    icon: Headphones, name: '听音辨词', desc: '听发音选择正确单词',
    time: '3-5 分钟', color: '#3B82F6', bgColor: '#E8F0FF',
    path: '/listen-identify-game', available: true, gameType: 'listen',
  },
  {
    icon: Zap, name: '限时闪电', desc: '60秒内答对尽可能多题',
    time: '1 分钟', color: '#EF4444', bgColor: '#FEE2E2',
    path: '/lightning-game', available: true, gameType: 'flash',
  },
]

const rankIcons = [Trophy, Medal, Award]
const rankColors = ['#FF8400', '#94A3B8', '#CD7F32']
const leaderboardGameTypes = ['match', 'spell', 'listen', 'flash'] as const

type LeaderboardGameType = (typeof leaderboardGameTypes)[number]

interface LeaderboardEntry {
  user_id: string
  username: string
  avatar_url: string | null
  total_score: number
  best_by_type: Record<LeaderboardGameType, number>
}

export default function VocabGamePage() {
  const navigate = useNavigate()
  const goBack = useLogicalBack('/ebbinghaus')
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [myBest, setMyBest] = useState<Record<string, number>>({})
  const [vocabCount, setVocabCount] = useState(0)

  useEffect(() => {
    async function load() {
      if (!user) return
      setLoading(true)
      const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const [boardRes, mineRes, vocabRes] = await Promise.all([
        supabase
          .from('game_scores')
          .select('user_id,game_type,score,created_at')
          .in('game_type', [...leaderboardGameTypes])
          .gte('created_at', weekAgoIso)
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase.from('game_scores').select('game_type,score').eq('user_id', user.id).order('score', { ascending: false }),
        supabase.from('user_vocabulary').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ])
      if (!boardRes.error && boardRes.data) {
        const bestByUser = new Map<string, Record<LeaderboardGameType, number>>()
        ;(boardRes.data as Array<{ user_id: string; game_type: LeaderboardGameType; score: number }>).forEach((row) => {
          const prev = bestByUser.get(row.user_id) || { match: 0, spell: 0, listen: 0, flash: 0 }
          if (leaderboardGameTypes.includes(row.game_type)) {
            prev[row.game_type] = Math.max(prev[row.game_type], row.score || 0)
            bestByUser.set(row.user_id, prev)
          }
        })

        const entries: LeaderboardEntry[] = Array.from(bestByUser.entries()).map(([uid, best]) => ({
          user_id: uid,
          username: `用户 ${uid.slice(0, 6)}`,
          avatar_url: null,
          total_score: best.match + best.spell + best.listen + best.flash,
          best_by_type: best,
        }))

        entries.sort((a, b) => b.total_score - a.total_score)

        const topEntries = entries.slice(0, 10)
        const userIds = topEntries.map(e => e.user_id)
        if (userIds.length > 0) {
          const { data: profiles, error: profileErr } = await supabase
            .from('profiles')
            .select('id,username,avatar_url')
            .in('id', userIds)

          if (!profileErr && profiles) {
            const profileMap = new Map((profiles as Array<{ id: string; username: string | null; avatar_url: string | null }>)
              .map(p => [p.id, p]))
            topEntries.forEach((entry) => {
              const p = profileMap.get(entry.user_id)
              if (p) {
                entry.username = p.username?.trim() || entry.username
                entry.avatar_url = p.avatar_url || null
              }
            })
          }
        }

        setLeaderboard(topEntries)
      }
      if (!mineRes.error && mineRes.data) {
        const bestByType: Record<string, number> = {}
        mineRes.data.forEach((row: any) => {
          bestByType[row.game_type] = Math.max(bestByType[row.game_type] || 0, row.score || 0)
        })
        setMyBest(bestByType)
      }
      if (!vocabRes.error && typeof vocabRes.count === 'number') {
        setVocabCount(vocabRes.count)
      }
      setLoading(false)
    }
    load()
  }, [user])

  const matchHighScore = myBest.match || 0
  const spellingHighScore = myBest.spell || 0
  const listenHighScore = myBest.listen || 0
  const flashHighScore = myBest.flash || 0
  const bestScore = useMemo(
    () => Math.max(matchHighScore, spellingHighScore, listenHighScore, flashHighScore),
    [matchHighScore, spellingHighScore, listenHighScore, flashHighScore]
  )
  const getModeBest = (gameType: string) => {
    if (gameType === 'match') return matchHighScore
    if (gameType === 'spell') return spellingHighScore
    if (gameType === 'listen') return listenHighScore
    if (gameType === 'flash') return flashHighScore
    return 0
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* ===== Header ===== */}
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={goBack} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">游戏记忆</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
        </div>
      ) : (
        <>
      {/* ===== 个人成绩卡片（来自 game_scores） ===== */}
      <div className="mx-5 mb-5 p-4 rounded-[var(--radius-lg)] text-white"
        style={{ background: 'linear-gradient(135deg, #FF8400, #FF9E33)' }}>
        <p className="text-[12px] text-white/80 mb-1">最佳成绩</p>
        <div className="flex items-end gap-2">
          <span className="text-[36px] font-bold leading-none">{bestScore.toLocaleString()}</span>
          <span className="text-[14px] text-white/80 mb-1">分</span>
        </div>
        <div className="flex items-center gap-4 mt-2 text-[12px] text-white/70">
          <span>连连看 {matchHighScore}</span>
          <span>·</span>
          <span>拼写 {spellingHighScore}</span>
          <span>·</span>
          <span>听音 {listenHighScore}</span>
          <span>·</span>
          <span>闪电 {flashHighScore}</span>
        </div>
      </div>

      {/* ===== 游戏模式选择 ===== */}
      <div className="mx-5 mb-5">
        <h3 className="text-[14px] font-bold text-[var(--color-foreground)] mb-3 font-secondary">选择游戏</h3>
        <div className="space-y-3">
          {gameModes.map((mode, i) => (
            <button
              key={i}
              onClick={() => mode.available && mode.path && vocabCount > 0 && navigateSafely(navigate, mode.path)}
              disabled={!mode.available || (Boolean(mode.path) && vocabCount === 0)}
              className={`w-full flex items-center gap-4 p-4 bg-[var(--color-card)] rounded-[var(--radius-md)] transition-transform text-left ${
                mode.available && vocabCount > 0 ? 'active:scale-[0.98]' : 'opacity-60'
              }`}
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              {/* 游戏图标 */}
              <div className="w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0"
                style={{ backgroundColor: mode.bgColor }}>
                <mode.icon size={24} style={{ color: mode.color }} />
              </div>
              {/* 游戏信息 */}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-semibold text-[var(--color-foreground)]">{mode.name}</p>
                  {!mode.available && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-[var(--color-muted)]/10 text-[var(--color-muted)] rounded-full flex items-center gap-1">
                      <Lock size={10} /> 即将上线
                    </span>
                  )}
                  {mode.available && vocabCount === 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-[var(--color-muted)]/10 text-[var(--color-muted)] rounded-full">
                      需先添加词汇
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-[var(--color-muted)] mt-0.5">{mode.desc}</p>
              </div>
              {/* 预计时间 / 最高分 */}
              <div className="text-right shrink-0">
                <span className="text-[11px] px-2.5 py-1 bg-[var(--color-background-secondary)] rounded-full text-[var(--color-muted)]">
                  {mode.time}
                </span>
                {mode.available && getModeBest(mode.gameType) > 0 && (
                  <p className="text-[10px] text-[var(--color-primary)] mt-1">最高 {getModeBest(mode.gameType)}</p>
                )}
              </div>
            </button>
          ))}
        </div>
        {vocabCount === 0 && (
          <p className="mt-3 text-[12px] text-[var(--color-muted)]">当前词库为空，先去词汇本添加单词后再开始游戏。</p>
        )}
      </div>

      {/* ===== 排行榜（来自 game_scores） ===== */}
      <div className="mx-5 pb-8">
        <h3 className="text-[14px] font-bold text-[var(--color-foreground)] mb-3 font-secondary">🏆 近7天用户排行榜</h3>
        <div className="bg-[var(--color-card)] rounded-[var(--radius-md)] overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
          {leaderboard.map((player, i) => {
            const RankIcon = rankIcons[i]
            return (
              <div key={i} className={`flex items-center gap-3 px-4 py-3.5 ${i < leaderboard.length - 1 ? 'border-b border-[var(--color-border)]' : ''}`}>
                {i < 3 ? (
                  <RankIcon size={20} style={{ color: rankColors[i] }} className="shrink-0" />
                ) : (
                  <span className="w-5 text-[12px] text-[var(--color-muted)] text-center shrink-0">{i + 1}</span>
                )}
                {player.avatar_url ? (
                  <img
                    src={player.avatar_url}
                    alt={player.username}
                    className="w-8 h-8 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[var(--color-background-secondary)] flex items-center justify-center text-[12px] font-semibold text-[var(--color-muted)] shrink-0">
                    {(player.username || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-[var(--color-foreground)]">
                    {player.user_id === user?.id ? `你（${player.username}）` : player.username}
                  </p>
                  <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                    连连看 {player.best_by_type.match} · 拼写 {player.best_by_type.spell} · 听音 {player.best_by_type.listen} · 闪电 {player.best_by_type.flash}
                  </p>
                </div>
                <span className="text-[15px] font-bold" style={{ color: i < 3 ? rankColors[i] : 'var(--color-primary)' }}>
                  {player.total_score}
                </span>
              </div>
            )
          })}
          {leaderboard.length === 0 && <p className="px-4 py-3 text-[12px] text-[var(--color-muted)]">暂无排行榜数据</p>}
        </div>
      </div>
      </>
      )}
    </div>
  )
}
