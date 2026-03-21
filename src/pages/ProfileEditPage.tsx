/**
 * 个人资料编辑页 —— 参照 pencil 设计稿 rjv1c
 *
 * 功能：
 * 1. 头像上传（Supabase Storage avatars 桶）
 * 2. 昵称编辑
 * 3. 邮箱（只读）
 * 4. 性别选择
 * 5. 生日选择
 * 6. 学习目标
 * 7. 个人简介（200字限制）
 * 8. 当前等级显示
 * 9. 保存到 profiles + localStorage（扩展字段）
 */

import { useState, useEffect } from 'react'
import { ChevronLeft, Camera, Loader2, ChevronRight } from 'lucide-react'
import { useProfile } from '../hooks/useProfile'
import { uploadFile } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLogicalBack } from '../hooks/useLogicalBack'
import { useMediaQuery } from '../hooks/useMediaQuery'

// 扩展资料的 localStorage key（数据库 profiles 表只存 username + avatar_url，其余存本地）
const EXTRA_PROFILE_KEY = 'linswift_extra_profile'

interface ExtraProfile {
  gender: string        // 性别
  birthday: string      // 生日 YYYY-MM-DD
  goal: string          // 学习目标
  bio: string           // 个人简介
}

const DEFAULT_EXTRA: ExtraProfile = {
  gender: '',
  birthday: '',
  goal: '',
  bio: '',
}

function loadExtraProfile(): ExtraProfile {
  try {
    const raw = localStorage.getItem(EXTRA_PROFILE_KEY)
    return raw ? { ...DEFAULT_EXTRA, ...JSON.parse(raw) } : { ...DEFAULT_EXTRA }
  } catch {
    return { ...DEFAULT_EXTRA }
  }
}

function saveExtraProfile(data: ExtraProfile) {
  localStorage.setItem(EXTRA_PROFILE_KEY, JSON.stringify(data))
}

// 性别选项
const genderOptions = ['男', '女', '其他', '不愿透露']

// 学习目标选项
const goalOptions = ['通过雅思考试', '通过托福考试', '日常英语交流', '职场商务英语', '留学准备', '兴趣爱好', '其他']

