/**
 * Linswift 产品官网 Landing Page
 *
 * 按 PRD 4.5 节设计：
 * 1. 顶部导航栏（Logo + 链接 + CTA）
 * 2. Hero 区（大标题 + 副标题 + CTA 按钮）
 * 3. 三大核心功能介绍
 * 4. 6-8 个附加功能网格（SpotlightCard）
 * 5. 定价方案
 * 6. 用户评价
 * 7. 最终 CTA 区
 * 8. 页脚
 */

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import {
  Sparkles, Languages, BookOpen, Headphones, Mic, Brain, BookOpenText,
  Gamepad2, BarChart3, FileText, Shield, Zap, Globe, Star, ChevronRight, Puzzle,
  Check, ArrowRight, Menu, X,
} from 'lucide-react'
import SpotlightCard from '../components/reactbits/SpotlightCard'
import AuroraCSS from '../components/reactbits/AuroraCSS'
import { useAuth } from '../contexts/AuthContext'
import BrandLogo from '../components/common/BrandLogo'
import { navigateSafely } from '../lib/navigation'

gsap.registerPlugin(ScrollTrigger)

const WEBSITE_BASE_URL = 'https://www.linswift.com'
const BROWSER_EXTENSION_GUIDE_URL = '/browser-extension'
const BROWSER_EXTENSION_DOWNLOAD_URL = `${WEBSITE_BASE_URL}/downloads/linswift-browser-extension-clean.zip`

function isExternalHref(href: string) {
  return /^(https?:|mailto:|tel:)/i.test(href)
}

function handleSiteLinkClick(
  event: ReactMouseEvent<HTMLElement>,
  href: string,
  navigate: ReturnType<typeof useNavigate>,
) {
  if (!href || isExternalHref(href)) return

  if (href.startsWith('#')) {
    event.preventDefault()
    const target = document.querySelector(href)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    return
  }

  if (href.startsWith('/')) {
    event.preventDefault()
    navigateSafely(navigate, href)
  }
}

