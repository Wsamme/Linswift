/**
 * 注册页
 * - 风格延续 LoginPage（橙色背景 + 白色卡片）
 * - 用户名 + 邮箱 + 密码 + 确认密码
 * - 调用 Supabase Auth signUp
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Mail, Lock, Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { signUp } = useAuth()

  // ===== 表单状态 =====
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false) // 注册成功提示

  // ===== 注册处理 =====
  const handleRegister = async () => {
    setError('')

    // 前端验证
    if (!email.trim()) return setError('请输入邮箱')
    if (!password.trim()) return setError('请输入密码')
    if (password.length < 6) return setError('密码至少需要 6 个字符')
    if (password !== confirmPassword) return setError('两次密码不一致')

    setLoading(true)
    const { error: signUpError } = await signUp(email, password, username || undefined)
    setLoading(false)

    if (signUpError) {
      setError(signUpError)
    } else {
      // 注册成功 — Supabase 默认会发验证邮件
      // 但对于开发阶段，我们可以直接跳转
      setSuccess(true)
      setTimeout(() => navigate('/learn'), 1500)
    }
  }

  return (
    <div className="h-full flex justify-center bg-[var(--color-primary)]">
      <div className="w-full max-w-[390px] h-full flex flex-col relative overflow-hidden">
        {/* ===== 顶部品牌区域 ===== */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 pt-12">
          {/* 返回按钮 */}
          <button
            onClick={() => navigate('/login')}
            className="absolute top-12 left-5 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center"
          >
            <ArrowLeft size={20} className="text-white" />
          </button>

          {/* Logo */}
          <div className="w-[64px] h-[64px] rounded-full bg-white/20 flex items-center justify-center mb-3">
            <span className="text-white text-[28px] font-extrabold">L</span>
          </div>
          <h1 className="text-white text-[24px] font-bold tracking-tight">加入 Linswift</h1>
          <p className="text-white/80 text-[13px] mt-1.5">开启你的 AI 英语学习之旅</p>
        </div>

        {/* ===== 注册卡片 ===== */}
        <div className="bg-white rounded-t-[28px] px-7 pt-7 pb-10 shadow-lg">
          <h2 className="text-[var(--color-foreground)] text-[20px] font-bold mb-1 font-secondary">
            创建账号
          </h2>
          <p className="text-[var(--color-muted)] text-[13px] mb-5">填写以下信息完成注册</p>

          {/* 错误提示 */}
          {error && (
            <div className="mb-4 px-4 py-2.5 bg-[var(--color-error)]/10 border border-[var(--color-error)]/20 rounded-[var(--radius-sm)]">
              <p className="text-[13px] text-[var(--color-error)]">{error}</p>
            </div>
          )}

          {/* 成功提示 */}
          {success && (
            <div className="mb-4 px-4 py-2.5 bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 rounded-[var(--radius-sm)]">
              <p className="text-[13px] text-[var(--color-success)]">注册成功！正在跳转...</p>
            </div>
          )}

          {/* 用户名 */}
          <div className="flex items-center gap-3 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)] px-4 py-3 mb-3">
            <User size={18} className="text-[var(--color-muted)] shrink-0" />
            <input
              type="text"
              placeholder="用户名（可选）"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="flex-1 bg-transparent text-[14px] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-light)] outline-none"
            />
          </div>

          {/* 邮箱 */}
          <div className="flex items-center gap-3 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)] px-4 py-3 mb-3">
            <Mail size={18} className="text-[var(--color-muted)] shrink-0" />
            <input
              type="email"
              placeholder="邮箱"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="flex-1 bg-transparent text-[14px] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-light)] outline-none"
            />
          </div>

          {/* 密码 */}
          <div className="flex items-center gap-3 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)] px-4 py-3 mb-3">
            <Lock size={18} className="text-[var(--color-muted)] shrink-0" />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="密码（至少 6 位）"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="flex-1 bg-transparent text-[14px] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-light)] outline-none"
            />
            <button onClick={() => setShowPassword(!showPassword)} className="shrink-0">
              {showPassword ? (
                <EyeOff size={18} className="text-[var(--color-muted)]" />
              ) : (
                <Eye size={18} className="text-[var(--color-muted)]" />
              )}
            </button>
          </div>

          {/* 确认密码 */}
          <div className="flex items-center gap-3 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)] px-4 py-3 mb-5">
            <Lock size={18} className="text-[var(--color-muted)] shrink-0" />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="确认密码"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRegister()}
              className="flex-1 bg-transparent text-[14px] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-light)] outline-none"
            />
          </div>

          {/* 注册按钮 */}
          <button
            onClick={handleRegister}
            disabled={loading}
            className="w-full py-3.5 bg-[var(--color-primary)] text-white text-[15px] font-semibold rounded-[var(--radius-sm)] active:scale-[0.98] transition-transform disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? '注册中...' : '注册'}
          </button>

          {/* 已有账号 */}
          <p className="text-center text-[13px] text-[var(--color-muted)] mt-5">
            已有账号？
            <span
              onClick={() => navigate('/login')}
              className="text-[var(--color-primary)] font-semibold ml-1 cursor-pointer"
            >
              登录
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}
