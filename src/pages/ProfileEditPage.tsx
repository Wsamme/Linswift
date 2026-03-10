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
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Camera, Loader2, ChevronRight } from 'lucide-react'
import { useProfile } from '../hooks/useProfile'
import { uploadFile } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

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
  const navigate = useNavigate()
  const { user } = useAuth()
  const { profile, updateProfile } = useProfile()

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
        navigate(-1)
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

  return (
    <div className="h-full flex justify-center bg-[var(--color-background-secondary)]">
      <div className="w-full max-w-[390px] flex flex-col">
        {/* ===== Header ===== */}
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1">
              <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
            </button>
            <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">编辑资料</h1>
          </div>
          {/* 保存按钮 */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-[var(--color-primary)] text-white text-[14px] font-medium rounded-full active:scale-95 transition-transform disabled:opacity-60"
          >
            {saving ? '保存中...' : savedMsg ? '✓ 已保存' : '保存'}
          </button>
        </div>

        {/* ===== 可滚动内容 ===== */}
        <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-4">

          {/* ===== 头像区域 ===== */}
          <div className="bg-[var(--color-card)] rounded-[var(--radius-lg)] py-6 flex flex-col items-center gap-2" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="relative">
              {avatarUrl ? (
                <img src={avatarUrl} alt="头像" className="w-[80px] h-[80px] rounded-full object-cover" />
              ) : (
                <div className="w-[80px] h-[80px] rounded-full bg-[var(--color-primary)] flex items-center justify-center">
                  <span className="text-white text-[32px] font-bold">{avatarLetter}</span>
                </div>
              )}
              {/* 相机图标 */}
              <label className="absolute bottom-0 right-0 w-[28px] h-[28px] rounded-full bg-white flex items-center justify-center cursor-pointer shadow-md border border-[var(--color-border)]">
                {uploadingAvatar ? (
                  <Loader2 size={14} className="text-[var(--color-primary)] animate-spin" />
                ) : (
                  <Camera size={14} className="text-[var(--color-muted)]" />
                )}
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} disabled={uploadingAvatar} />
              </label>
            </div>
            <p className="text-[13px] text-[var(--color-primary)]">点击更换头像</p>
          </div>

          {/* ===== 错误提示 ===== */}
          {error && (
            <div className="px-4 py-2.5 bg-[var(--color-error)]/10 border border-[var(--color-error)]/20 rounded-[var(--radius-sm)]">
              <p className="text-[13px] text-[var(--color-error)]">{error}</p>
            </div>
          )}

          {/* ===== 基本信息表单 ===== */}
          <div className="bg-[var(--color-card)] rounded-[var(--radius-lg)] overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            {/* 昵称 */}
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-[15px] text-[var(--color-muted)] shrink-0 w-[80px]">昵称</span>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="输入昵称"
                className="flex-1 text-right text-[15px] text-[var(--color-foreground)] bg-transparent outline-none placeholder:text-[var(--color-muted-light)]"
              />
            </div>

            <div className="h-px bg-[var(--color-border)] mx-4" />

            {/* 邮箱（只读） */}
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-[15px] text-[var(--color-muted)] shrink-0 w-[80px]">邮箱</span>
              <span className="text-[15px] text-[var(--color-foreground)] truncate">{user?.email || '-'}</span>
            </div>

            <div className="h-px bg-[var(--color-border)] mx-4" />

            {/* 性别 */}
            <button
              className="w-full flex items-center justify-between px-5 py-3.5 active:bg-[var(--color-background-secondary)] transition-colors"
              onClick={() => setShowGenderPicker(true)}
            >
              <span className="text-[15px] text-[var(--color-muted)] shrink-0 w-[80px] text-left">性别</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[15px] text-[var(--color-foreground)]">{extra.gender || '未设置'}</span>
                <ChevronRight size={16} className="text-[var(--color-muted)]" />
              </div>
            </button>

            <div className="h-px bg-[var(--color-border)] mx-4" />

            {/* 生日 */}
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-[15px] text-[var(--color-muted)] shrink-0 w-[80px]">生日</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={extra.birthday}
                  onChange={e => updateExtra({ birthday: e.target.value })}
                  className="text-[15px] text-[var(--color-foreground)] bg-transparent outline-none cursor-pointer"
                />
                <ChevronRight size={16} className="text-[var(--color-muted)]" />
              </div>
            </div>

            <div className="h-px bg-[var(--color-border)] mx-4" />

            {/* 学习目标 */}
            <button
              className="w-full flex items-center justify-between px-5 py-3.5 active:bg-[var(--color-background-secondary)] transition-colors"
              onClick={() => setShowGoalPicker(true)}
            >
              <span className="text-[15px] text-[var(--color-muted)] shrink-0 w-[80px] text-left">学习目标</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[15px] text-[var(--color-foreground)] truncate max-w-[180px]">
                  {extra.goal || '未设置'}
                </span>
                <ChevronRight size={16} className="text-[var(--color-muted)]" />
              </div>
            </button>
          </div>

          {/* ===== 个人简介 ===== */}
          <div className="bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5 space-y-2" style={{ boxShadow: 'var(--shadow-card)' }}>
            <span className="text-[15px] text-[var(--color-muted)]">个人简介</span>
            <textarea
              value={extra.bio}
              onChange={e => {
                if (e.target.value.length <= 200) {
                  updateExtra({ bio: e.target.value })
                }
              }}
              placeholder="介绍一下自己吧..."
              className="w-full h-[80px] text-[14px] text-[var(--color-foreground)] bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)] p-3 outline-none resize-none placeholder:text-[var(--color-muted-light)] leading-relaxed"
            />
            <div className="flex justify-end">
              <span className="text-[12px] text-[var(--color-muted)]">{bioCount}/200</span>
            </div>
          </div>

          {/* ===== 当前等级 ===== */}
          <div className="bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5 space-y-2.5" style={{ boxShadow: 'var(--shadow-card)' }}>
            <span className="text-[13px] text-[var(--color-muted)]">当前等级</span>
            <div className="flex items-center gap-3">
              <span className="text-[13px] px-3.5 py-1 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] font-semibold">
                🏅 {profile?.level && profile.level >= 3 ? '高级学员' : profile?.level === 2 ? '中级学员' : '初级学员'}
              </span>
              <span className="text-[12px] text-[var(--color-muted)]">
                距离下一等级还需 320 积分
              </span>
            </div>
          </div>
        </div>

        {/* ===== 性别选择弹窗 ===== */}
        {showGenderPicker && (
          <div className="absolute inset-0 bg-black/40 flex items-end z-50" onClick={() => setShowGenderPicker(false)}>
            <div className="w-full bg-[var(--color-card)] rounded-t-[24px] px-5 pt-5 pb-8" onClick={e => e.stopPropagation()}>
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
          <div className="absolute inset-0 bg-black/40 flex items-end z-50" onClick={() => setShowGoalPicker(false)}>
            <div className="w-full bg-[var(--color-card)] rounded-t-[24px] px-5 pt-5 pb-8" onClick={e => e.stopPropagation()}>
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
