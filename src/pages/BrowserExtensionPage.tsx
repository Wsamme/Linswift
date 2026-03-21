import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Download, Puzzle, Settings2, Globe, CheckCircle2, Shield, Sparkles,
} from 'lucide-react'
import { Footer, Navbar } from './LandingPage'

const DOWNLOAD_URL = '/downloads/linswift-browser-extension.zip'

const installSteps = [
  '下载浏览器插件安装包，解压到你能长期保留的本地文件夹。',
  '打开 Chrome 或 Edge，访问 `chrome://extensions` 或 `edge://extensions`。',
  '开启右上角“开发者模式”，点击“加载已解压的扩展程序”。',
  '选择刚刚解压后的 `chrome-extension` 文件夹，完成安装。',
  '固定 Linswift 插件图标，方便在任意网页快速打开。',
]

const setupSteps = [
  '打开任意英文网页，点击右上角 Linswift 插件图标或页面里的常驻圆球。',
  '在设置里选择页内直译语言，并切换网页 / 字幕翻译引擎：`混合模式 / DeepL / AI`。',
  '如果希望页面刷新后自动翻译，开启“自动翻译网页”。',
  '如果某个网站不想自动翻译，点击“当前网站不翻译”，插件会记住这个域名。',
  '登录你的 Linswift 账号后，收藏词汇和掌握状态会同步到云端。',
]

const modeCards = [
  {
    title: '混合模式',
    desc: 'DeepL 负责主译文，AI 补充词义分析。适合大多数网页和字幕场景。',
  },
  {
    title: 'DeepL',
    desc: '只保留稳定机器翻译结果。适合追求速度和一致性的网页阅读。',
  },
  {
    title: 'AI',
    desc: '使用 AI 翻译链路，表达更灵活。适合需要更强语境重写的场景。',
  },
]

const faqItems = [
  {
    q: '为什么官网下载安装包后不是“一键安装”？',
    a: '当前是官网直接分发 zip 安装包，所以首次安装需要在浏览器扩展页手动开启开发者模式并加载已解压目录。',
  },
  {
    q: '插件更新后需要重新安装吗？',
    a: '如果你下载了新的 zip 版本，覆盖原来的扩展目录后，在扩展管理页点击一次 Reload 即可生效。',
  },
  {
    q: '为什么网页已经部署了，但插件功能还是旧的？',
    a: '官网部署只会更新线上代理和教程页，不会自动改你浏览器里已经安装的本地扩展代码。扩展本体仍需重新加载或重新安装。',
  },
]

