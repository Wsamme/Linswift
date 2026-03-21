/**
 * 通知设置页
 *
 * 功能：
 * 1. 每日学习提醒时间设置
 * 2. 各类通知开关：学习提醒、打卡提醒、新功能通知、成就通知、活动推送、学习小贴士
 *
 * 设置保存到 localStorage
 */

import { useState, useEffect } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useLogicalBack } from '../hooks/useLogicalBack'
import { useMediaQuery } from '../hooks/useMediaQuery'
import SettingsDesktopShell from '../components/settings/SettingsDesktopShell'

// localStorage key
const NOTIF_KEY = 'linswift_notification_settings'

// 通知设置类型
interface NotifSettings {
  reminderTime: string      // 每日提醒时间 HH:MM
  dailyReminder: boolean    // 每日学习提醒
  checkinReminder: boolean  // 打卡提醒
  newFeature: boolean       // 新功能通知
  achievement: boolean      // 成就通知
  activity: boolean         // 活动推送
  tips: boolean             // 学习小贴士
}

// 默认值
const DEFAULT_NOTIF: NotifSettings = {
  reminderTime: '08:00',
  dailyReminder: true,
  checkinReminder: true,
  newFeature: false,
  achievement: true,
  activity: false,
  tips: true,
}

function loadNotifSettings(): NotifSettings {
  try {
    const raw = localStorage.getItem(NOTIF_KEY)
    return raw ? { ...DEFAULT_NOTIF, ...JSON.parse(raw) } : { ...DEFAULT_NOTIF }
  } catch {
    return { ...DEFAULT_NOTIF }
  }
}

function saveNotifSettings(s: NotifSettings) {
  localStorage.setItem(NOTIF_KEY, JSON.stringify(s))
}

// 通知选项列表
const toggleItems: { key: keyof Omit<NotifSettings, 'reminderTime'>; icon: string; label: string }[] = [
  { key: 'dailyReminder', icon: '🔔', label: '每日学习提醒' },
  { key: 'checkinReminder', icon: '✅', label: '打卡提醒' },
  { key: 'newFeature', icon: '🆕', label: '新功能通知' },
  { key: 'achievement', icon: '🏆', label: '成就通知' },
  { key: 'activity', icon: '📢', label: '活动推送' },
  { key: 'tips', icon: '💡', label: '学习小贴士' },
]

