/**
 * 关于我们页
 *
 * 功能：
 * 1. 显示 App Logo 和版本信息
 * 2. 菜单项：检查更新、用户协议、隐私政策、帮助反馈、评分、联系我们
 * 3. 底部版权信息
 */

import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// 菜单项数据
const menuItems = [
  { icon: '🔄', label: '检查更新', value: '已是最新版', valueColor: 'text-[var(--color-success)]' },
  { icon: '📄', label: '用户协议', link: true },
  { icon: '🔒', label: '隐私政策', link: true },
  { icon: '💬', label: '帮助与反馈', link: true },
  { icon: '⭐', label: '给我们评分', link: true },
  { icon: '📧', label: '联系我们', link: true },
]

export default function AboutPage() {
  const navigate = useNavigate()

  return (
    <div className="h-full flex justify-center bg-[var(--color-background-secondary)]">
      <div className="w-full max-w-[390px] flex flex-col">
        {/* ===== 顶部导航 ===== */}
        <div className="flex items-center gap-3 px-5 py-4">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-[var(--color-card)] flex items-center justify-center active:scale-95 transition-transform"
          >
            <ChevronLeft size={20} className="text-[var(--color-foreground)]" />
          </button>
          <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">
            关于我们
          </h1>
        </div>

        {/* ===== 内容 ===== */}
        <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-4">

          {/* ----- App 信息卡片 ----- */}
          <div className="bg-[var(--color-card)] rounded-[var(--radius-lg)] p-6 flex flex-col items-center gap-2.5" style={{ boxShadow: 'var(--shadow-card)' }}>
            {/* App Logo */}
            <div className="w-16 h-16 rounded-[var(--radius-md)] bg-[var(--color-primary)] flex items-center justify-center">
              <span className="text-white text-[28px] font-bold font-secondary">L</span>
            </div>
            {/* App 名称 */}
            <h2 className="text-[20px] font-bold text-[var(--color-foreground)]">Linswift</h2>
            {/* 版本号 */}
            <p className="text-[13px] text-[var(--color-muted-light)]">版本 2.1.0 (Build 2026)</p>
            {/* 标语 */}
            <p className="text-[13px] text-[var(--color-muted)]">智能语言学习，让世界触手可及</p>
          </div>

          {/* ----- 菜单列表 ----- */}
          <div className="bg-[var(--color-card)] rounded-[var(--radius-lg)] overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            {menuItems.map((item, i) => (
              <div key={item.label}>
                {i > 0 && <div className="h-px bg-[var(--color-border)] mx-4" />}
                <button className="w-full flex items-center justify-between px-5 py-3.5 active:bg-[var(--color-background-secondary)] transition-colors">
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
