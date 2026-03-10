import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Link, PenTool, Headphones, Zap, Trophy, Medal, Award, Lock,
} from 'lucide-react'
import { getHighScore } from '../lib/gameEngine'

/**
 * 游戏记忆模式 —— 背单词模块
 *
 * 功能：
 *  1. 四种游戏模式卡片：连连看、拼写挑战、听音辨词（即将上线）、限时闪电（即将上线）
 *  2. 排行榜（本周前三名）
 *  3. 个人最佳成绩（从 localStorage 读取）
 */

// ===== 游戏模式列表 =====
const gameModes = [
  {
    icon: Link, name: '单词连连看', desc: '匹配英文和中文释义',
    time: '3-5 分钟', color: '#FF8400', bgColor: '#FFF5EB',
    path: '/word-match', available: true, gameType: 'word-match',
  },
  {
    icon: PenTool, name: '拼写挑战', desc: '看释义拼出正确单词',
    time: '5-8 分钟', color: '#8B5CF6', bgColor: '#F0EBFF',
    path: '/spelling-game', available: true, gameType: 'spelling',
  },
  {
    icon: Headphones, name: '听音辨词', desc: '听发音选择正确单词',
    time: '3-5 分钟', color: '#3B82F6', bgColor: '#E8F0FF',
    path: '', available: false, gameType: 'listen-identify',
  },
  {
    icon: Zap, name: '限时闪电', desc: '60秒内答对尽可能多题',
    time: '1 分钟', color: '#EF4444', bgColor: '#FEE2E2',
    path: '', available: false, gameType: 'lightning',
  },
]

// ===== 排行榜 =====
const leaderboard = [
  { name: 'Linswift 小王', score: 2580, rank: 1 },
  { name: '英语达人', score: 2340, rank: 2 },
  { name: '学习使我快乐', score: 2100, rank: 3 },
]

const rankIcons = [Trophy, Medal, Award]
const rankColors = ['#FF8400', '#94A3B8', '#CD7F32']

export default function VocabGamePage() {
  const navigate = useNavigate()

  // 读取最高分用于展示
  const matchHighScore = getHighScore('word-match')
  const spellingHighScore = getHighScore('spelling')
  const bestScore = Math.max(matchHighScore, spellingHighScore)

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* ===== Header ===== */}
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={() => navigate(-1)} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">游戏记忆</h1>
      </div>

      {/* ===== 个人成绩卡片（从 localStorage 读取） ===== */}
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
        </div>
      </div>

      {/* ===== 游戏模式选择 ===== */}
      <div className="mx-5 mb-5">
        <h3 className="text-[14px] font-bold text-[var(--color-foreground)] mb-3 font-secondary">选择游戏</h3>
        <div className="space-y-3">
          {gameModes.map((mode, i) => (
            <button
              key={i}
              onClick={() => mode.available && mode.path && navigate(mode.path)}
              disabled={!mode.available}
              className={`w-full flex items-center gap-4 p-4 bg-[var(--color-card)] rounded-[var(--radius-md)] transition-transform text-left ${
                mode.available ? 'active:scale-[0.98]' : 'opacity-60'
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
                </div>
                <p className="text-[12px] text-[var(--color-muted)] mt-0.5">{mode.desc}</p>
              </div>
              {/* 预计时间 / 最高分 */}
              <div className="text-right shrink-0">
                <span className="text-[11px] px-2.5 py-1 bg-[var(--color-background-secondary)] rounded-full text-[var(--color-muted)]">
                  {mode.time}
                </span>
                {mode.available && getHighScore(mode.gameType) > 0 && (
                  <p className="text-[10px] text-[var(--color-primary)] mt-1">最高 {getHighScore(mode.gameType)}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ===== 排行榜 ===== */}
      <div className="mx-5 pb-8">
        <h3 className="text-[14px] font-bold text-[var(--color-foreground)] mb-3 font-secondary">🏆 本周排行榜</h3>
        <div className="bg-[var(--color-card)] rounded-[var(--radius-md)] overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
          {leaderboard.map((player, i) => {
            const RankIcon = rankIcons[i]
            return (
              <div key={i} className={`flex items-center gap-3 px-4 py-3.5 ${i < leaderboard.length - 1 ? 'border-b border-[var(--color-border)]' : ''}`}>
                <RankIcon size={20} style={{ color: rankColors[i] }} className="shrink-0" />
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-[var(--color-foreground)]">{player.name}</p>
                </div>
                <span className="text-[15px] font-bold" style={{ color: rankColors[i] }}>{player.score}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
