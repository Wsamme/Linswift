/**
 * 登录页 - 已接入 Supabase Auth
 *
 * 桌面端：全屏粒子背景 + 毛玻璃表单面板
 * 移动端：深色粒子背景 + 毛玻璃浮动卡片
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, Loader2, Sparkles, ArrowLeft } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import Particles from '../components/reactbits/Particles'

export default function LoginPage() {
  const navigate = useNavigate()
  const { user, signIn, signInWithGoogle, signInWithApple, loading: authLoading } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!authLoading && user) {
      navigate('/app/learn', { replace: true })
    }
  }, [user, authLoading, navigate])

  const handleLogin = async () => {
    setError('')
    if (!email.trim()) return setError('请输入邮箱')
    if (!password.trim()) return setError('请输入密码')

    setLoading(true)
    const { error: signInError } = await signIn(email, password)
    setLoading(false)
    if (signInError) setError(signInError)
  }

  if (authLoading) return null

  /* ====== glass 样式 ====== */
  const glassPanel = 'backdrop-blur-xl bg-white/35 border border-white/30 shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.4)]'
  const glassInput = 'backdrop-blur-md bg-white/30 border border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]'

  return (
    <div className="h-full bg-gradient-to-br from-[#FFFBF5] to-[#FFF5EB]">
      {/* 全局粒子背景（桌面端） */}
      <div className="hidden lg:block fixed inset-0 z-0">
        <Particles
          particleColors={['#FF8400']}
          particleBaseSize={800}
          particleCount={180}
          particleSpread={10}
          speed={0.06}
          alphaParticles={true}
          sizeRandomness={0.9}
          cameraDistance={20}
          moveParticlesOnHover={true}
          particleHoverFactor={0.4}
        />
      </div>

      {/* 桌面端双栏容器（限制最大宽度，居中） */}
      <div className="hidden lg:flex h-full max-w-[1400px] mx-auto relative z-10">
        {/* 左侧品牌区 */}
        <div className="w-[50%] xl:w-[55%] flex flex-col justify-center px-16 xl:px-24 relative">
          <button onClick={() => navigate('/')}
            className="absolute top-8 left-8 flex items-center gap-2 text-[#999] hover:text-[#1A1A1A] text-[14px] transition-colors">
            <ArrowLeft size={16} />
            返回官网
          </button>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-[#FF8400]/15 flex items-center justify-center">
            <Sparkles size={24} className="text-[#FF8400]" />
          </div>
          <span className="text-[28px] font-extrabold tracking-tight text-[#1A1A1A]">Linswift</span>
        </div>

        <h2 className="text-[36px] xl:text-[42px] font-extrabold leading-[1.15] mb-4 text-[#1A1A1A]">
          AI 驱动的<br />智能英语学习
        </h2>
        <p className="text-[16px] text-[#666] leading-relaxed max-w-[380px]">
          翻译、阅读、听力、口语、语法、游戏化记忆，
          多维度覆盖英语学习全链路，让你效率提升 3 倍。
        </p>

        <div className="flex gap-10 mt-10">
          {[
            { num: '50K+', label: '活跃用户' },
            { num: '4.9', label: 'App 评分' },
          ].map(s => (
            <div key={s.label}>
              <div className="text-[28px] font-extrabold text-[#FF8400]">{s.num}</div>
              <div className="text-[13px] text-[#999] mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

        {/* 右侧登录表单（glass） */}
        <div className="flex-1 flex items-center justify-center p-8">
        <div className={`${glassPanel} rounded-3xl w-full max-w-[440px] px-10 py-12`}>
          <button onClick={() => navigate('/')}
            className="flex items-center gap-2 text-[#999] hover:text-[#1A1A1A] text-[14px] mb-8 transition-colors">
            <ArrowLeft size={16} />
            返回官网
          </button>

          <h2 className="text-[28px] font-bold mb-1 text-[#1A1A1A]">欢迎回来</h2>
          <p className="text-[14px] text-[#888] mb-6">登录你的 Linswift 账号继续学习之旅</p>

          {error && (
            <div className="mb-4 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-[13px] text-red-600">{error}</p>
            </div>
          )}

          <div className={`${glassInput} flex items-center gap-3 rounded-xl px-4 py-3.5 mb-3`}>
            <Mail size={18} className="text-[#999] shrink-0" />
            <input type="email" placeholder="邮箱" value={email}
              onChange={e => setEmail(e.target.value)}
              className="flex-1 bg-transparent text-[14px] text-[#1A1A1A] placeholder:text-[#bbb] outline-none" />
          </div>

          <div className={`${glassInput} flex items-center gap-3 rounded-xl px-4 py-3.5 mb-5`}>
            <Lock size={18} className="text-[#999] shrink-0" />
            <input type={showPassword ? 'text' : 'password'} placeholder="密码"
              value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="flex-1 bg-transparent text-[14px] text-[#1A1A1A] placeholder:text-[#bbb] outline-none" />
            <button onClick={() => setShowPassword(!showPassword)} className="shrink-0">
              {showPassword
                ? <EyeOff size={18} className="text-[#999]" />
                : <Eye size={18} className="text-[#999]" />}
            </button>
          </div>

          <button onClick={handleLogin} disabled={loading}
            className="w-full py-3.5 bg-[#FF8400] hover:bg-[#E87600] text-white text-[15px] font-semibold rounded-xl active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2">
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? '登录中...' : '登录'}
          </button>

          <div className="flex items-center gap-3 mt-6 mb-4">
            <div className="flex-1 h-px bg-black/10" />
            <span className="text-[12px] text-[#999]">其他方式登录</span>
            <div className="flex-1 h-px bg-black/10" />
          </div>

          <div className="flex justify-center gap-4">
            <button onClick={async () => { setError(''); const { error: e } = await signInWithGoogle(); if (e) setError(e) }}
              className={`${glassInput} flex-1 flex items-center justify-center gap-2 py-3 rounded-xl active:scale-[0.98] hover:bg-white/60 transition-all`}>
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span className="text-[13px] font-semibold text-[#1A1A1A]">Google</span>
            </button>

            <button onClick={async () => { setError(''); const { error: e } = await signInWithApple(); if (e) setError(e) }}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-black/80 backdrop-blur-md border border-black/10 rounded-xl active:scale-[0.98] hover:bg-black/90 transition-all">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              <span className="text-[13px] font-semibold text-white">Apple</span>
            </button>
          </div>

          <p className="text-center text-[13px] text-[#999] mt-5">
            还没有账号？
            <span onClick={() => navigate('/register')}
              className="text-[#FF8400] font-semibold ml-1 cursor-pointer hover:underline">注册</span>
          </p>
        </div>
        </div>
      </div>

      {/* ===== 移动端 ===== */}
      <div className="lg:hidden flex-1 flex flex-col">
        {/* 移动端顶部品牌区（深色+粒子） */}
        <div className="flex-1 flex flex-col items-center justify-center pb-8 bg-gradient-to-br from-[#FFFBF5] to-[#FFF5EB] relative overflow-hidden">
          <div className="absolute inset-0 z-0">
            <Particles
              particleColors={['#FF8400']}
              particleBaseSize={800}
              particleCount={120}
              particleSpread={10}
              speed={0.06}
              alphaParticles={true}
              sizeRandomness={0.9}
              cameraDistance={20}
              moveParticlesOnHover={false}
            />
          </div>
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-[72px] h-[72px] rounded-full bg-[#FF8400]/15 flex items-center justify-center mb-4">
              <span className="text-[#FF8400] text-[32px] font-extrabold">L</span>
            </div>
            <h1 className="text-[#1A1A1A] text-[28px] font-bold tracking-tight">Linswift</h1>
            <p className="text-[#888] text-[14px] mt-2">AI 驱动的智能英语学习</p>
          </div>
        </div>

        {/* 移动端登录表单（glass 毛玻璃卡片） */}
        <div className="backdrop-blur-xl bg-white/70 border-t border-white/50 rounded-t-[28px] px-7 pt-8 pb-10 shadow-[0_-8px_32px_rgba(0,0,0,0.1)] -mt-7 relative z-10"
          style={{ WebkitBackdropFilter: 'blur(24px) saturate(1.8)', backdropFilter: 'blur(24px) saturate(1.8)' }}>
          <div className="w-full max-w-[400px] mx-auto">
            <h2 className="text-[#1A1A1A] text-[24px] font-bold mb-1">欢迎回来</h2>
            <p className="text-[#888] text-[13px] mb-6">登录你的 Linswift 账号继续学习之旅</p>

            {error && (
              <div className="mb-4 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-[13px] text-red-600">{error}</p>
              </div>
            )}

            <div className={`${glassInput} flex items-center gap-3 rounded-xl px-4 py-3.5 mb-3`}>
              <Mail size={18} className="text-[#999] shrink-0" />
              <input type="email" placeholder="邮箱" value={email}
                onChange={e => setEmail(e.target.value)}
                className="flex-1 bg-transparent text-[14px] text-[#1A1A1A] placeholder:text-[#bbb] outline-none" />
            </div>

            <div className={`${glassInput} flex items-center gap-3 rounded-xl px-4 py-3.5 mb-5`}>
              <Lock size={18} className="text-[#999] shrink-0" />
              <input type={showPassword ? 'text' : 'password'} placeholder="密码"
                value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                className="flex-1 bg-transparent text-[14px] text-[#1A1A1A] placeholder:text-[#bbb] outline-none" />
              <button onClick={() => setShowPassword(!showPassword)} className="shrink-0">
                {showPassword
                  ? <EyeOff size={18} className="text-[#999]" />
                  : <Eye size={18} className="text-[#999]" />}
              </button>
            </div>

            <button onClick={handleLogin} disabled={loading}
              className="w-full py-3.5 bg-[#FF8400] hover:bg-[#E87600] text-white text-[15px] font-semibold rounded-xl active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2">
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? '登录中...' : '登录'}
            </button>

            <div className="flex items-center gap-3 mt-6 mb-4">
              <div className="flex-1 h-px bg-black/10" />
              <span className="text-[12px] text-[#999]">其他方式登录</span>
              <div className="flex-1 h-px bg-black/10" />
            </div>

            <div className="flex justify-center gap-4">
              <button onClick={async () => { setError(''); const { error: e } = await signInWithGoogle(); if (e) setError(e) }}
                className={`${glassInput} flex-1 flex items-center justify-center gap-2 py-3 rounded-xl active:scale-[0.98] hover:bg-white/60 transition-all`}>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span className="text-[13px] font-semibold text-[#1A1A1A]">Google</span>
              </button>

              <button onClick={async () => { setError(''); const { error: e } = await signInWithApple(); if (e) setError(e) }}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-black/80 backdrop-blur-md border border-black/10 rounded-xl active:scale-[0.98] hover:bg-black/90 transition-all">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
                <span className="text-[13px] font-semibold text-white">Apple</span>
              </button>
            </div>

            <p className="text-center text-[13px] text-[#999] mt-5">
              还没有账号？
              <span onClick={() => navigate('/register')}
                className="text-[#FF8400] font-semibold ml-1 cursor-pointer hover:underline">注册</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
