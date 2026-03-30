/**
 * 注册页
 *
 * 桌面端：全屏粒子背景 + 毛玻璃品牌面板 + 毛玻璃注册表单
 * 移动端：深色粒子背景 + 毛玻璃浮动卡片
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Mail, Lock, Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import Particles from '../components/reactbits/Particles'
import BrandLogo from '../components/common/BrandLogo'
import { navigateSafely } from '../lib/navigation'
import { t, useAppLanguage } from '../lib/i18n'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { signUp } = useAuth()
  const lang = useAppLanguage()

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleRegister = async () => {
    setError('')
    if (!email.trim()) return setError(t(lang, 'auth_email_required'))
    if (!password.trim()) return setError(t(lang, 'auth_password_required'))
    if (password.length < 6) return setError(t(lang, 'auth_password_too_short'))
    if (password !== confirmPassword) return setError(t(lang, 'auth_password_mismatch'))

    setLoading(true)
    const { error: signUpError } = await signUp(email, password, username || undefined)
    setLoading(false)

    if (signUpError) {
      setError(signUpError)
    } else {
      setSuccess(true)
      setTimeout(() => navigate('/app/learn'), 1500)
    }
  }

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
            {t(lang, 'auth_back_home')}
          </button>

        <BrandLogo
          className="mb-8"
          imageClassName="h-12 w-12"
          textClassName="text-[28px] font-extrabold tracking-tight text-[#1A1A1A]"
        />

        <h2 className="text-[36px] xl:text-[42px] font-extrabold leading-[1.15] mb-4 text-[#1A1A1A]">
          {t(lang, 'auth_register_headline').split('\n').map((line, i, arr) => (
            <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
          ))}
        </h2>
        <p className="text-[16px] text-[#666] leading-relaxed max-w-[380px]">
          {t(lang, 'auth_register_subheadline')}
        </p>

        <div className="flex gap-10 mt-10">
          {[
            { num: '50K+', label: t(lang, 'auth_stat_users') },
            { num: '4.9', label: t(lang, 'auth_stat_rating') },
          ].map(s => (
            <div key={s.label}>
              <div className="text-[28px] font-extrabold text-[#FF8400]">{s.num}</div>
              <div className="text-[13px] text-[#999] mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

        {/* 右侧注册表单（glass） */}
        <div className="flex-1 flex items-center justify-center p-8">
        <div className={`${glassPanel} rounded-3xl w-full max-w-[440px] px-10 py-10`}>
          <button onClick={() => navigateSafely(navigate, '/login')}
            className="flex items-center gap-2 text-[#999] hover:text-[#1A1A1A] text-[14px] mb-6 transition-colors">
            <ArrowLeft size={16} />
            {t(lang, 'auth_back_login')}
          </button>

          <h2 className="text-[28px] font-bold mb-1 text-[#1A1A1A]">{t(lang, 'auth_create')}</h2>
          <p className="text-[14px] text-[#888] mb-5">{t(lang, 'auth_create_desc')}</p>

          {error && (
            <div className="mb-4 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-[13px] text-red-600">{error}</p>
            </div>
          )}
          {success && (
            <div className="mb-4 px-4 py-2.5 bg-green-500/10 border border-green-500/20 rounded-xl">
              <p className="text-[13px] text-green-600">{t(lang, 'auth_register_success')}</p>
            </div>
          )}

          <div className={`${glassInput} flex items-center gap-3 rounded-xl px-4 py-3.5 mb-3`}>
            <User size={18} className="text-[#999] shrink-0" />
            <input type="text" placeholder={t(lang, 'auth_username')} value={username}
              onChange={e => setUsername(e.target.value)}
              className="flex-1 bg-transparent text-[14px] text-[#1A1A1A] placeholder:text-[#bbb] outline-none" />
          </div>

          <div className={`${glassInput} flex items-center gap-3 rounded-xl px-4 py-3.5 mb-3`}>
            <Mail size={18} className="text-[#999] shrink-0" />
            <input type="email" placeholder={t(lang, 'auth_email')} value={email}
              onChange={e => setEmail(e.target.value)}
              className="flex-1 bg-transparent text-[14px] text-[#1A1A1A] placeholder:text-[#bbb] outline-none" />
          </div>

          <div className={`${glassInput} flex items-center gap-3 rounded-xl px-4 py-3.5 mb-3`}>
            <Lock size={18} className="text-[#999] shrink-0" />
            <input type={showPassword ? 'text' : 'password'} placeholder={t(lang, 'auth_password_hint')}
              value={password} onChange={e => setPassword(e.target.value)}
              className="flex-1 bg-transparent text-[14px] text-[#1A1A1A] placeholder:text-[#bbb] outline-none" />
            <button onClick={() => setShowPassword(!showPassword)} className="shrink-0">
              {showPassword
                ? <EyeOff size={18} className="text-[#999]" />
                : <Eye size={18} className="text-[#999]" />}
            </button>
          </div>

          <div className={`${glassInput} flex items-center gap-3 rounded-xl px-4 py-3.5 mb-5`}>
            <Lock size={18} className="text-[#999] shrink-0" />
            <input type={showPassword ? 'text' : 'password'} placeholder={t(lang, 'auth_confirm_password')}
              value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRegister()}
              className="flex-1 bg-transparent text-[14px] text-[#1A1A1A] placeholder:text-[#bbb] outline-none" />
          </div>

          <button onClick={handleRegister} disabled={loading}
            className="w-full py-3.5 bg-[#FF8400] hover:bg-[#E87600] text-white text-[15px] font-semibold rounded-xl active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2">
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? t(lang, 'auth_registering') : t(lang, 'auth_register')}
          </button>

          <p className="text-center text-[13px] text-[#999] mt-5">
            {t(lang, 'auth_has_account')}
            <span onClick={() => navigateSafely(navigate, '/login')}
              className="text-[#FF8400] font-semibold ml-1 cursor-pointer hover:underline">{t(lang, 'auth_login')}</span>
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
            <button onClick={() => navigateSafely(navigate, '/login')}
              className="absolute -top-16 left-5 w-10 h-10 rounded-full bg-black/5 flex items-center justify-center">
              <ArrowLeft size={20} className="text-[#1A1A1A]" />
            </button>
            <BrandLogo
              className="mb-3"
              imageClassName="h-[64px] w-[64px]"
              showText={false}
            />
            <h1 className="text-[#1A1A1A] text-[24px] font-bold tracking-tight">{t(lang, 'auth_register_mobile_title')}</h1>
            <p className="text-[#888] text-[13px] mt-1.5">{t(lang, 'auth_register_mobile_subtitle')}</p>
          </div>
        </div>

        {/* 移动端注册表单（glass 毛玻璃卡片） */}
        <div className="backdrop-blur-xl bg-white/70 border-t border-white/50 rounded-t-[28px] px-7 pt-7 pb-10 shadow-[0_-8px_32px_rgba(0,0,0,0.1)] -mt-7 relative z-10"
          style={{ WebkitBackdropFilter: 'blur(24px) saturate(1.8)', backdropFilter: 'blur(24px) saturate(1.8)' }}>
          <div className="w-full max-w-[400px] mx-auto">
            <h2 className="text-[#1A1A1A] text-[24px] font-bold mb-1">{t(lang, 'auth_create')}</h2>
            <p className="text-[#888] text-[13px] mb-5">{t(lang, 'auth_create_desc')}</p>

            {error && (
              <div className="mb-4 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-[13px] text-red-600">{error}</p>
              </div>
            )}
            {success && (
              <div className="mb-4 px-4 py-2.5 bg-green-500/10 border border-green-500/20 rounded-xl">
                <p className="text-[13px] text-green-600">{t(lang, 'auth_register_success')}</p>
              </div>
            )}

            <div className={`${glassInput} flex items-center gap-3 rounded-xl px-4 py-3.5 mb-3`}>
              <User size={18} className="text-[#999] shrink-0" />
              <input type="text" placeholder={t(lang, 'auth_username')} value={username}
                onChange={e => setUsername(e.target.value)}
                className="flex-1 bg-transparent text-[14px] text-[#1A1A1A] placeholder:text-[#bbb] outline-none" />
            </div>

            <div className={`${glassInput} flex items-center gap-3 rounded-xl px-4 py-3.5 mb-3`}>
              <Mail size={18} className="text-[#999] shrink-0" />
              <input type="email" placeholder={t(lang, 'auth_email')} value={email}
                onChange={e => setEmail(e.target.value)}
                className="flex-1 bg-transparent text-[14px] text-[#1A1A1A] placeholder:text-[#bbb] outline-none" />
            </div>

            <div className={`${glassInput} flex items-center gap-3 rounded-xl px-4 py-3.5 mb-3`}>
              <Lock size={18} className="text-[#999] shrink-0" />
              <input type={showPassword ? 'text' : 'password'} placeholder={t(lang, 'auth_password_hint')}
                value={password} onChange={e => setPassword(e.target.value)}
                className="flex-1 bg-transparent text-[14px] text-[#1A1A1A] placeholder:text-[#bbb] outline-none" />
              <button onClick={() => setShowPassword(!showPassword)} className="shrink-0">
                {showPassword
                  ? <EyeOff size={18} className="text-[#999]" />
                  : <Eye size={18} className="text-[#999]" />}
              </button>
            </div>

            <div className={`${glassInput} flex items-center gap-3 rounded-xl px-4 py-3.5 mb-5`}>
              <Lock size={18} className="text-[#999] shrink-0" />
              <input type={showPassword ? 'text' : 'password'} placeholder={t(lang, 'auth_confirm_password')}
                value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRegister()}
                className="flex-1 bg-transparent text-[14px] text-[#1A1A1A] placeholder:text-[#bbb] outline-none" />
            </div>

            <button onClick={handleRegister} disabled={loading}
              className="w-full py-3.5 bg-[#FF8400] hover:bg-[#E87600] text-white text-[15px] font-semibold rounded-xl active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2">
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? t(lang, 'auth_registering') : t(lang, 'auth_register')}
            </button>

            <p className="text-center text-[13px] text-[#999] mt-5">
              {t(lang, 'auth_has_account')}
              <span onClick={() => navigateSafely(navigate, '/login')}
                className="text-[#FF8400] font-semibold ml-1 cursor-pointer hover:underline">{t(lang, 'auth_login')}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
