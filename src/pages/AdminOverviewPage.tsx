import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, BookOpen, Bot, ChevronLeft, Database, Languages, Library, MessageSquare, Sparkles, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLogicalBack } from '../hooks/useLogicalBack'
import { useMediaQuery } from '../hooks/useMediaQuery'

interface MetricCardData {
  label: string
  value: string
  helper: string
  icon: typeof Database
  tone: 'orange' | 'blue' | 'green' | 'violet'
}

interface DailySeriesItem {
  date: string
  label: string
  studyMinutes: number
  translations: number
}

interface BalanceInfo {
  available_balance: number
  voucher_balance: number
  cash_balance: number
}

interface DashboardSnapshot {
  visibleProfiles: number
  visibleVocabulary: number
  visibleTranslations: number
  visibleBooks: number
  visibleStudyRecords: number
  visibleSets: number
  visibleMnemonics: number
  visibleDialogues: number
  recentTranslations: Array<{
    created_at: string
    source_text: string
    translated_text: string
    source_lang: string
    target_lang: string
  }>
  recentStudyRecords: Array<{
    study_date: string
    study_duration: number
  }>
  balance: BalanceInfo | null
  scopeLabel: string
}

const toneClassMap: Record<MetricCardData['tone'], string> = {
  orange: 'bg-[#FFF4E8] text-[#F97316]',
  blue: 'bg-[#ECF4FF] text-[#2563EB]',
  green: 'bg-[#EBFBF2] text-[#16A34A]',
  violet: 'bg-[#F3EEFF] text-[#7C3AED]',
}

function formatNumber(value: number) {
  return value.toLocaleString('zh-CN')
}

function formatCurrency(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return '--'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value))
}

function estimateTokens(text: string) {
  const safe = String(text || '').trim()
  if (!safe) return 0
  return Math.max(1, Math.ceil(safe.length / 4))
}

function buildLastSevenDaysSeries(
  studyRecords: Array<{ study_date: string; study_duration: number }>,
  translations: Array<{ created_at: string }>
): DailySeriesItem[] {
  const studyMap = new Map<string, number>()
  const translationMap = new Map<string, number>()

  studyRecords.forEach((item) => {
    studyMap.set(item.study_date, (studyMap.get(item.study_date) || 0) + (item.study_duration || 0))
  })

  translations.forEach((item) => {
    const day = String(item.created_at || '').slice(0, 10)
    if (!day) return
    translationMap.set(day, (translationMap.get(day) || 0) + 1)
  })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (6 - index))
    const dayKey = date.toISOString().slice(0, 10)

    return {
      date: dayKey,
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      studyMinutes: studyMap.get(dayKey) || 0,
      translations: translationMap.get(dayKey) || 0,
    }
  })
}

async function fetchMoonshotBalance(): Promise<BalanceInfo | null> {
  const apiKey = String(import.meta.env.VITE_MOONSHOT_API_KEY || '').trim()
  if (!apiKey) return null

  try {
    const response = await fetch('https://api.moonshot.ai/v1/users/me/balance', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) return null

    const payload = await response.json().catch(() => null)
    if (!payload?.status || !payload?.data) return null

    return {
      available_balance: Number(payload.data.available_balance || 0),
      voucher_balance: Number(payload.data.voucher_balance || 0),
      cash_balance: Number(payload.data.cash_balance || 0),
    }
  } catch {
    return null
  }
}

