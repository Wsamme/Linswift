import { ChevronLeft, BookOpenText, Sparkles, PenSquare, Bookmark, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { longSentenceReadingItems, longSentenceWritingPrompts } from '../data/longSentences'
import { useLongSentenceCollection } from '../hooks/useLongSentenceCollection'
import { useLogicalBack } from '../hooks/useLogicalBack'

const cards = [
  {
    key: 'reading',
    title: '阅读精讲',
    desc: '50 句静态长难句，逐句拆成短句，主谓宾与从句颜色区分。',
    path: '/grammar/long-sentence/reading',
    icon: BookOpenText,
    tone: 'from-[#FFF3E7] to-[#FFE2B8]',
  },
  {
    key: 'analyze',
    title: 'AI 自动分析',
    desc: '粘贴一句英文长句，自动拆分结构、解释连接词和语法功能。',
    path: '/grammar/long-sentence/analyze',
    icon: Sparkles,
    tone: 'from-[#EEF4FF] to-[#D7E7FF]',
  },
  {
    key: 'writing',
    title: '写作训练',
    desc: '50 个静态情景，提示连接词与句型，练习写更成熟的长句。',
    path: '/grammar/long-sentence/writing',
    icon: PenSquare,
    tone: 'from-[#EEFCEF] to-[#D7F7DF]',
  },
  {
    key: 'collection',
    title: '长难句收藏',
    desc: '保存你喜欢的静态句和 AI 拆句结果，后续可复盘和扩充。',
    path: '/grammar/long-sentence/collection',
    icon: Bookmark,
    tone: 'from-[#FFF1F6] to-[#FFE0EA]',
  },
]

export default function LongSentenceHubPage() {
  const navigate = useNavigate()
  const goBack = useLogicalBack('/grammar')
  const { items } = useLongSentenceCollection()

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#FFF9F2_0%,#F8FAFC_30%,#F8FAFC_100%)]">
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={goBack} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)]">长难句学习</h1>
        <div className="w-6" />
      </div>

      <div className="px-5 pb-8">
        <div className="rounded-[30px] bg-[linear-gradient(135deg,#111827,#334155)] p-6 text-white shadow-[0_18px_40px_rgba(15,23,42,0.24)]">
          <div className="inline-flex rounded-full bg-white/12 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-white/80">
            LONG SENTENCE STUDIO
          </div>
          <h2 className="mt-4 text-[28px] font-bold leading-tight">
            把“看不懂的一整坨”，
            <br />
            拆成能读、能写、能复用的结构。
          </h2>
          <p className="mt-3 max-w-[680px] text-[14px] leading-7 text-white/75">
            阅读板块用颜色标主谓宾和从句，AI 板块负责实时拆句，写作板块给你静态题库和连接词提示，收藏板块则把好句子沉淀下来。
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[20px] bg-white/10 p-4">
              <div className="text-[26px] font-bold">{longSentenceReadingItems.length}</div>
              <div className="text-[12px] text-white/70">静态阅读长句</div>
            </div>
            <div className="rounded-[20px] bg-white/10 p-4">
              <div className="text-[26px] font-bold">{longSentenceWritingPrompts.length}</div>
              <div className="text-[12px] text-white/70">静态写作情景</div>
            </div>
            <div className="rounded-[20px] bg-white/10 p-4">
              <div className="text-[26px] font-bold">{items.length}</div>
              <div className="text-[12px] text-white/70">已收藏句子</div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {cards.map((card) => {
            const Icon = card.icon
            return (
              <button
                key={card.key}
                onClick={() => navigate(card.path)}
                className={`group rounded-[28px] bg-gradient-to-br ${card.tone} p-5 text-left shadow-[0_14px_34px_rgba(15,23,42,0.08)] transition-transform active:scale-[0.98]`}
              >
                <div className="flex items-center justify-between">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] bg-white/80 text-slate-800">
                    <Icon size={22} />
                  </div>
                  <ArrowRight size={18} className="text-slate-500 transition-transform group-hover:translate-x-0.5" />
                </div>
                <div className="mt-4 text-[20px] font-bold text-slate-900">{card.title}</div>
                <div className="mt-2 text-[14px] leading-7 text-slate-600">{card.desc}</div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