export default function NotificationSettingsPage() {
  const goBack = useLogicalBack('/app/profile')
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [notif, setNotif] = useState<NotifSettings>(loadNotifSettings)

  // 自动保存
  useEffect(() => { saveNotifSettings(notif) }, [notif])

  const update = (partial: Partial<NotifSettings>) => {
    setNotif(prev => ({ ...prev, ...partial }))
  }

  const toggle = (key: keyof Omit<NotifSettings, 'reminderTime'>) => {
    setNotif(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const reminderCard = (
    <div className={`${isDesktop ? 'glass-card-strong rounded-[30px] p-6' : 'bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5'} space-y-3`} style={isDesktop ? undefined : { boxShadow: 'var(--shadow-card)' }}>
      <h2 className={`${isDesktop ? 'text-[20px]' : 'text-[16px]'} font-semibold text-[var(--color-foreground)]`}>学习提醒</h2>
      <p className="text-[12px] text-[var(--color-muted-light)]">设置每日学习提醒时间，养成好习惯</p>

      <div className={`flex items-center justify-between rounded-[20px] ${isDesktop ? 'glass-card-elevated px-5 py-4' : 'px-4 py-3 bg-[var(--color-primary-light)] rounded-[var(--radius-sm)]'}`}>
        <div className="flex items-center gap-2">
          <span className="text-[18px]">⏰</span>
          <span className={`${isDesktop ? 'text-[15px]' : 'text-[14px]'} font-medium text-[var(--color-foreground)]`}>每日提醒时间</span>
        </div>
        <input
          type="time"
          value={notif.reminderTime}
          onChange={e => update({ reminderTime: e.target.value })}
          className="cursor-pointer border-none bg-transparent text-[16px] font-bold text-[var(--color-primary)] outline-none"
        />
      </div>
    </div>
  )

  const toggleCard = (
    <div className={`${isDesktop ? 'glass-card-strong rounded-[30px] overflow-hidden' : 'bg-[var(--color-card)] rounded-[var(--radius-lg)] overflow-hidden'}`} style={isDesktop ? undefined : { boxShadow: 'var(--shadow-card)' }}>
      {toggleItems.map((item, i) => (
        <div key={item.key}>
          {i > 0 && <div className="h-px bg-[var(--color-border)] mx-4" />}
          <div className={`flex items-center justify-between ${isDesktop ? 'px-6 py-5' : 'px-5 py-3.5'}`}>
            <span className={`${isDesktop ? 'text-[16px]' : 'text-[15px]'} text-[var(--color-foreground)]`}>
              {item.icon} {item.label}
            </span>
            <button
              onClick={() => toggle(item.key)}
              className={`w-[44px] h-[26px] rounded-full flex items-center transition-colors duration-200 ${
                notif[item.key] ? 'bg-[var(--color-primary)] justify-end' : 'bg-[var(--color-border-dark)] justify-start'
              }`}
            >
              <div className="w-[20px] h-[20px] rounded-full bg-white mx-[3px] shadow-sm" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )

  if (isDesktop) {
    return (
      <SettingsDesktopShell
        title="提醒通知"
        description="桌面端把提醒时间和通知类型拆开，避免仍然沿用手机上的紧凑单列。"
        onBack={goBack}
        sideTitle="Reminder Summary"
        sideDescription="这里控制学习提醒和各类推送的打开状态，适合在桌面端一次性统一调整。"
        sideContent={
          <div className="space-y-6">
            <div className="glass-card-elevated rounded-[28px] p-6">
              <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">Today</p>
              <div className="mt-4 space-y-3">
                <div className="rounded-[18px] bg-white/50 px-4 py-3 text-[14px] text-[var(--color-foreground)]/82">提醒时间：{notif.reminderTime}</div>
                <div className="rounded-[18px] bg-white/50 px-4 py-3 text-[14px] text-[var(--color-foreground)]/82">已开启：{toggleItems.filter((item) => notif[item.key]).length} 项通知</div>
              </div>
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-6">
          <div>{toggleCard}</div>
          <div>{reminderCard}</div>
        </div>
      </SettingsDesktopShell>
    )
  }

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
            提醒通知
          </h1>
        </div>

        {/* ===== 内容 ===== */}
        <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-4">

          {/* ----- 学习提醒时间 ----- */}
          <div className="bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5 space-y-3" style={{ boxShadow: 'var(--shadow-card)' }}>
            <h2 className="text-[16px] font-semibold text-[var(--color-foreground)]">学习提醒</h2>
            <p className="text-[12px] text-[var(--color-muted-light)]">设置每日学习提醒时间，养成好习惯</p>

            <div className="flex items-center justify-between px-4 py-3 bg-[var(--color-primary-light)] rounded-[var(--radius-sm)]">
              <div className="flex items-center gap-2">
                <span className="text-[18px]">⏰</span>
                <span className="text-[14px] font-medium text-[var(--color-foreground)]">每日提醒时间</span>
              </div>
              {/* HTML5 原生时间选择器 */}
              <input
                type="time"
                value={notif.reminderTime}
                onChange={e => update({ reminderTime: e.target.value })}
                className="text-[16px] font-bold text-[var(--color-primary)] bg-transparent border-none outline-none cursor-pointer"
              />
            </div>
          </div>

          {/* ----- 通知开关列表 ----- */}
          <div className="bg-[var(--color-card)] rounded-[var(--radius-lg)] overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            {toggleItems.map((item, i) => (
              <div key={item.key}>
                {i > 0 && <div className="h-px bg-[var(--color-border)] mx-4" />}
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-[15px] text-[var(--color-foreground)]">
                    {item.icon} {item.label}
                  </span>
                  <button
                    onClick={() => toggle(item.key)}
                    className={`w-[44px] h-[26px] rounded-full flex items-center transition-colors duration-200 ${
                      notif[item.key] ? 'bg-[var(--color-primary)] justify-end' : 'bg-[var(--color-border-dark)] justify-start'
                    }`}
                  >
                    <div className="w-[20px] h-[20px] rounded-full bg-white mx-[3px] shadow-sm" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