export default function LandingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loading: authLoading } = useAuth()

  // 已登录用户直接进入应用
  useEffect(() => {
    if (!authLoading && user) {
      navigate('/app/learn', { replace: true })
    }
  }, [user, authLoading, navigate])

  useEffect(() => {
    if (!location.hash) return
    const id = window.setTimeout(() => {
      const target = document.querySelector(location.hash)
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 60)
    return () => window.clearTimeout(id)
  }, [location.hash])

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white text-[#1A1A1A] flex items-center justify-center">
        <div className="text-[14px] text-[#6B7280]">加载中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white text-[#1A1A1A] overflow-x-hidden">
      <Navbar
        onLogin={() => navigateSafely(navigate, '/login')}
        onRegister={() => navigateSafely(navigate, '/register')}
        onExtensionGuide={() => navigateSafely(navigate, '/browser-extension')}
      />
      <HeroSection
        onGetStarted={() => navigateSafely(navigate, '/register')}
        onExtensionGuide={() => navigateSafely(navigate, '/browser-extension')}
      />
      <AIWorkflowSection />
      <CoreFeatures />
      <FeatureGrid onExtensionGuide={() => navigateSafely(navigate, '/browser-extension')} />
      <PricingSection onGetStarted={() => navigateSafely(navigate, '/register')} />
      <TestimonialsSection />
      <FinalCTA onGetStarted={() => navigateSafely(navigate, '/register')} />
      <Footer />
    </div>
  )
}

/* ============================================================
 * 顶部导航栏
 * ============================================================ */
export function Navbar({
  onLogin,
  onRegister,
  onExtensionGuide,
  linkBase = '',
}: {
  onLogin: () => void
  onRegister: () => void
  onExtensionGuide?: () => void
  linkBase?: string
}) {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const cardItemsRef = useRef<(HTMLAnchorElement | HTMLButtonElement | null)[]>([])

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handler)
    return () => window.removeEventListener('scroll', handler)
  }, [])

  // GSAP 入场动画：菜单展开时卡片逐个弹入
  useEffect(() => {
    if (!mobileOpen || !mobileMenuRef.current) return
    const items = cardItemsRef.current.filter(Boolean)
    gsap.fromTo(mobileMenuRef.current,
      { height: 0, opacity: 0 },
      { height: 'auto', opacity: 1, duration: 0.35, ease: 'power3.out' }
    )
    gsap.fromTo(items,
      { y: 20, opacity: 0, scale: 0.95 },
      { y: 0, opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(1.4)', stagger: 0.06, delay: 0.1 }
    )
  }, [mobileOpen])

  const handleMobileClose = () => {
    if (!mobileMenuRef.current) { setMobileOpen(false); return }
    const items = cardItemsRef.current.filter(Boolean)
    gsap.to(items, { y: -10, opacity: 0, scale: 0.95, duration: 0.2, stagger: 0.03, ease: 'power2.in' })
    gsap.to(mobileMenuRef.current, {
      height: 0, opacity: 0, duration: 0.25, ease: 'power3.in', delay: 0.1,
      onComplete: () => setMobileOpen(false),
    })
  }

  const mobileNavCards = [
    { label: '功能', href: `${linkBase}#features`, icon: Zap, color: '#FF8400' },
    { label: '定价', href: `${linkBase}#pricing`, icon: BarChart3, color: '#8B5CF6' },
    { label: '评价', href: `${linkBase}#testimonials`, icon: Star, color: '#3B82F6' },
    { label: '插件教程', href: `${linkBase || ''}/browser-extension`, icon: Puzzle, color: '#22C55E' },
  ]

  const navLinks = [
    { label: '功能', href: `${linkBase}#features` },
    { label: '定价', href: `${linkBase}#pricing` },
    { label: '评价', href: `${linkBase}#testimonials` },
    { label: '插件教程', href: `${linkBase || ''}/browser-extension` },
  ]

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled ? 'bg-white/50 backdrop-blur-xl border-b border-white/40 shadow-[0_2px_16px_rgba(0,0,0,0.04)]' : 'bg-transparent'
    }`}
      style={scrolled ? { WebkitBackdropFilter: 'blur(24px) saturate(1.6)' } : undefined}>
      <div className="max-w-[1200px] mx-auto px-6 h-[72px] flex items-center justify-between">
        {/* Logo */}
        <BrandLogo
          imageClassName="h-9 w-9"
          textClassName="text-[22px] font-bold tracking-tight"
        />

        {/* 桌面导航 */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map(l => (
            l.label === '插件教程' && onExtensionGuide ? (
              <button
                key={l.href}
                type="button"
                onClick={onExtensionGuide}
                className="text-[15px] text-[#555] hover:text-[#1A1A1A] transition-colors font-medium"
              >
                {l.label}
              </button>
            ) : (
              <a key={l.href} href={l.href}
                onClick={(event) => handleSiteLinkClick(event, l.href, navigate)}
                className="text-[15px] text-[#555] hover:text-[#1A1A1A] transition-colors font-medium">
                {l.label}
              </a>
            )
          ))}
        </nav>

        {/* 桌面 CTA */}
        <div className="hidden md:flex items-center gap-3">
          <button onClick={onLogin}
            className="px-5 py-2.5 text-[14px] font-semibold text-[#1A1A1A] hover:text-[#FF8400] transition-colors">
            登录
          </button>
          <button onClick={onRegister}
            className="px-5 py-2.5 bg-[#FF8400] hover:bg-[#E87600] text-white text-[14px] font-semibold rounded-xl transition-colors">
            免费开始
          </button>
        </div>

        {/* 移动端汉堡菜单按钮 */}
        <button className="md:hidden p-2" onClick={() => mobileOpen ? handleMobileClose() : setMobileOpen(true)}>
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* 移动端 CardNav 风格竖向菜单 */}
      {mobileOpen && (
        <div ref={mobileMenuRef}
          className="md:hidden overflow-hidden backdrop-blur-xl bg-white/60 border-t border-white/40"
          style={{ height: 0, opacity: 0, WebkitBackdropFilter: 'blur(24px) saturate(1.6)', backdropFilter: 'blur(24px) saturate(1.6)' }}>
          <div className="px-5 py-4 flex flex-col gap-2">
            {mobileNavCards.map((card, i) => {
              const Icon = card.icon
              const isExtensionCard = card.label === '插件教程'
              return (
                isExtensionCard && onExtensionGuide ? (
                  <button key={card.href}
                    ref={el => { cardItemsRef.current[i] = el }}
                    onClick={() => { handleMobileClose(); setTimeout(onExtensionGuide, 300) }}
                    className="flex items-center gap-3.5 px-4 py-3.5 rounded-2xl transition-all active:scale-[0.97] text-left"
                    style={{ backgroundColor: card.color + '12', border: `1px solid ${card.color}25` }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: card.color }}>
                      <Icon size={18} className="text-white" />
                    </div>
                    <span className="text-[15px] font-semibold text-[#1A1A1A]">{card.label}</span>
                    <ChevronRight size={16} className="text-[#bbb] ml-auto" />
                  </button>
                ) : (
                  <a key={card.href} href={card.href}
                    ref={el => { cardItemsRef.current[i] = el }}
                    onClick={(event) => { handleSiteLinkClick(event, card.href, navigate); handleMobileClose() }}
                    className="flex items-center gap-3.5 px-4 py-3.5 rounded-2xl transition-all active:scale-[0.97]"
                    style={{ backgroundColor: card.color + '12', border: `1px solid ${card.color}25` }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: card.color }}>
                      <Icon size={18} className="text-white" />
                    </div>
                    <span className="text-[15px] font-semibold text-[#1A1A1A]">{card.label}</span>
                    <ChevronRight size={16} className="text-[#bbb] ml-auto" />
                  </a>
                )
              )
            })}

            {/* 分隔线 */}
            <div className="h-px bg-black/5 my-1" />

            {/* 登录 & 注册 */}
            <button onClick={() => { handleMobileClose(); setTimeout(onLogin, 300) }}
              ref={el => { cardItemsRef.current[mobileNavCards.length] = el }}
              className="flex items-center gap-3.5 px-4 py-3.5 rounded-2xl backdrop-blur-md bg-white/50 border border-white/30 active:scale-[0.97] transition-all">
              <div className="w-10 h-10 rounded-xl bg-[#1A1A1A] flex items-center justify-center shrink-0">
                <ArrowRight size={18} className="text-white" />
              </div>
              <span className="text-[15px] font-semibold text-[#1A1A1A]">登录</span>
            </button>

            <button onClick={() => { handleMobileClose(); setTimeout(onRegister, 300) }}
              ref={el => { cardItemsRef.current[mobileNavCards.length + 1] = el }}
              className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl bg-[#FF8400] active:scale-[0.97] transition-all shadow-lg shadow-[#FF8400]/20">
              <Sparkles size={16} className="text-white" />
              <span className="text-[15px] font-semibold text-white">免费开始</span>
            </button>
          </div>
        </div>
      )}
    </header>
  )
}

/* ============================================================
 * Hero 区
 * ============================================================ */
function HeroSection({
  onGetStarted,
  onExtensionGuide,
}: {
  onGetStarted: () => void
  onExtensionGuide: () => void
}) {
  const heroRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.hero-title', { y: 40, opacity: 0, duration: 0.8, ease: 'power3.out' })
      gsap.from('.hero-sub', { y: 30, opacity: 0, duration: 0.8, delay: 0.15, ease: 'power3.out' })
      gsap.from('.hero-cta', { y: 20, opacity: 0, duration: 0.6, delay: 0.3, ease: 'power3.out' })
      gsap.from('.hero-stats', { y: 20, opacity: 0, duration: 0.6, delay: 0.45, ease: 'power3.out' })
    }, heroRef)
    return () => ctx.revert()
  }, [])

  return (
    <section ref={heroRef} className="relative pt-[120px] pb-20 md:pt-[160px] md:pb-28 overflow-hidden">
      {/* 渐变背景底色 */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#FFF5EB] via-white to-[#F0EBFF]" />
      <div className="absolute top-20 right-0 w-[500px] h-[500px] bg-[#FF8400]/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#8B5CF6]/5 rounded-full blur-3xl" />

      <div className="relative z-10 max-w-[1200px] mx-auto px-6 text-center">
        {/* 标签 */}
        <div className="hero-title inline-flex items-center gap-2 px-4 py-1.5 bg-[#FF8400]/10 rounded-full mb-6">
          <Sparkles size={14} className="text-[#FF8400]" />
          <span className="text-[13px] font-semibold text-[#FF8400]">AI 驱动的新一代英语学习平台</span>
        </div>

        <h1 className="hero-title text-[36px] md:text-[56px] lg:text-[64px] font-extrabold leading-[1.1] tracking-tight max-w-[800px] mx-auto">
          让英语学习
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF8400] to-[#FF6000]">
            {' '}快、准、有趣
          </span>
        </h1>

        <p className="hero-sub text-[16px] md:text-[18px] text-[#666] max-w-[600px] mx-auto mt-6 leading-relaxed">
          Linswift 将 AI 翻译、智能阅读、游戏化记忆、场景对话融为一体，
          帮你从零基础到流利表达，效率提升 3 倍。
        </p>

        {/* CTA 按钮 */}
        <div className="hero-cta flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
          <button onClick={onGetStarted}
            className="group px-8 py-4 bg-[#FF8400] hover:bg-[#E87600] text-white text-[16px] font-bold rounded-2xl shadow-lg shadow-[#FF8400]/25 transition-all hover:shadow-xl hover:shadow-[#FF8400]/30 flex items-center gap-2">
            免费开始学习
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </button>
          <div className="flex flex-col gap-4 sm:flex-row">
            <button
              type="button"
              onClick={() => document.querySelector('#features')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="px-8 py-4 border-2 border-[#E5E5E5] hover:border-[#FF8400] text-[16px] font-semibold rounded-2xl transition-colors">
              了解更多
            </button>
            <button
              type="button"
              onClick={onExtensionGuide}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-[#DDEEDB] bg-white px-8 py-4 text-[16px] font-semibold text-[#1A1A1A] transition-colors hover:border-[#22C55E]"
            >
              <Puzzle size={18} className="text-[#22C55E]" />
              浏览器插件
            </button>
          </div>
        </div>

        {/* 数据统计 */}
        <div className="hero-stats flex items-center justify-center gap-8 md:gap-16 mt-14">
          {[
            { num: '50,000+', label: '活跃用户' },
            { num: '10M+', label: '单词已学' },
            { num: '4.9', label: 'App 评分' },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="text-[24px] md:text-[32px] font-extrabold text-[#1A1A1A]">{s.num}</div>
              <div className="text-[13px] text-[#888] mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="hero-stats mt-10 flex justify-center">
          <button
            type="button"
            onClick={onExtensionGuide}
            className="inline-flex max-w-[720px] items-start gap-3 rounded-[24px] border border-[#EADFD0] bg-white/82 px-5 py-4 text-left shadow-[0_12px_40px_rgba(255,132,0,0.08)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-[#FF8400]"
          >
            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#ECFDF3]">
              <Puzzle size={20} className="text-[#22C55E]" />
            </div>
            <div>
              <div className="text-[15px] font-bold text-[#1A1A1A]">浏览器插件已开放官网下载</div>
              <div className="mt-1 text-[13px] leading-6 text-[#666]">
                Chrome / Edge 可直接下载 zip 安装包，支持划词词卡、整句翻译、网页翻译与生词本同步。
              </div>
            </div>
          </button>
        </div>
      </div>
    </section>
  )
}

function AIWorkflowSection() {
  const sectionRef = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    if (!sectionRef.current) return

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()

      mm.add('(prefers-reduced-motion: reduce)', () => {
        gsap.set('.ai-flow-title, .ai-flow-copy, .ai-flow-line, .ai-flow-step', { clearProps: 'all' })
      })

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.set('.ai-flow-line', { scaleX: 0, transformOrigin: 'left center' })

        const reveal = gsap.timeline({
          defaults: { ease: 'power3.out' },
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 72%',
            once: true,
          },
        })

        reveal
          .from('.ai-flow-title', { y: 36, autoAlpha: 0, duration: 0.75 })
          .from('.ai-flow-copy', { y: 24, autoAlpha: 0, duration: 0.6 }, '-=0.45')
          .to('.ai-flow-line', { scaleX: 1, duration: 0.8 }, '-=0.2')
          .from('.ai-flow-step', {
            y: 46,
            autoAlpha: 0,
            scale: 0.96,
            stagger: 0.12,
            duration: 0.7,
          }, '-=0.45')
          .from('.ai-flow-chip', {
            y: 12,
            autoAlpha: 0,
            stagger: 0.06,
            duration: 0.35,
          }, '-=0.35')

        const pulse = gsap.timeline({ repeat: -1, repeatDelay: 0.8, defaults: { ease: 'power2.inOut' } })
        pulse
          .to('.ai-flow-orb', { xPercent: 340, duration: 5.2 })
          .to('.ai-flow-step-badge', { y: -5, stagger: 0.08, duration: 0.35 }, 0)
          .to('.ai-flow-step-badge', { y: 0, stagger: 0.08, duration: 0.35 }, 0.35)

        return () => {
          pulse.kill()
          reveal.kill()
        }
      })

      return () => mm.revert()
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  const steps = [
    {
      badge: '01',
      title: 'AI 识别输入内容',
      desc: '读取网页、文章、字幕或 PDF，先判断语言、场景和你当前的学习状态。',
      chips: ['网页', '字幕', 'PDF'],
      color: '#FF8400',
    },
    {
      badge: '02',
      title: '拆词与语境讲解',
      desc: '不是只给直译，而是同步标出陌生词、语境释义、发音和关键结构。',
      chips: ['词义', '语法', '发音'],
      color: '#8B5CF6',
    },
    {
      badge: '03',
      title: '生成个性化练习',
      desc: '根据不会的词和难句，自动推送拼写、闪卡、听力和 AI 对话任务。',
      chips: ['闪卡', '拼写', '对话'],
      color: '#3B82F6',
    },
    {
      badge: '04',
      title: '回流到复习闭环',
      desc: '学习结果进入记忆曲线，第二天开始自动形成新的复习与阅读建议。',
      chips: ['热度', '复习', '推荐'],
      color: '#22C55E',
    },
  ]

  return (
    <section ref={sectionRef} className="py-18 md:py-24">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="max-w-[760px]">
          <span className="ai-flow-title text-[13px] font-semibold text-[#FF8400] uppercase tracking-wider">AI Workflow</span>
          <h2 className="ai-flow-title text-[28px] md:text-[40px] font-extrabold mt-3">
            AI 辅助学习，不是单点工具，而是一条持续闭环
          </h2>
          <p className="ai-flow-copy text-[16px] text-[#888] mt-4 leading-8">
            Linswift 把识别、讲解、练习和复习串成同一条链路。你每次阅读、翻译和开口，都会反过来影响下一次学习任务。
          </p>
        </div>

        <div className="relative mt-12">
          <div className="ai-flow-line absolute left-0 right-0 top-5 hidden h-[2px] bg-gradient-to-r from-[#FF8400] via-[#8B5CF6] to-[#22C55E] md:block" />
          <div className="pointer-events-none absolute left-0 top-2 hidden h-8 w-8 rounded-full bg-[#FF8400]/18 blur-md md:block ai-flow-orb" />

          <div className="grid gap-5 md:grid-cols-4">
            {steps.map((step) => (
              <article
                key={step.badge}
                className="ai-flow-step relative flex flex-col rounded-[28px] border border-[#F0F0F0] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.04)]"
              >
                <div
                  className="ai-flow-step-badge flex h-10 w-10 items-center justify-center rounded-2xl text-[13px] font-bold text-white"
                  style={{ backgroundColor: step.color }}
                >
                  {step.badge}
                </div>
                <h3 className="mt-5 text-[20px] font-bold leading-tight">{step.title}</h3>
                <p className="mt-3 flex-1 text-[14px] leading-7 text-[#666]">{step.desc}</p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {step.chips.map((chip) => (
                    <span
                      key={chip}
                      className="ai-flow-chip rounded-full px-3 py-1.5 text-[12px] font-semibold"
                      style={{ backgroundColor: `${step.color}12`, color: step.color }}
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ============================================================
 * 三大核心功能（图文交替）
 * ============================================================ */
function CoreFeatures() {
  const features = [
    {
      id: 'feature-translate',
      tag: 'AI 翻译',
      title: '智能翻译，不只是翻译',
      desc: '内置 Gemini AI 引擎，自动识别陌生词汇并标注音标、释义。翻译同时建立你的专属词库，一举两得。',
      icon: Languages,
      color: '#FF8400',
      highlights: ['中英双向翻译', '陌生词汇自动收录', 'AI 语境解析', '收藏 & 历史'],
    },
    {
      id: 'feature-reading',
      tag: '智能阅读',
      title: '沉浸式阅读 + PDF 阅读器',
      desc: '导入任何 PDF 或选择推荐书籍，生词标注、一键查词、自动保存阅读进度。读到哪，学到哪。',
      icon: BookOpen,
      color: '#8B5CF6',
      highlights: ['PDF 原文渲染', '选词即查', '阅读进度同步', '自动保存进度'],
    },
    {
      id: 'feature-memory',
      tag: '游戏化记忆',
      title: '背单词不再枯燥',
      desc: '艾宾浩斯记忆算法 + 拼写游戏 + 单词匹配，科学复习间隔让你记得更牢、忘得更少。',
      icon: Gamepad2,
      color: '#22C55E',
      highlights: ['艾宾浩斯复习', '拼写闯关', '单词匹配游戏', '掌握度追踪'],
    },
  ]

  return (
    <section id="features" className="py-20 md:py-28 scroll-mt-20">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="text-center mb-16">
          <span className="text-[13px] font-semibold text-[#FF8400] uppercase tracking-wider">Core Features</span>
          <h2 className="text-[28px] md:text-[40px] font-extrabold mt-3">三大核心引擎</h2>
          <p className="text-[16px] text-[#888] mt-3 max-w-[500px] mx-auto">
            从翻译到阅读到记忆，覆盖英语学习的完整链路
          </p>
        </div>

        <div className="flex flex-col gap-20 md:gap-28">
          {features.map((f, i) => {
            const Icon = f.icon
            const isReverse = i % 2 === 1
            return (
              <div key={f.tag} id={f.id}
                className={`flex flex-col ${isReverse ? 'md:flex-row-reverse' : 'md:flex-row'} items-center gap-10 md:gap-16 scroll-mt-24`}>
                {/* 图示区 */}
                <div className="flex-1 w-full">
                  <div className="relative rounded-3xl p-8 md:p-12"
                    style={{ backgroundColor: `${f.color}08` }}>
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                      style={{ backgroundColor: `${f.color}15` }}>
                      <Icon size={32} style={{ color: f.color }} />
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-6">
                      {f.highlights.map(h => (
                        <div key={h} className="flex items-center gap-2 bg-white rounded-xl px-4 py-3 shadow-sm">
                          <Check size={14} style={{ color: f.color }} />
                          <span className="text-[13px] font-medium">{h}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 文字区 */}
                <div className="flex-1">
                  <span className="inline-block px-3 py-1 rounded-full text-[12px] font-semibold"
                    style={{ backgroundColor: `${f.color}15`, color: f.color }}>
                    {f.tag}
                  </span>
                  <h3 className="text-[24px] md:text-[32px] font-extrabold mt-4 leading-tight">{f.title}</h3>
                  <p className="text-[15px] md:text-[16px] text-[#666] mt-4 leading-relaxed">{f.desc}</p>
                  <button
                    type="button"
                    onClick={() => document.querySelector('#more-features')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="inline-flex items-center gap-1 mt-6 text-[14px] font-semibold hover:gap-2 transition-all"
                    style={{ color: f.color }}>
                    查看更多功能 <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ============================================================
 * 附加功能网格（SpotlightCard）
 * ============================================================ */
function FeatureGrid({ onExtensionGuide }: { onExtensionGuide: () => void }) {
  const items = [
    { icon: Headphones, label: '听力训练', desc: '随行听 + 听歌填字 + 听力图书馆', color: '#8B5CF6' },
    { icon: Mic, label: 'AI 口语', desc: 'AI 场景对话 + 复述练习', color: '#3B82F6' },
    { icon: BookOpenText, label: '语法知识树', desc: '系统化语法树，逐级解锁', color: '#22C55E' },
    { icon: Brain, label: '艾宾浩斯复习', desc: '科学间隔重复，对抗遗忘曲线', color: '#FF8400' },
    { icon: BarChart3, label: '学习数据', desc: '热度图 + 连续天数 + 成就追踪', color: '#EF4444' },
    { icon: FileText, label: 'PDF 阅读器', desc: '导入 PDF，保留原版排版阅读', color: '#F59E0B' },
    { icon: Puzzle, label: '浏览器插件', desc: '官网直下 zip，划词词卡 + 整句翻译 + 生词本同步', color: '#22C55E', action: onExtensionGuide },
    { icon: Globe, label: '多语言翻译', desc: '支持中英日韩等多语种切换', color: '#06B6D4' },
    { icon: Shield, label: '数据安全', desc: 'Supabase 加密存储，隐私优先', color: '#8B5CF6' },
  ]

  return (
    <section id="more-features" className="py-20 bg-[#FAFAFA] scroll-mt-20">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="text-center mb-14">
          <span className="text-[13px] font-semibold text-[#FF8400] uppercase tracking-wider">More Features</span>
          <h2 className="text-[28px] md:text-[40px] font-extrabold mt-3">全方位学习工具</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map(f => {
            const Icon = f.icon
            return (
              <SpotlightCard key={f.label}
                className="bg-white border border-[#F0F0F0] !p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
                spotlightColor={`${f.color}20`}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${f.color}12` }}>
                  <Icon size={22} style={{ color: f.color }} />
                </div>
                <h4 className="text-[15px] font-bold mb-1">{f.label}</h4>
                <p className="text-[13px] text-[#888] leading-relaxed">{f.desc}</p>
                {f.action && (
                  <button
                    type="button"
                    onClick={f.action}
                    className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold transition-all hover:gap-2"
                    style={{ color: f.color }}
                  >
                    查看教程 <ChevronRight size={14} />
                  </button>
                )}
              </SpotlightCard>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ============================================================
 * 定价方案
 * ============================================================ */