export default function BrowserExtensionPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#FFF6EC_0%,#FFFFFF_48%,#FFF2FA_100%)] text-[#1A1A1A]">
      <Navbar
        onLogin={() => navigate('/login')}
        onRegister={() => navigate('/register')}
        linkBase="/"
      />

      <main className="mx-auto max-w-[1180px] px-6 pb-16 pt-[112px] md:pb-20 md:pt-[126px]">
        <section className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_360px]">
          <div className="rounded-[36px] bg-white/82 p-8 shadow-[0_24px_80px_rgba(255,132,0,0.08)] backdrop-blur-xl md:p-10">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#FF8400]/10 px-4 py-1.5 text-[13px] font-semibold text-[#FF8400]">
              <Puzzle size={14} />
              浏览器插件
            </div>
            <h1 className="mt-5 text-[34px] font-extrabold leading-tight md:text-[48px]">
              把 Linswift 放进网页里
            </h1>
            <p className="mt-4 max-w-[720px] text-[16px] leading-8 text-[#666]">
              安装浏览器插件后，你可以在任意英文网页、文章和 YouTube 字幕上直接使用 Linswift：
              扫描陌生词、页内直译、整段字幕翻译、云端同步词库，以及当前网站的自动翻译记忆。
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={DOWNLOAD_URL}
                download
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#FF8400] px-6 py-4 text-[15px] font-bold text-white shadow-lg shadow-[#FF8400]/20 transition-colors hover:bg-[#E87600]"
              >
                <Download size={18} />
                下载 zip 安装包
              </a>
              <a
                href="#install-steps"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#F1D4B2] bg-white px-6 py-4 text-[15px] font-semibold text-[#1A1A1A] transition-colors hover:border-[#FF8400]"
              >
                查看安装步骤
              </a>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E5E5E5] bg-white px-6 py-4 text-[15px] font-semibold text-[#1A1A1A] transition-colors hover:border-[#1A1A1A]"
              >
                返回官网首页
              </button>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-[32px] bg-white/82 p-6 shadow-[0_24px_80px_rgba(255,132,0,0.08)] backdrop-blur-xl">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#8C8C8C]">Package</p>
              <h2 className="mt-3 text-[22px] font-bold">当前下载内容</h2>
              <ul className="mt-4 space-y-3 text-[14px] leading-7 text-[#555]">
                <li>Chrome / Edge 手动安装包</li>
                <li>包含网页生词雷达、字幕翻译、云端词库同步</li>
                <li>与官网 `www.linswift.com` 的 DeepL 代理联动</li>
              </ul>
            </div>

            <div className="rounded-[32px] bg-[#1A1A1A] p-6 text-white shadow-[0_24px_80px_rgba(26,26,26,0.18)]">
              <p className="inline-flex items-center gap-2 text-[13px] font-semibold text-white/70">
                <Shield size={14} />
                安装提示
              </p>
              <p className="mt-4 text-[15px] leading-7 text-white/82">
                首次安装需要浏览器开发者模式。后续更新扩展时，只要替换文件夹并在扩展管理页点击一次 Reload 即可。
              </p>
            </div>
          </aside>
        </section>

        <section id="install-steps" className="mt-8 grid gap-6 lg:grid-cols-2">
          <GuideCard
            kicker="Step 1"
            title="安装浏览器插件"
            icon={<Download size={18} className="text-[#FF8400]" />}
            items={installSteps}
          />
          <GuideCard
            kicker="Step 2"
            title="完成基础配置"
            icon={<Settings2 size={18} className="text-[#8B5CF6]" />}
            items={setupSteps}
          />
        </section>

        <section className="mt-8 rounded-[36px] bg-white/82 p-8 shadow-[0_24px_80px_rgba(255,132,0,0.08)] backdrop-blur-xl md:p-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#8C8C8C]">Translation Modes</p>
              <h2 className="mt-3 text-[28px] font-extrabold">网页 / 字幕翻译引擎怎么选</h2>
            </div>
            <p className="max-w-[460px] text-[14px] leading-7 text-[#666]">
              现在官网翻译页和浏览器插件都共用同一套引擎语义，不会再出现网页和插件配置不一致。
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {modeCards.map((item) => (
              <article
                key={item.title}
                className="rounded-[26px] border border-[#F3E1D2] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,248,240,0.82))] p-6 shadow-[0_12px_30px_rgba(255,132,0,0.05)]"
              >
                <div className="inline-flex items-center gap-2 rounded-full bg-[#FFF1E6] px-3 py-1 text-[12px] font-semibold text-[#FF8400]">
                  <Sparkles size={13} />
                  {item.title}
                </div>
                <p className="mt-4 text-[14px] leading-7 text-[#555]">{item.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-[36px] bg-white/82 p-8 shadow-[0_24px_80px_rgba(255,132,0,0.08)] backdrop-blur-xl md:p-10">
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#8C8C8C]">FAQ</p>
            <h2 className="mt-3 text-[28px] font-extrabold">常见问题</h2>

            <div className="mt-8 space-y-4">
              {faqItems.map((item) => (
                <article key={item.q} className="rounded-[24px] border border-[#F4E6D8] bg-white/70 p-5">
                  <h3 className="text-[16px] font-bold text-[#1A1A1A]">{item.q}</h3>
                  <p className="mt-2 text-[14px] leading-7 text-[#666]">{item.a}</p>
                </article>
              ))}
            </div>
          </div>

          <aside className="rounded-[36px] bg-[linear-gradient(145deg,#1A1A1A,#242424)] p-8 text-white shadow-[0_24px_80px_rgba(26,26,26,0.18)]">
            <p className="inline-flex items-center gap-2 text-[13px] font-semibold text-white/70">
              <Globe size={14} />
              使用建议
            </p>
            <ul className="mt-6 space-y-4">
              {[
                '长文章阅读优先用“混合模式”，翻译稳定且保留 AI 生词分析。',
                'YouTube 双语字幕如果想要更稳定的整段翻译，优先切到 DeepL。',
                '只在少数站点需要自动翻译时，打开“自动翻译网页”，并按域名单独排除不想翻译的网站。',
              ].map((tip) => (
                <li key={tip} className="flex items-start gap-3 text-[14px] leading-7 text-white/82">
                  <CheckCircle2 size={18} className="mt-1 shrink-0 text-[#FFB15C]" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </aside>
        </section>
      </main>
      <Footer linkBase="/" />
    </div>
  )
}

function GuideCard({
  kicker,
  title,
  icon,
  items,
}: {
  kicker: string
  title: string
  icon: ReactNode
  items: string[]
}) {
  return (
    <section className="rounded-[36px] bg-white/82 p-8 shadow-[0_24px_80px_rgba(255,132,0,0.08)] backdrop-blur-xl md:p-10">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF1E6]">
          {icon}
        </div>
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#8C8C8C]">{kicker}</p>
          <h2 className="mt-1 text-[24px] font-extrabold">{title}</h2>
        </div>
      </div>

      <ol className="mt-8 space-y-4">
        {items.map((item, index) => (
          <li key={item} className="flex gap-4 rounded-[24px] border border-[#F4E6D8] bg-white/70 p-5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FF8400] text-[13px] font-bold text-white">
              {index + 1}
            </div>
            <p className="text-[14px] leading-7 text-[#555]">{item}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
