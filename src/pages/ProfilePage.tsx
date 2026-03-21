/**
 * 个人页 - 已接入 Supabase Auth + React Query
 *
 * 功能：
 * 1. 显示用户信息（头像同步显示、用户名、等级）
 * 2. 学习统计（连续天数、词汇量、学习时长）
 * 3. 设置菜单（学习设置、提醒通知、主题设置、关于我们）
 * 4. 退出登录
 *
 * 头像同步：
 *   - 使用 useProfile() 的 React Query 缓存
 *   - 每次页面聚焦时自动刷新 profile 数据
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useProfile } from '../hooks/useProfile'
import { useStudyRecords } from '../hooks/useStudyRecords'
import { useVocabulary } from '../hooks/useVocabulary'
import { useThemeSettings } from '../hooks/useThemeSettings'
import { t, useAppLanguage } from '../lib/i18n'

// 设置菜单项 —— 学习设置已集成到 PDF 阅读器中
const menuItems = [
  { icon: '🔔', label: '提醒通知', desc: '推送通知管理', path: '/notification-settings' },
  { icon: '🎨', label: '主题设置', desc: '外观、字体、语言', path: '/theme-settings' },
  { icon: 'ℹ️', label: '关于我们', desc: 'Linswift v2.1.0', path: '/about' },
]

export default function ProfilePage() {
  const navigate = useNavigate()
  const lang = useAppLanguage()
  const { user, signOut } = useAuth()
  const { profile, fetchProfile } = useProfile()
  const { getStreakDays } = useStudyRecords()
  const { vocabulary, fetchVocabulary } = useVocabulary()
  const { settings } = useThemeSettings()
  const [streakDays, setStreakDays] = useState(0)

  const themeDesc = settings.mode === 'system'
    ? (lang === 'en' ? 'System' : lang === 'ja' ? 'システム' : '跟随系统')
    : settings.mode === 'dark'
      ? (lang === 'en' ? 'Dark' : lang === 'ja' ? 'ダーク' : '深色模式')
      : (lang === 'en' ? 'Light' : lang === 'ja' ? 'ライト' : '浅色模式')

  // ===== 页面挂载 + 每次聚焦时刷新数据（确保头像同步） =====
  useEffect(() => {
    fetchVocabulary('all')
    fetchProfile() // 强制刷新 profile（包括头像）
    getStreakDays().then(setStreakDays).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 页面可见性变化时也刷新（从编辑页返回时）
  useEffect(() => {
    const handleFocus = () => {
      fetchProfile()
    }
    window.addEventListener('focus', handleFocus)
    // 也监听 visibilitychange（移动端切回来）
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchProfile()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [fetchProfile])

  // ===== 退出登录 =====
  const handleLogout = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  // 显示名称 / 邮箱 / 头像首字母
  const displayName = profile?.username || user?.user_metadata?.username || user?.email?.split('@')[0] || t(lang, 'profile_user_fallback')
  const displayEmail = user?.email || ''
  const avatarLetter = displayName.charAt(0).toUpperCase()

  return (
    <div className="flex flex-col h-full">
      {/* ===== Header ===== */}
      <div className="px-5 py-4">
        <h1 className="text-[20px] font-bold text-[var(--color-foreground)] font-secondary">{t(lang, 'profile_title')}</h1>
      </div>

      {/* ===== 用户信息卡片（点击可编辑） ===== */}
      <div
        className="mx-5 mb-4 p-5 bg-[var(--color-card)] rounded-[var(--radius-lg)] flex items-center gap-4 cursor-pointer active:opacity-80 transition-opacity"
        style={{ boxShadow: 'var(--shadow-card)' }}
        onClick={() => navigate('/profile-edit')}
      >
        {/* 头像：优先显示上传的图片，否则显示首字母 */}
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={t(lang, 'profile_avatar_alt')}
            className="w-[64px] h-[64px] rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-[64px] h-[64px] rounded-full bg-[var(--color-primary)] flex items-center justify-center shrink-0">
            <span className="text-white text-[26px] font-bold">{avatarLetter}</span>
          </div>
        )}
        {/* 信息 */}
        <div className="flex-1 min-w-0">
          <h2 className="text-[20px] font-bold text-[var(--color-foreground)] truncate">{displayName}</h2>
          <p className="text-[13px] text-[var(--color-muted)] truncate mt-0.5">{displayEmail}</p>
          {/* 等级徽章 */}
          <div className="mt-2">
            <span className="text-[12px] px-3 py-1 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] font-semibold">
              🏅 {profile?.level && profile.level >= 3 ? t(lang, 'profile_advanced') : profile?.level === 2 ? t(lang, 'profile_intermediate') : t(lang, 'profile_beginner')}
            </span>
          </div>
        </div>
        <ChevronRight size={20} className="text-[var(--color-muted)] shrink-0" />
      </div>

      {/* ===== 学习统计 ===== */}
      <div className="grid grid-cols-3 gap-2.5 mx-5 mb-5">
        <StatCard value={String(streakDays)} label={t(lang, 'profile_days')} color="#FF8400" bgColor="#FFF5EB" />
        <StatCard value={vocabulary.length.toLocaleString()} label={t(lang, 'profile_words')} color="#8B5CF6" bgColor="#F5F3FF" />
        <StatCard value={`${profile?.total_study_hours || 0}h`} label={t(lang, 'profile_hours')} color="#3B82F6" bgColor="#EFF6FF" />
      </div>

      {/* ===== 设置区标题 ===== */}
      <div className="px-5 mb-2">
        <h3 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">{t(lang, 'profile_settings')}</h3>
      </div>

      {/* ===== 设置菜单 ===== */}
      <div className="mx-5 bg-[var(--color-card)] rounded-[var(--radius-lg)] overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
        {menuItems.map((item, i) => (
          <div key={i}>
            {i > 0 && <div className="h-px bg-[var(--color-border)] mx-4" />}
            <div
              onClick={() => item.path && navigate(item.path)}
              className="flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-[var(--color-background-secondary)] transition-colors"
            >
              <span className="text-[18px] shrink-0">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium text-[var(--color-foreground)]">
                  {item.path === '/notification-settings' ? t(lang, 'profile_menu_notif')
                    : item.path === '/theme-settings' ? t(lang, 'profile_menu_theme')
                      : t(lang, 'profile_menu_about')}
                </p>
                <p className="text-[12px] text-[var(--color-muted)]">
                  {item.path === '/notification-settings' ? t(lang, 'profile_menu_notif_desc')
                    : item.path === '/theme-settings' ? themeDesc
                      : 'Linswift v2.1.0'}
                </p>
              </div>
              <ChevronRight size={16} className="text-[var(--color-muted)] shrink-0" />
            </div>
          </div>
        ))}
      </div>

      {/* ===== 退出登录 ===== */}
      <div className="mx-5 mt-5 mb-6">
        <button
          onClick={handleLogout}
          className="w-full py-3 text-[15px] font-medium text-[var(--color-error)] bg-[var(--color-card)] rounded-[var(--radius-md)] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <LogOut size={16} />
          {t(lang, 'profile_logout')}
        </button>
      </div>
    </div>
  )
}

/* ===== 统计卡片子组件（匹配设计稿样式） ===== */
interface StatCardProps {
  value: string
  label: string
  color: string
  bgColor: string
}

function StatCard({ value, label, color, bgColor }: StatCardProps) {
  return (
    <div
      className="flex flex-col items-center gap-1 py-3 rounded-[var(--radius-lg)]"
      style={{ backgroundColor: bgColor }}
    >
      <span className="text-[20px] font-bold font-secondary" style={{ color }}>{value}</span>
      <span className="text-[11px] text-[var(--color-muted)]">{label}</span>
    </div>
  )
}