function PricingSection({ onGetStarted }: { onGetStarted: () => void }) {
  const plans = [
    {
      name: 'Free',
      nameZh: '免费版',
      price: '¥0',
      period: '当前开放',
      desc: '先体验核心能力，建立个人词库与阅读习惯',
      features: [
        '网页翻译与经典阅读基础功能',
        '基础词库管理与今日复习',
        '公共经典书库与学习仪表盘',
        '浏览器插件基础翻译能力',
        '适合作为默认入门层级',
      ],
      cta: '立即注册',
      popular: false,
      color: '#666',
    },
    {
      name: 'Pro',
      nameZh: 'Pro 内测版',
      price: '申请开通',
      period: 'Stripe 上线前',
      desc: '先用账户身份区分免费与付费用户，由团队人工审核开通',
      features: [
        '更高 AI / DeepL 翻译额度',
        'PDF / OCR / 导入阅读等高消耗能力',
        '完整语法、听力、口语与 AI 练习路径',
        '插件、多端与词库的完整云同步体验',
        '后续 Stripe 上线时平滑迁移权益',
      ],
      cta: '申请 Pro 内测',
      popular: true,
      color: '#FF8400',
    },
    {
      name: 'Team',
      nameZh: '团队试点',
      price: '联系确认',
      period: '按方案开通',
      desc: '适合学校、训练营和企业培训，先按试点方式落地',
      features: [
        '以 Pro 权益为基础扩展',
        '优先支持多账号批量开通',
        '按场景定制词库、阅读内容与交付方式',
        '先人工对接，再决定是否进入正式团队版',
        '适合作为 Stripe 前的 B2B 试点层级',
      ],
      cta: '联系我们',
      popular: false,
      color: '#8B5CF6',
    },
  ]

  const preStripeSteps = [
    {
      title: '所有新用户默认进入免费版',
      desc: '注册后先使用免费能力，不需要先绑定信用卡，也不会出现隐式自动扣费。',
    },
    {
      title: '付费用户通过申请 + 人工审核开通',
      desc: '在 Stripe 正式接入前，Pro 不做站内自动收款。用户通过邮箱提交申请，团队按账号开通权益。',
    },
    {
      title: '权益记录绑定到账户身份',
      desc: '我们会按账号记录层级、开通时间和到期时间，网页端、桌面端和插件端共享同一身份。',
    },
    {
      title: 'Stripe 上线后平滑迁移',
      desc: '已开通的用户会保留剩余权益与早期支持者身份，再迁移到正式订阅体系。',
    },
  ]

  const accessRules = [
    {
      label: '免费版',
      audience: '想先体验产品主流程的个人用户',
      activation: '注册即得',
      billing: '不收费',
      access: '保留翻译、基础词库、经典阅读与基础学习路径',
    },
    {
      label: 'Pro 内测',
      audience: '高频学习者、重度阅读用户、需要完整 AI 能力的个人用户',
      activation: '邮件申请后人工开通',
      billing: 'Stripe 前人工确认，不走站内自动扣费',
      access: '开放高额度翻译、导入阅读、OCR、完整语法/听说/复习路径',
    },
    {
      label: '团队试点',
      audience: '学校、企业、训练营或有统一交付需求的组织',
      activation: '联系团队评估后定制开通',
      billing: '按试点合作方式确认',
      access: '以 Pro 为基础，优先处理批量账号与内容交付需求',
    },
  ]

  const migrationPromises = [
    '在 Stripe 上线前，不展示伪“已接入支付”的月付按钮，避免误导用户。',
    '任何付费开通都先邮件确认，不会出现默认续费或看不懂的扣费路径。',
    '正式接入 Stripe 后，优先把现有 Pro 用户迁移到标准订阅，并保留剩余权益时长。',
    '首批付费用户会作为早期支持者处理，后续价格与权益变更会提前在官网公示。',
  ]

  return (
    <section id="pricing" className="py-20 md:py-28 scroll-mt-20">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="text-center mb-14">
          <span className="text-[13px] font-semibold text-[#FF8400] uppercase tracking-wider">Pricing</span>
          <h2 className="text-[28px] md:text-[40px] font-extrabold mt-3">先把用户分层跑通，再接 Stripe</h2>
          <p className="text-[16px] text-[#888] mt-3">当前官网先明确免费版、Pro 内测版和团队试点的边界，Stripe 接入后再切到自动订阅。</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-[960px] mx-auto">
          {plans.map(p => (
            <div key={p.name}
              className={`relative rounded-3xl p-8 flex flex-col ${
                p.popular
                  ? 'bg-gradient-to-b from-[#FFF5EB] to-white border-2 border-[#FF8400] shadow-xl shadow-[#FF8400]/10'
                  : 'bg-white border border-[#F0F0F0]'
              }`}>
              {p.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 bg-[#FF8400] text-white text-[12px] font-bold rounded-full">
                  最受欢迎
                </div>
              )}

              <div className="mb-6">
                <span className="text-[13px] font-semibold" style={{ color: p.color }}>{p.name}</span>
                <h3 className="text-[18px] font-bold mt-1">{p.nameZh}</h3>
              </div>

              <div className="flex items-baseline gap-2 mb-2 flex-nowrap">
                <span className="text-[28px] md:text-[36px] font-extrabold whitespace-nowrap">{p.price}</span>
                <span className="text-[14px] text-[#888] whitespace-nowrap">{p.period}</span>
              </div>
              <p className="text-[14px] text-[#888] mb-6">{p.desc}</p>

              <ul className="flex flex-col gap-3 mb-8 flex-1">
                {p.features.map(f => (
                  <li key={f} className="flex items-start gap-2">
                    <Check size={16} className="shrink-0 mt-0.5" style={{ color: p.color }} />
                    <span className="text-[14px]">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={
                  p.name === 'Free'
                    ? onGetStarted
                    : p.name === 'Team'
                      ? () => { window.location.href = 'mailto:aw@linswift.com?subject=团队试点咨询&body=机构名称：%0A预计账号数：%0A使用场景：' }
                      : () => { window.location.href = 'mailto:aw@linswift.com?subject=Pro内测申请&body=Linswift账号邮箱：%0A使用场景：%0A最常使用的平台（网页/桌面/插件）：' }
                }
                className={`w-full py-3.5 rounded-xl text-[15px] font-bold transition-all ${
                  p.popular
                    ? 'bg-[#FF8400] hover:bg-[#E87600] text-white shadow-lg shadow-[#FF8400]/20'
                    : 'bg-[#F5F5F5] hover:bg-[#EBEBEB] text-[#1A1A1A]'
                }`}>
                {p.cta}
              </button>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-12 max-w-[960px] rounded-[28px] border border-[#F0E3D3] bg-[#FFF9F3] px-6 py-5 text-[14px] leading-7 text-[#6B6258] md:px-8">
          当前阶段的重点不是把收费按钮先做出来，而是先把账号身份、功能边界、开通流程和后续迁移承诺讲清楚。也就是说：
          Stripe 上线前，Pro 是“人工开通的付费层级”，不是“官网里已经自动订阅的月付产品”。
        </div>

        <div id="pre-stripe-plan" className="mt-20">
          <div className="max-w-[860px]">
            <span className="text-[13px] font-semibold text-[#FF8400] uppercase tracking-wider">Pre-Stripe Plan</span>
            <h3 className="mt-3 text-[28px] md:text-[40px] font-extrabold">Stripe 接入前，免费用户和付费用户怎么区分</h3>
            <p className="mt-4 text-[16px] leading-8 text-[#666]">
              在自动支付接入前，我们先按“账户身份 + 权益开通记录”的方式跑通产品分层。这样既能开始服务首批付费用户，也不会把一个尚未接入正式支付系统的状态伪装成已经上线的自动订阅。
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {preStripeSteps.map((step, index) => (
              <div key={step.title} className="rounded-3xl border border-[#F0F0F0] bg-white p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FFF1E6] text-[14px] font-bold text-[#FF8400]" aria-label={`步骤 ${index + 1}`}>
                  0{index + 1}
                </div>
                <h4 className="mt-5 text-[18px] font-bold">{step.title}</h4>
                <p className="mt-3 text-[14px] leading-7 text-[#666]">{step.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {accessRules.map((rule) => (
              <div key={rule.label} className="rounded-[28px] border border-[#F0F0F0] bg-white p-6">
                <div className="text-[18px] font-bold text-[#1A1A1A] mb-4">{rule.label}</div>
                <dl className="flex flex-col gap-3 text-[14px]">
                  <div>
                    <dt className="text-[12px] font-semibold text-[#888] mb-1">适合人群</dt>
                    <dd className="text-[#555] leading-6">{rule.audience}</dd>
                  </div>
                  <div>
                    <dt className="text-[12px] font-semibold text-[#888] mb-1">开通方式</dt>
                    <dd className="text-[#555] leading-6">{rule.activation}</dd>
                  </div>
                  <div>
                    <dt className="text-[12px] font-semibold text-[#888] mb-1">当前计费方式</dt>
                    <dd className="text-[#555] leading-6">{rule.billing}</dd>
                  </div>
                  <div>
                    <dt className="text-[12px] font-semibold text-[#888] mb-1">权限边界</dt>
                    <dd className="text-[#555] leading-6">{rule.access}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-[28px] bg-[#1A1A1A] p-7 md:p-10 text-white">
            <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-white/60">Migration Promise</p>
            <h4 className="mt-3 text-[24px] font-extrabold leading-tight">正式接入 Stripe 后，我们会怎么迁移</h4>
            <ul className="mt-6 grid gap-4 md:grid-cols-2">
              {migrationPromises.map((item) => (
                <li key={item} className="flex gap-3 text-[14px] leading-7 text-white/82">
                  <Check size={16} className="mt-1 shrink-0 text-[#FFB066]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <a
              href="mailto:aw@linswift.com?subject=Pro内测申请&body=Linswift账号邮箱：%0A使用场景：%0A最关注的能力："
              className="mt-7 inline-flex rounded-2xl bg-white px-5 py-3 text-[14px] font-bold text-[#1A1A1A] transition-colors hover:bg-[#F6F6F6]"
            >
              申请 Pro 内测
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ============================================================
 * 用户评价
 * ============================================================ */
function TestimonialsSection() {
  const reviews = [
    {
      name: 'Sarah Chen',
      role: '大学英语教师',
      avatar: 'S',
      color: '#FF8400',
      text: '把 Linswift 推荐给了学生，艾宾浩斯复习功能让学生的单词记忆效率提升了至少 2 倍。',
      stars: 5,
    },
    {
      name: 'Mike Wang',
      role: '留学生',
      avatar: 'M',
      color: '#8B5CF6',
      text: '用 PDF 阅读器导入论文，选中生词自动查释义，写 paper 效率大幅提高！',
      stars: 5,
    },
    {
      name: 'Lisa Zhang',
      role: '产品经理',
      avatar: 'L',
      color: '#3B82F6',
      text: '通勤路上用随行听练听力，午休时玩单词匹配游戏，碎片时间都被利用起来了。',
      stars: 5,
    },
    {
      name: 'David Li',
      role: '高中生',
      avatar: 'D',
      color: '#22C55E',
      text: 'AI 场景对话太棒了，模拟真实口语场景让我不怕开口说英语了。',
      stars: 5,
    },
  ]

  return (
    <section id="testimonials" className="py-20 bg-[#FAFAFA] scroll-mt-20">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="text-center mb-14">
          <span className="text-[13px] font-semibold text-[#FF8400] uppercase tracking-wider">Testimonials</span>
          <h2 className="text-[28px] md:text-[40px] font-extrabold mt-3">用户怎么说</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {reviews.map(r => (
            <SpotlightCard key={r.name}
              className="bg-white border border-[#F0F0F0] !p-6"
              spotlightColor={`${r.color}18`}>
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: r.stars }).map((_, i) => (
                  <Star key={i} size={14} className="fill-[#F59E0B] text-[#F59E0B]" />
                ))}
              </div>
              <p className="text-[14px] text-[#555] leading-relaxed mb-5 min-h-[80px]">"{r.text}"</p>
              <div className="flex items-center gap-3 pt-4 border-t border-[#F0F0F0]">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[14px] font-bold"
                  style={{ backgroundColor: r.color }}>
                  {r.avatar}
                </div>
                <div>
                  <div className="text-[13px] font-semibold">{r.name}</div>
                  <div className="text-[12px] text-[#888]">{r.role}</div>
                </div>
              </div>
            </SpotlightCard>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ============================================================
 * 最终 CTA
 * ============================================================ */
function FinalCTA({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <section className="py-20 md:py-28">
      <div className="max-w-[800px] mx-auto px-6 text-center">
        <div className="relative rounded-3xl bg-gradient-to-br from-[#1A1A1A] to-[#2A2A2A] p-10 md:p-16 text-white overflow-hidden">
          {/* z-[1]: 极光动态背景（纯 CSS，兼容 Safari） */}
          <div className="absolute inset-0 z-[1] opacity-60">
            <AuroraCSS colors={['#FF8400', '#FF6000', '#8B5CF6']} />
          </div>

          <div className="relative z-[2]">
            <Zap size={40} className="mx-auto mb-4 opacity-90" />
            <h2 className="text-[28px] md:text-[40px] font-extrabold leading-tight">
              准备好开始了吗？
            </h2>
            <p className="text-[16px] text-white/80 mt-4 max-w-[400px] mx-auto">
              免费注册，立刻解锁 AI 翻译、阅读器和游戏化背单词功能
            </p>
            <button onClick={onGetStarted}
              className="mt-8 px-10 py-4 bg-white text-[#FF8400] text-[16px] font-bold rounded-2xl hover:shadow-xl transition-all hover:scale-[1.02]">
              免费开始学习
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ============================================================
 * 页脚
 * ============================================================ */
export function Footer({ linkBase = '' }: { linkBase?: string }) {
  const navigate = useNavigate()
  const productLinks = [
    { label: 'AI 翻译', href: `${linkBase}#feature-translate` },
    { label: '智能阅读', href: `${linkBase}#feature-reading` },
    { label: '游戏化记忆', href: `${linkBase}#feature-memory` },
    { label: '听力训练', href: `${linkBase}#more-features` },
    { label: '口语练习', href: `${linkBase}#more-features` },
  ]

  const resourceLinks = [
    { label: '帮助中心', href: 'mailto:aw@linswift.com' },
    { label: '插件安装教程', href: BROWSER_EXTENSION_GUIDE_URL },
    { label: '下载浏览器插件', href: BROWSER_EXTENSION_DOWNLOAD_URL },
    { label: '使用教程', href: `${linkBase}#features` },
  ]

  const legalLinks = [
    { label: '服务条款', href: '/legal/user-agreement' },
    { label: '隐私政策', href: '/legal/privacy-policy' },
    { label: '联系我们', href: 'mailto:aw@linswift.com' },
  ]

  return (
    <footer className="bg-[#1A1A1A] text-white py-14" id="footer">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {/* 品牌 */}
          <div className="col-span-2 md:col-span-1">
            <BrandLogo
              className="mb-4"
              imageClassName="h-8 w-8"
              textClassName="text-[18px] font-bold text-white"
            />
            <p className="text-[13px] text-white/50 leading-relaxed">
              AI 驱动的智能英语学习平台<br />
              让每个人都能高效学英语
            </p>
            <p className="text-[12px] text-white/30 mt-3">aw@linswift.com</p>
          </div>

          {/* 产品 */}
          <div>
            <h5 className="text-[14px] font-semibold mb-4">产品</h5>
            <ul className="flex flex-col gap-2.5">
              {productLinks.map(l => (
                <li key={l.label}><a href={l.href} aria-label={`${l.label} - 页脚链接`} onClick={(event) => handleSiteLinkClick(event, l.href, navigate)} className="text-[13px] text-white/50 hover:text-white/80 transition-colors">{l.label}</a></li>
              ))}
            </ul>
          </div>

          {/* 资源 */}
          <div>
            <h5 className="text-[14px] font-semibold mb-4">资源</h5>
            <ul className="flex flex-col gap-2.5">
              {resourceLinks.map(l => (
                <li key={l.label}><a href={l.href} aria-label={`${l.label} - 页脚链接`} onClick={(event) => handleSiteLinkClick(event, l.href, navigate)} className="text-[13px] text-white/50 hover:text-white/80 transition-colors">{l.label}</a></li>
              ))}
            </ul>
          </div>

          {/* 法律 */}
          <div>
            <h5 className="text-[14px] font-semibold mb-4">法律</h5>
            <ul className="flex flex-col gap-2.5">
              {legalLinks.map(l => (
                <li key={l.label}><a href={l.href} aria-label={`${l.label} - 页脚链接`} onClick={(event) => handleSiteLinkClick(event, l.href, navigate)} className="text-[13px] text-white/50 hover:text-white/80 transition-colors">{l.label}</a></li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-white/10 flex items-center justify-between gap-4">
          <span className="text-[12px] text-white/40">© 2026 Linswift. All rights reserved.</span>
          <span className="text-[12px] text-white/30">aw@linswift.com</span>
        </div>
      </div>
    </footer>
  )
}
