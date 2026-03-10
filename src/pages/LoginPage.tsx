/**
 * 登录页 - 已接入 Supabase Auth
 *
 * 功能：
 * 1. 邮箱 + 密码登录（调用 supabase.auth.signInWithPassword）
 * 2. 显示 loading 和错误状态
 * 3. 登录成功后自动跳转到 /learn
 * 4. 已登录用户访问此页会自动跳转到 /learn
 * 5. "注册" 链接跳转到 /register
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const navigate = useNavigate()
  const { user, signIn, signInWithGoogle, signInWithApple, loading: authLoading } = useAuth()

  // ===== 表单状态 =====
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false) // 登录按钮 loading
  const [error, setError] = useState('')

  // 如果已经登录，直接跳转到首页
  useEffect(() => {
    if (!authLoading && user) {
      navigate('/learn', { replace: true })
    }
  }, [user, authLoading, navigate])

  // ===== 登录处理 =====
  const handleLogin = async () => {
    setError('')

    // 前端验证
    if (!email.trim()) return setError('请输入邮箱')
    if (!password.trim()) return setError('请输入密码')

    setLoading(true)
    const { error: signInError } = await signIn(email, password)
    setLoading(false)

    if (signInError) {
      setError(signInError)
    }
    // 登录成功后 AuthContext 会更新 user，触发上面的 useEffect 自动跳转
  }

  // 加载中不显示登录页
  if (authLoading) return null

  return (
    <div className="h-full flex justify-center bg-[var(--color-primary)]">
      <div className="w-full max-w-[390px] h-full flex flex-col relative overflow-hidden">
        {/* ===== 顶部品牌区域 ===== */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 pt-16">
          {/* Logo 圆形 */}
          <div className="w-[72px] h-[72px] rounded-full bg-white/20 flex items-center justify-center mb-4">
            <span className="text-white text-[32px] font-extrabold">L</span>
          </div>
          {/* 品牌名 */}
          <h1 className="text-white text-[28px] font-bold tracking-tight">Linswift</h1>
          {/* 标语 */}
          <p className="text-white/80 text-[14px] mt-2">AI 驱动的智能英语学习</p>
        </div>

        {/* ===== 浮动登录卡片 ===== */}
        <div className="bg-white rounded-t-[28px] px-7 pt-8 pb-10 shadow-lg">
          <h2 className="text-[var(--color-foreground)] text-[20px] font-bold mb-1 font-secondary">
            欢迎回来
          </h2>
          <p className="text-[var(--color-muted)] text-[13px] mb-6">
            登录你的 Linswift 账号继续学习之旅
          </p>

          {/* 错误提示 */}
          {error && (
            <div className="mb-4 px-4 py-2.5 bg-[var(--color-error)]/10 border border-[var(--color-error)]/20 rounded-[var(--radius-sm)]">
              <p className="text-[13px] text-[var(--color-error)]">{error}</p>
            </div>
          )}

          {/* 邮箱输入框 */}
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

          {/* 密码输入框 */}
          <div className="flex items-center gap-3 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)] px-4 py-3 mb-5">
            <Lock size={18} className="text-[var(--color-muted)] shrink-0" />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="密码"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
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

          {/* 登录按钮 */}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full py-3.5 bg-[var(--color-primary)] text-white text-[15px] font-semibold rounded-[var(--radius-sm)] active:scale-[0.98] transition-transform disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? '登录中...' : '登录'}
          </button>

          {/* 第三方登录 */}
          <div className="flex items-center gap-3 mt-6 mb-4">
            <div className="flex-1 h-px bg-[var(--color-border)]" />
            <span className="text-[12px] text-[var(--color-muted)]">其他方式登录</span>
            <div className="flex-1 h-px bg-[var(--color-border)]" />
          </div>

          <div className="flex justify-center gap-4">
            {/* Google OAuth 登录 */}
            <button
              onClick={async () => {
                setError('')
                const { error: e } = await signInWithGoogle()
                if (e) setError(e)
              }}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] active:scale-[0.98] transition-transform"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span className="text-[13px] font-semibold text-[var(--color-foreground)]">Google</span>
            </button>

            {/* Apple OAuth 登录 */}
            <button
              onClick={async () => {
                setError('')
                const { error: e } = await signInWithApple()
                if (e) setError(e)
              }}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-black rounded-[var(--radius-sm)] active:scale-[0.98] transition-transform"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              <span className="text-[13px] font-semibold text-white">Apple</span>
            </button>
          </div>

          {/* 注册入口 */}
          <p className="text-center text-[13px] text-[var(--color-muted)] mt-5">
            还没有账号？
            <span
              onClick={() => navigate('/register')}
              className="text-[var(--color-primary)] font-semibold ml-1 cursor-pointer"
            >
              注册
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}