export default function ProfileEditPage() {
  const goBack = useLogicalBack('/app/profile')
  const { user } = useAuth()
  const { profile, updateProfile } = useProfile()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  // ===== 表单状态 =====
  const [username, setUsername] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [extra, setExtra] = useState<ExtraProfile>(loadExtraProfile)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)
  const [error, setError] = useState('')

  // 弹窗状态
  const [showGenderPicker, setShowGenderPicker] = useState(false)
  const [showGoalPicker, setShowGoalPicker] = useState(false)

  // 初始化表单
  useEffect(() => {
    if (profile) {
      setUsername(profile.username || '')
      setAvatarUrl(profile.avatar_url)
    }
  }, [profile])

  // ===== 上传头像 =====
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件（JPG、PNG 等）')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('图片大小不能超过 5MB')
      return
    }

    setUploadingAvatar(true)
    setError('')
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${user.id}/avatar.${ext}`
      const url = await uploadFile('avatars', path, file)
      setAvatarUrl(url)
    } catch (err: any) {
      const msg = err?.message || String(err)
      if (msg.includes('Bucket not found') || msg.includes('not found')) {
        setError('头像存储桶尚未创建，请先执行 supabase-migration-v2.sql')
      } else if (msg.includes('row-level security') || msg.includes('policy')) {
        setError('Storage 权限不足，请执行 supabase-migration-v2.sql')
      } else if (msg.includes('Payload too large')) {
        setError('图片太大，请选择小于 5MB 的图片')
      } else {
        setError(`上传失败: ${msg}`)
      }
    }
    setUploadingAvatar(false)
  }

  // ===== 保存资料 =====
  const handleSave = async () => {
    setError('')
    setSaving(true)

    // 保存到 Supabase（username + avatar_url）
    const { error: saveError } = await updateProfile({
      username: username.trim() || undefined,
      avatar_url: avatarUrl || undefined,
    })

    // 保存扩展资料到 localStorage
    saveExtraProfile(extra)

    setSaving(false)

    if (saveError) {
      setError(`保存失败: ${saveError}`)
    } else {
      setSavedMsg(true)
      setTimeout(() => {
        setSavedMsg(false)
        goBack()
      }, 800)
    }
  }

  // 更新扩展字段
  const updateExtra = (partial: Partial<ExtraProfile>) => {
    setExtra(prev => ({ ...prev, ...partial }))
  }

  // 头像首字母
  const avatarLetter = (username || profile?.username || 'U').charAt(0).toUpperCase()
  const bioCount = extra.bio.length
  const levelLabel = profile?.level && profile.level >= 3 ? '高级学员' : profile?.level === 2 ? '中级学员' : '初级学员'

  const avatarEditor = (
    <div
      className={isDesktop
        ? 'glass-card-strong rounded-[30px] p-7'
        : 'bg-[var(--color-card)] rounded-[var(--radius-lg)] py-6 flex flex-col items-center gap-2'
      }
      style={isDesktop ? undefined : { boxShadow: 'var(--shadow-card)' }}
    >
      <div className={`relative ${isDesktop ? 'mx-auto mb-4 w-fit' : ''}`}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="头像" className={`${isDesktop ? 'h-[120px] w-[120px]' : 'w-[80px] h-[80px]'} rounded-full object-cover`} />
        ) : (
          <div className={`${isDesktop ? 'h-[120px] w-[120px]' : 'w-[80px] h-[80px]'} rounded-full bg-[var(--color-primary)] flex items-center justify-center`}>
            <span className={`text-white font-bold ${isDesktop ? 'text-[46px]' : 'text-[32px]'}`}>{avatarLetter}</span>
          </div>
        )}
        <label className={`absolute bottom-0 right-0 ${isDesktop ? 'h-[38px] w-[38px]' : 'w-[28px] h-[28px]'} rounded-full bg-white flex items-center justify-center cursor-pointer shadow-md border border-[var(--color-border)]`}>
          {uploadingAvatar ? (
            <Loader2 size={isDesktop ? 18 : 14} className="text-[var(--color-primary)] animate-spin" />
          ) : (
            <Camera size={isDesktop ? 18 : 14} className="text-[var(--color-muted)]" />
          )}
          <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} disabled={uploadingAvatar} />
        </label>
      </div>
      <div className={isDesktop ? 'text-center' : ''}>
        <p className={`font-semibold text-[var(--color-foreground)] ${isDesktop ? 'text-[22px]' : 'hidden'}`}>{username || profile?.username || '未设置昵称'}</p>
        <p className={`text-[var(--color-muted)] ${isDesktop ? 'mt-1 text-[13px]' : 'hidden'}`}>{user?.email || '-'}</p>
        <p className={`text-[var(--color-primary)] ${isDesktop ? 'mt-4 text-[15px] font-semibold' : 'text-[13px]'}`}>点击更换头像</p>
      </div>
    </div>
  )

  const baseInfoCard = (
    <div className={`${isDesktop ? 'glass-card-elevated rounded-[28px]' : 'bg-[var(--color-card)] rounded-[var(--radius-lg)]'} overflow-hidden`} style={isDesktop ? undefined : { boxShadow: 'var(--shadow-card)' }}>
      <div className={`flex items-center justify-between ${isDesktop ? 'px-6 py-5' : 'px-5 py-3.5'}`}>
        <span className={`text-[var(--color-muted)] shrink-0 ${isDesktop ? 'w-[110px] text-[14px]' : 'w-[80px] text-[15px]'}`}>昵称</span>
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="输入昵称"
          className={`flex-1 text-right bg-transparent outline-none placeholder:text-[var(--color-muted-light)] text-[var(--color-foreground)] ${isDesktop ? 'text-[16px]' : 'text-[15px]'}`}
        />
      </div>

      <div className="h-px bg-[var(--color-border)] mx-4" />

      <div className={`flex items-center justify-between ${isDesktop ? 'px-6 py-5' : 'px-5 py-3.5'}`}>
        <span className={`text-[var(--color-muted)] shrink-0 ${isDesktop ? 'w-[110px] text-[14px]' : 'w-[80px] text-[15px]'}`}>邮箱</span>
        <span className={`truncate text-[var(--color-foreground)] ${isDesktop ? 'text-[16px]' : 'text-[15px]'}`}>{user?.email || '-'}</span>
      </div>

      <div className="h-px bg-[var(--color-border)] mx-4" />

      <button
        className={`w-full flex items-center justify-between ${isDesktop ? 'px-6 py-5 hover:bg-white/40' : 'px-5 py-3.5 active:bg-[var(--color-background-secondary)]'} transition-colors`}
        onClick={() => setShowGenderPicker(true)}
      >
        <span className={`text-[var(--color-muted)] shrink-0 text-left ${isDesktop ? 'w-[110px] text-[14px]' : 'w-[80px] text-[15px]'}`}>性别</span>
        <div className="flex items-center gap-1.5">
          <span className={`text-[var(--color-foreground)] ${isDesktop ? 'text-[16px]' : 'text-[15px]'}`}>{extra.gender || '未设置'}</span>
          <ChevronRight size={16} className="text-[var(--color-muted)]" />
        </div>
      </button>

      <div className="h-px bg-[var(--color-border)] mx-4" />

      <div className={`flex items-center justify-between ${isDesktop ? 'px-6 py-5' : 'px-5 py-3.5'}`}>
        <span className={`text-[var(--color-muted)] shrink-0 ${isDesktop ? 'w-[110px] text-[14px]' : 'w-[80px] text-[15px]'}`}>生日</span>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={extra.birthday}
            onChange={e => updateExtra({ birthday: e.target.value })}
            className={`bg-transparent outline-none cursor-pointer text-[var(--color-foreground)] ${isDesktop ? 'text-[16px]' : 'text-[15px]'}`}
          />
          <ChevronRight size={16} className="text-[var(--color-muted)]" />
        </div>
      </div>

      <div className="h-px bg-[var(--color-border)] mx-4" />

      <button
        className={`w-full flex items-center justify-between ${isDesktop ? 'px-6 py-5 hover:bg-white/40' : 'px-5 py-3.5 active:bg-[var(--color-background-secondary)]'} transition-colors`}
        onClick={() => setShowGoalPicker(true)}
      >
        <span className={`text-[var(--color-muted)] shrink-0 text-left ${isDesktop ? 'w-[110px] text-[14px]' : 'w-[80px] text-[15px]'}`}>学习目标</span>
        <div className="flex items-center gap-1.5">
          <span className={`truncate text-[var(--color-foreground)] ${isDesktop ? 'max-w-[280px] text-[16px]' : 'max-w-[180px] text-[15px]'}`}>
            {extra.goal || '未设置'}
          </span>
          <ChevronRight size={16} className="text-[var(--color-muted)]" />
        </div>
      </button>
    </div>
  )

  const bioCard = (
    <div className={`${isDesktop ? 'glass-card-elevated rounded-[28px] p-6' : 'bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5'} space-y-2`} style={isDesktop ? undefined : { boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-center justify-between">
        <span className={`text-[var(--color-muted)] ${isDesktop ? 'text-[14px] font-medium' : 'text-[15px]'}`}>个人简介</span>
        <span className="text-[12px] text-[var(--color-muted)]">{bioCount}/200</span>
      </div>
      <textarea
        value={extra.bio}
        onChange={e => {
          if (e.target.value.length <= 200) {
            updateExtra({ bio: e.target.value })
          }
        }}
        placeholder="介绍一下自己吧..."
        className={`w-full text-[var(--color-foreground)] bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)] outline-none resize-none placeholder:text-[var(--color-muted-light)] leading-relaxed ${isDesktop ? 'h-[160px] p-4 text-[15px]' : 'h-[80px] p-3 text-[14px]'}`}
      />
    </div>
  )

  const levelCard = (
    <div className={`${isDesktop ? 'glass-card-elevated rounded-[28px] p-6' : 'bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5'} space-y-3`} style={isDesktop ? undefined : { boxShadow: 'var(--shadow-card)' }}>
      <span className={`text-[var(--color-muted)] ${isDesktop ? 'text-[14px] font-medium' : 'text-[13px]'}`}>当前等级</span>
      <div className={`flex ${isDesktop ? 'items-end justify-between gap-4' : 'items-center gap-3'}`}>
        <div>
          <span className={`inline-flex items-center rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] font-semibold ${isDesktop ? 'px-4 py-2 text-[14px]' : 'text-[13px] px-3.5 py-1'}`}>
            🏅 {levelLabel}
          </span>
          {isDesktop && (
            <p className="mt-3 text-[28px] font-bold text-[var(--color-foreground)]">{profile?.level || 1} 级</p>
          )}
        </div>
        <span className={`text-[var(--color-muted)] ${isDesktop ? 'text-[14px]' : 'text-[12px]'}`}>
          距离下一等级还需 320 积分
        </span>
      </div>
    </div>
  )

  const desktopOverviewCard = (
    <div className="glass-card-elevated rounded-[28px] p-6">
      <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">Account Snapshot</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-[18px] bg-white/50 px-4 py-4">
          <p className="text-[12px] text-[var(--color-muted)]">昵称长度</p>
          <p className="mt-2 text-[26px] font-bold text-[var(--color-foreground)]">{Math.max(1, username.trim().length || profile?.username?.length || 0)}</p>
        </div>
        <div className="rounded-[18px] bg-white/50 px-4 py-4">
          <p className="text-[12px] text-[var(--color-muted)]">资料完成度</p>
          <p className="mt-2 text-[26px] font-bold text-[var(--color-foreground)]">
            {[username, extra.gender, extra.birthday, extra.goal, extra.bio].filter(Boolean).length * 20}%
          </p>
        </div>
      </div>
      <div className="mt-4 rounded-[18px] bg-white/50 px-4 py-3 text-[14px] text-[var(--color-foreground)]/78">
        保存后会同步昵称与头像到云端，其余扩展资料继续保存在本地设备。
      </div>
    </div>
  )

  const pickerOverlayClass = isDesktop
    ? 'fixed inset-0 bg-black/28 backdrop-blur-sm flex items-center justify-center z-50'
    : 'absolute inset-0 bg-black/40 flex items-end z-50'
  const pickerSheetClass = isDesktop
    ? 'glass-modal-sheet glass-modal-sheet-desktop w-full max-w-[420px] px-6 pt-6 pb-7'
    : 'w-full bg-[var(--color-card)] rounded-t-[24px] px-5 pt-5 pb-8'

  return (
    <div className={isDesktop ? 'glass-page h-full overflow-y-auto' : 'h-full flex justify-center bg-[var(--color-background-secondary)]'}>
      <div className={isDesktop ? 'mx-auto max-w-[1240px] px-8 py-8' : 'w-full max-w-[390px] flex flex-col'}>
        {/* ===== Header ===== */}
        <div className={`flex items-center justify-between ${isDesktop ? 'mb-6' : 'px-5 py-4'}`}>
          <div className="flex items-center gap-3">
            <button onClick={goBack} className={`rounded-full ${isDesktop ? 'glass-card-elevated p-2.5' : 'p-1'}`}>
              <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
            </button>
            <div>
              <h1 className={`font-bold text-[var(--color-foreground)] font-secondary ${isDesktop ? 'text-[30px]' : 'text-[18px]'}`}>编辑资料</h1>
              {isDesktop && <p className="mt-1 text-[13px] text-[var(--color-muted)]">桌面端编辑台把头像、基础资料和成长信息拆成更稳定的工作区。</p>}
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`bg-[var(--color-primary)] text-white font-medium rounded-full active:scale-95 transition-transform disabled:opacity-60 ${isDesktop ? 'px-6 py-3 text-[15px] shadow-[0_16px_34px_rgba(255,132,0,0.24)]' : 'px-4 py-1.5 text-[14px]'}`}
          >
            {saving ? '保存中...' : savedMsg ? '✓ 已保存' : '保存'}
          </button>
        </div>

        {isDesktop ? (
          <div className="grid grid-cols-[360px_minmax(0,1fr)] gap-6">
            <div className="space-y-6">
              {avatarEditor}
              {desktopOverviewCard}
              <div className="glass-card-elevated rounded-[28px] p-6">
                <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">Profile Notes</p>
                <div className="mt-4 space-y-3 text-[14px] text-[var(--color-foreground)]/78">
                  <div className="rounded-[18px] bg-white/48 px-4 py-3">邮箱地址在桌面端只读，避免误改登录凭据。</div>
                  <div className="rounded-[18px] bg-white/48 px-4 py-3">基础资料集中在右侧编辑，左侧只保留预览和成长信息。</div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {error && (
                <div className="rounded-[22px] border border-[var(--color-error)]/20 bg-[var(--color-error)]/10 px-4 py-3">
                  <p className="text-[14px] text-[var(--color-error)]">{error}</p>
                </div>
              )}

              <div className="glass-card-strong rounded-[32px] p-6">
                <div className="mb-5">
                  <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">Identity</p>
                  <h2 className="mt-2 text-[24px] font-bold text-[var(--color-foreground)]">基础资料</h2>
                </div>
                {baseInfoCard}
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_280px] gap-6">
                <div className="glass-card-strong rounded-[32px] p-6">
                  <div className="mb-5">
                    <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">About</p>
                    <h2 className="mt-2 text-[24px] font-bold text-[var(--color-foreground)]">个人简介</h2>
                  </div>
                  {bioCard}
                </div>

                <div className="glass-card-strong rounded-[32px] p-6">
                  <div className="mb-5">
                    <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">Progress</p>
                    <h2 className="mt-2 text-[24px] font-bold text-[var(--color-foreground)]">成长状态</h2>
                  </div>
                  {levelCard}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-4">
            {avatarEditor}

            {error && (
              <div className="px-4 py-2.5 bg-[var(--color-error)]/10 border border-[var(--color-error)]/20 rounded-[var(--radius-sm)]">
                <p className="text-[13px] text-[var(--color-error)]">{error}</p>
              </div>
            )}

            {baseInfoCard}
            {bioCard}
            {levelCard}
          </div>
        )}

        {/* ===== 性别选择弹窗 ===== */}
        {showGenderPicker && (
          <div className={pickerOverlayClass} onClick={() => setShowGenderPicker(false)}>
            <div className={pickerSheetClass} onClick={e => e.stopPropagation()}>
              <h3 className="text-[16px] font-bold text-[var(--color-foreground)] mb-4 text-center">选择性别</h3>
              <div className="space-y-1">
                {genderOptions.map(g => (
                  <button
                    key={g}
                    onClick={() => { updateExtra({ gender: g }); setShowGenderPicker(false) }}
                    className={`w-full py-3 rounded-[var(--radius-sm)] text-[15px] transition-colors ${
                      extra.gender === g
                        ? 'bg-[var(--color-primary)] text-white font-semibold'
                        : 'bg-[var(--color-background-secondary)] text-[var(--color-foreground)] active:bg-[var(--color-border)]'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== 学习目标选择弹窗 ===== */}
        {showGoalPicker && (
          <div className={pickerOverlayClass} onClick={() => setShowGoalPicker(false)}>
            <div className={pickerSheetClass} onClick={e => e.stopPropagation()}>
              <h3 className="text-[16px] font-bold text-[var(--color-foreground)] mb-4 text-center">选择学习目标</h3>
              <div className="space-y-1">
                {goalOptions.map(g => (
                  <button
                    key={g}
                    onClick={() => { updateExtra({ goal: g }); setShowGoalPicker(false) }}
                    className={`w-full py-3 rounded-[var(--radius-sm)] text-[15px] transition-colors ${
                      extra.goal === g
                        ? 'bg-[var(--color-primary)] text-white font-semibold'
                        : 'bg-[var(--color-background-secondary)] text-[var(--color-foreground)] active:bg-[var(--color-border)]'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