export default function AdminOverviewPage() {
  const goBack = useLogicalBack('/app/profile')
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [
        profilesRes,
        vocabularyRes,
        translationsRes,
        booksRes,
        studyRes,
        setsRes,
        mnemonicsRes,
        dialoguesRes,
        recentTranslationsRes,
        recentStudyRes,
        balance,
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('user_vocabulary').select('*', { count: 'exact', head: true }),
        supabase.from('user_translations').select('*', { count: 'exact', head: true }),
        supabase.from('user_books').select('*', { count: 'exact', head: true }),
        supabase.from('study_records').select('*', { count: 'exact', head: true }),
        supabase.from('user_vocab_sets').select('*', { count: 'exact', head: true }),
        supabase.from('saved_mnemonics').select('*', { count: 'exact', head: true }),
        supabase.from('speaking_dialogues').select('*', { count: 'exact', head: true }),
        supabase
          .from('user_translations')
          .select('created_at,source_text,translated_text,source_lang,target_lang')
          .order('created_at', { ascending: false })
          .limit(120),
        supabase
          .from('study_records')
          .select('study_date,study_duration')
          .order('study_date', { ascending: false })
          .limit(60),
        fetchMoonshotBalance(),
      ])

      const visibleProfiles = profilesRes.count || 0
      const scopeLabel = visibleProfiles > 1
        ? '当前账号拥有多用户可见权限，以下数字更接近全站后台视角。'
        : '以下数字基于当前登录账号在 Supabase 中可见的数据范围。'

      setSnapshot({
        visibleProfiles,
        visibleVocabulary: vocabularyRes.count || 0,
        visibleTranslations: translationsRes.count || 0,
        visibleBooks: booksRes.count || 0,
        visibleStudyRecords: studyRes.count || 0,
        visibleSets: setsRes.count || 0,
        visibleMnemonics: mnemonicsRes.count || 0,
        visibleDialogues: dialoguesRes.count || 0,
        recentTranslations: recentTranslationsRes.data || [],
        recentStudyRecords: recentStudyRes.data || [],
        balance,
        scopeLabel,
      })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '后台数据读取失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDashboard().catch(() => {})
  }, [loadDashboard])

  const dailySeries = useMemo(() => (
    buildLastSevenDaysSeries(
      snapshot?.recentStudyRecords || [],
      snapshot?.recentTranslations || []
    )
  ), [snapshot])

  const metricCards = useMemo<MetricCardData[]>(() => {
    if (!snapshot) return []

    return [
      {
        label: '可见用户',
        value: formatNumber(snapshot.visibleProfiles),
        helper: '当前权限下可读取的 profiles 数量',
        icon: Database,
        tone: 'orange',
      },
      {
        label: '词库条目',
        value: formatNumber(snapshot.visibleVocabulary),
        helper: 'user_vocabulary 总量',
        icon: Library,
        tone: 'blue',
      },
      {
        label: '翻译记录',
        value: formatNumber(snapshot.visibleTranslations),
        helper: 'user_translations 总量',
        icon: Languages,
        tone: 'green',
      },
      {
        label: '书架内容',
        value: formatNumber(snapshot.visibleBooks),
        helper: 'user_books 总量',
        icon: BookOpen,
        tone: 'violet',
      },
      {
        label: '学习记录',
        value: formatNumber(snapshot.visibleStudyRecords),
        helper: 'study_records 累积条数',
        icon: BarChart3,
        tone: 'orange',
      },
      {
        label: '词本数量',
        value: formatNumber(snapshot.visibleSets),
        helper: 'user_vocab_sets 总量',
        icon: Database,
        tone: 'blue',
      },
    ]
  }, [snapshot])

  const translationLanguageBreakdown = useMemo(() => {
    const languageMap = new Map<string, number>()

    snapshot?.recentTranslations.forEach((item) => {
      const key = `${item.source_lang || '未知'} -> ${item.target_lang || '未知'}`
      languageMap.set(key, (languageMap.get(key) || 0) + 1)
    })

    return Array.from(languageMap.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
  }, [snapshot])

  const usageSummary = useMemo(() => {
    const translations = snapshot?.recentTranslations || []
    const estimatedPromptTokens = translations.reduce((sum, item) => sum + estimateTokens(item.source_text), 0)
    const estimatedCompletionTokens = translations.reduce((sum, item) => sum + estimateTokens(item.translated_text), 0)

    return {
      translations7d: dailySeries.reduce((sum, item) => sum + item.translations, 0),
      studyMinutes7d: dailySeries.reduce((sum, item) => sum + item.studyMinutes, 0),
      estimatedPromptTokens,
      estimatedCompletionTokens,
      estimatedTotalTokens: estimatedPromptTokens + estimatedCompletionTokens,
    }
  }, [dailySeries, snapshot])

  return (
    <div className={isDesktop ? 'mx-auto max-w-[1360px] px-8 py-8' : 'px-5 py-5'}>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={goBack} className={isDesktop ? 'glass-card-elevated rounded-full p-2.5' : 'rounded-full p-1'}>
            <ChevronLeft size={22} className="text-[var(--color-foreground)]" />
          </button>
          <div>
            <h1 className={`font-secondary font-bold text-[var(--color-foreground)] ${isDesktop ? 'text-[30px]' : 'text-[20px]'}`}>系统后台</h1>
            <p className="text-[13px] text-[var(--color-muted)]">查看 Linswift 当前可见范围内的流量、学习行为与 Kimi API 用量。</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadDashboard()}
          className="rounded-full bg-[var(--color-primary)] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_16px_34px_rgba(255,132,0,0.2)]"
        >
          刷新数据
        </button>
      </div>

      {loading ? (
        <div className="rounded-[28px] bg-[var(--color-card)] p-6 text-[14px] text-[var(--color-muted)]" style={{ boxShadow: 'var(--shadow-card)' }}>
          正在汇总后台数据...
        </div>
      ) : error ? (
        <div className="rounded-[28px] bg-[var(--color-card)] p-6 text-[14px] text-[var(--color-error)]" style={{ boxShadow: 'var(--shadow-card)' }}>
          {error}
        </div>
      ) : snapshot ? (
        <div className="space-y-6">
          <section className="rounded-[28px] bg-[var(--color-card)] p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="mb-4 flex items-center gap-2 text-[var(--color-primary)]">
              <Database size={18} />
              <h2 className="text-[18px] font-semibold text-[var(--color-foreground)]">数据范围</h2>
            </div>
            <p className="text-[13px] leading-6 text-[var(--color-muted)]">{snapshot.scopeLabel}</p>
          </section>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {metricCards.map((card) => {
              const Icon = card.icon
              return (
                <div key={card.label} className="rounded-[24px] bg-[var(--color-card)] p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
                  <div className="mb-4 flex items-center justify-between">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${toneClassMap[card.tone]}`}>
                      <Icon size={20} />
                    </div>
                    <span className="text-[12px] text-[var(--color-muted)]">{card.label}</span>
                  </div>
                  <div className="text-[28px] font-bold text-[var(--color-foreground)]">{card.value}</div>
                  <p className="mt-2 text-[12px] leading-5 text-[var(--color-muted)]">{card.helper}</p>
                </div>
              )
            })}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
            <div className="rounded-[28px] bg-[var(--color-card)] p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
              <div className="mb-5 flex items-center gap-2">
                <BarChart3 size={18} className="text-[var(--color-primary)]" />
                <h2 className="text-[18px] font-semibold text-[var(--color-foreground)]">近 7 天流量趋势</h2>
              </div>

              <div className="space-y-4">
                {dailySeries.map((item) => {
                  const studyWidth = Math.max(8, Math.min(100, (item.studyMinutes / Math.max(...dailySeries.map((row) => row.studyMinutes), 1)) * 100))
                  const translationWidth = Math.max(8, Math.min(100, (item.translations / Math.max(...dailySeries.map((row) => row.translations), 1)) * 100))

                  return (
                    <div key={item.date} className="grid grid-cols-[56px_1fr] gap-3">
                      <div className="pt-1 text-[12px] font-medium text-[var(--color-muted)]">{item.label}</div>
                      <div className="space-y-2">
                        <div>
                          <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--color-muted)]">
                            <span>学习分钟</span>
                            <span>{item.studyMinutes} min</span>
                          </div>
                          <div className="h-2.5 rounded-full bg-[var(--color-background-secondary)]">
                            <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${studyWidth}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--color-muted)]">
                            <span>翻译次数</span>
                            <span>{item.translations}</span>
                          </div>
                          <div className="h-2.5 rounded-full bg-[var(--color-background-secondary)]">
                            <div className="h-full rounded-full bg-[#3B82F6]" style={{ width: `${translationWidth}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="rounded-[28px] bg-[var(--color-card)] p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
              <div className="mb-5 flex items-center gap-2">
                <Languages size={18} className="text-[var(--color-primary)]" />
                <h2 className="text-[18px] font-semibold text-[var(--color-foreground)]">翻译流量结构</h2>
              </div>

              <div className="space-y-3">
                {translationLanguageBreakdown.length > 0 ? translationLanguageBreakdown.map(([label, count]) => (
                  <div key={label} className="rounded-[18px] bg-[var(--color-background-secondary)] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[13px] font-medium text-[var(--color-foreground)]">{label}</span>
                      <span className="text-[12px] text-[var(--color-muted)]">{count} 次</span>
                    </div>
                  </div>
                )) : (
                  <p className="text-[13px] text-[var(--color-muted)]">当前可见范围内暂无足够的翻译记录。</p>
                )}
              </div>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.05fr_1.25fr]">
            <div className="rounded-[28px] bg-[var(--color-card)] p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
              <div className="mb-5 flex items-center gap-2">
                <Wallet size={18} className="text-[var(--color-primary)]" />
                <h2 className="text-[18px] font-semibold text-[var(--color-foreground)]">Kimi API 用量</h2>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <MiniStatCard label="可用余额" value={formatCurrency(snapshot.balance?.available_balance)} icon={Wallet} />
                <MiniStatCard label="代金券" value={formatCurrency(snapshot.balance?.voucher_balance)} icon={Sparkles} />
                <MiniStatCard label="现金余额" value={formatCurrency(snapshot.balance?.cash_balance)} icon={Database} />
              </div>

              <div className="mt-4 rounded-[20px] bg-[var(--color-background-secondary)] p-4">
                <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">说明</div>
                <p className="text-[13px] leading-6 text-[var(--color-muted)]">
                  余额来自 Kimi 官方 balance 接口；下方 tokens 为根据当前可见翻译记录按字符数估算的使用量，用来帮助你快速判断后台使用趋势。
                </p>
              </div>
            </div>

            <div className="rounded-[28px] bg-[var(--color-card)] p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
              <div className="mb-5 flex items-center gap-2">
                <Bot size={18} className="text-[var(--color-primary)]" />
                <h2 className="text-[18px] font-semibold text-[var(--color-foreground)]">AI 功能面板</h2>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <MiniStatCard label="近 7 天翻译" value={formatNumber(usageSummary.translations7d)} icon={Languages} />
                <MiniStatCard label="近 7 天学习分钟" value={formatNumber(usageSummary.studyMinutes7d)} icon={BarChart3} />
                <MiniStatCard label="估算 Prompt Tokens" value={formatNumber(usageSummary.estimatedPromptTokens)} icon={MessageSquare} />
                <MiniStatCard label="估算 Completion Tokens" value={formatNumber(usageSummary.estimatedCompletionTokens)} icon={Bot} />
                <MiniStatCard label="估算总 Tokens" value={formatNumber(usageSummary.estimatedTotalTokens)} icon={Sparkles} />
                <MiniStatCard label="AI 速记收藏" value={formatNumber(snapshot.visibleMnemonics)} icon={Sparkles} />
                <MiniStatCard label="口语对话记录" value={formatNumber(snapshot.visibleDialogues)} icon={MessageSquare} />
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

function MiniStatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: typeof Wallet
}) {
  return (
    <div className="rounded-[20px] bg-[var(--color-background-secondary)] p-4">
      <div className="mb-3 flex items-center gap-2 text-[var(--color-primary)]">
        <Icon size={16} />
        <span className="text-[12px] text-[var(--color-muted)]">{label}</span>
      </div>
      <div className="text-[22px] font-bold text-[var(--color-foreground)]">{value}</div>
    </div>
  )
}
