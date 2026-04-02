/**
 * 关于我们页
 *
 * 功能：
 * 1. 显示 App Logo 和版本信息
 * 2. 菜单项：检查更新、用户协议、隐私政策、帮助反馈、评分、联系我们
 * 3. 底部版权信息
 */

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { navigateSafely } from '../lib/navigation'
import { useLogicalBack } from '../hooks/useLogicalBack'
import { t, useAppLanguage } from '../lib/i18n'
import BrandLogo from '../components/common/BrandLogo'

interface MenuItem {
  icon: string
  label: string
  value?: string
  valueColor?: string
  action?: () => void
}

export default function AboutPage() {
  const navigate = useNavigate()
  const lang = useAppLanguage()
  const goBack = useLogicalBack('/app/profile')

  const openMailto = (email: string, subject: string) => {
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}`
  }

  const openExternal = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const menuItems: MenuItem[] = [
    { icon: '🔄', label: t(lang, 'about_check_update'), value: t(lang, 'about_up_to_date'), valueColor: 'text-[var(--color-success)]' },
    { icon: '📄', label: t(lang, 'about_user_agreement'), action: () => navigateSafely(navigate, '/legal/user-agreement') },
    { icon: '🔒', label: t(lang, 'about_privacy'), action: () => navigateSafely(navigate, '/legal/privacy-policy') },
    { icon: '💬', label: t(lang, 'about_help'), action: () => openMailto('aw@linswift.com', 'Linswift Help & Feedback') },
    { icon: '⭐', label: t(lang, 'about_rate'), action: () => openMailto('aw@linswift.com', 'Linswift Rating & Suggestions') },
    { icon: '📧', label: t(lang, 'about_contact'), action: () => openExternal('mailto:aw@linswift.com') },
  ]

  return (
    <div className="h-full flex justify-center bg-[var(--color-background-secondary)]">
      <div className="w-full max-w-[390px] flex flex-col">
        {/* ===== 顶部导航 ===== */}
        <div className="flex items-center gap-3 px-5 py-4">
          <button
            onClick={goBack}
            className="w-9 h-9 rounded-full bg-[var(--color-card)] flex items-center justify-center active:scale-95 transition-transform"
          >
            <ChevronLeft size={20} className="text-[var(--color-foreground)]" />
          </button>
          <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">
            {t(lang, 'about_title')}
          </h1>
        </div>

        {/* ===== 内容 ===== */}
        <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-4">

          {/* ----- App 信息卡片 ----- */}
          <div className="bg-[var(--color-card)] rounded-[var(--radius-lg)] p-6 flex flex-col items-center gap-2.5" style={{ boxShadow: 'var(--shadow-card)' }}>
            {/* App Logo */}
            <BrandLogo imageClassName="h-16 w-16" showText={false} />
            {/* App 名称 */}
            <h2 className="text-[20px] font-bold text-[var(--color-foreground)]">Linswift</h2>
            {/* 版本号 */}
            <p className="text-[13px] text-[var(--color-muted-light)]">{t(lang, 'about_version')} 2.1.0 (Build 2026)</p>
            {/* 标语 */}
            <p className="text-[13px] text-[var(--color-muted)]">{t(lang, 'about_tagline')}</p>
          </div>

          {/* ----- 菜单列表 ----- */}
          <div className="bg-[var(--color-card)] rounded-[var(--radius-lg)] overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            {menuItems.map((item, i) => (
              <div key={item.label}>
                {i > 0 && <div className="h-px bg-[var(--color-border)] mx-4" />}
                <button
                  onClick={item.action}
                  disabled={!item.action}
                  className="w-full flex items-center justify-between px-5 py-3.5 active:bg-[var(--color-background-secondary)] transition-colors disabled:cursor-default"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[18px]">{item.icon}</span>
                    <span className="text-[15px] text-[var(--color-foreground)]">{item.label}</span>
                  </div>
                  {item.value ? (
                    <span className={`text-[13px] ${item.valueColor || 'text-[var(--color-muted)]'}`}>
                      {item.value}
                    </span>
                  ) : (
                    <ChevronRight size={16} className="text-[var(--color-muted)]" />
                  )}
                </button>
              </div>
            ))}
          </div>

          {/* ----- 版权信息 ----- */}
          <p className="text-center text-[11px] text-[var(--color-muted-light)] pt-4">
            © 2026 Linswift. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
