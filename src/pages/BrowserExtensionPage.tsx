import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2,
  Download,
  Globe,
  Puzzle,
  Settings2,
  Shield,
  Sparkles,
} from 'lucide-react'
import { Footer, Navbar } from './LandingPage'

const DOWNLOAD_URL = 'https://www.linswift.com/downloads/linswift-browser-extension.zip'

const installSteps = [
  '下载浏览器插件安装包，解压到一个后续不会随意删除的本地文件夹。',
  '打开 Chrome 或 Edge，访问 chrome://extensions 或 edge://extensions。',
  '开启右上角“开发者模式”，点击“加载已解压的扩展程序”。',
  '选择解压后的 chrome-extension 文件夹，完成安装。',
  '把 Linswift 插件固定到工具栏，方便在任意网页快速打开。',
]

const setupSteps = [
  '打开任意英文网页，点击插件图标或页面里的常驻圆球。',
  '在设置中选择页内翻译语言，并切换翻译引擎：混合模式、DeepL 或 AI。',
  '如果希望页面刷新后自动翻译，开启“自动翻译网页”。',
  '如果某个网站不想自动翻译，点击“当前网站不翻译”，插件会记住当前域名。',
  '登录你的 Linswift 账号后，收藏词汇和掌握状态会同步到云端。',
]

const modeCards = [
  {
    title: '混合模式',
    desc: 'DeepL 负责主译文，AI 补充词义分析。适合大多数网页阅读和字幕场景。',
  },
  {
    title: 'DeepL',
    desc: '只保留稳定机器翻译结果。适合追求速度和术语一致性的网页阅读。',
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
    a: '官网部署只会更新线上代理和教程页，不会自动更新你浏览器里已经安装的本地扩展代码。扩展本体仍需重新加载或重新安装。',
  },
]

const usageTips = [
  '长文章阅读优先用“混合模式”，翻译稳定且保留 AI 生词分析。',
  'YouTube 双语字幕如果想要更稳定的整段翻译，优先切到 DeepL。',
  '只在少数站点需要自动翻译时，再打开“自动翻译网页”，并按域名单独排除不想翻译的网站。',
]

export default function BrowserExtensionPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-white text-[#1A1A1A] overflow-x-hidden">
      <Navbar
        onLogin={() => navigate('/login')}
        onRegister={() => navigate('/register')}
        linkBase="/"
      />

      <main>
        <section className="relative overflow-hidden pb-16 pt-[112px] md:pb-20 md:pt-[132px]">
          <div className="absolute inset-0 bg-gradient-to-br from-[#FFF5EB] via-white to-[#F7F2FF]" />
          <div className="absolute top-8 right-0 h-[320px] w-[320px] rounded-full bg-[#FF8400]/6 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-[260px] w-[260px] rounded-full bg-[#8B5CF6]/6 blur-3xl" />

          <div className="relative mx-auto max-w-[1200px] px-6">
            <div className="max-w-[860px]">
              <div className="inline-flex items-center gap-2 rounded-full bg-[#FF8400]/10 px-4 py-1.5 text-[13px] font-semibold text-[#FF8400]">
                <Puzzle size={14} />
                浏览器插件
              </div>

              <h1 className="mt-6 text-[36px] font-extrabold leading-[1.1] tracking-tight md:text-[56px]">
                把 Linswift 带到每一个网页里
              </h1>

              <p className="mt-6 max-w-[760px] text-[16px] leading-8 text-[#666] md:text-[18px]">
                官网现在提供浏览器插件安装包下载。安装后，你可以在任意英文网页和 YouTube 字幕上直接使用
                Linswift：页内翻译、陌生词识别、云端词库同步，以及按网站记忆自动翻译规则。
              </p>

              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <a
                  href={DOWNLOAD_URL}
                  download
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#FF8400] px-8 py-4 text-[16px] font-bold text-white shadow-lg shadow-[#FF8400]/20 transition-colors hover:bg-[#E87600]"
                >
                  <Download size={18} />
                  下载 zip 安装包
                </a>
                <a
                  href="#install-steps"
                  className="inline-flex items-center justify-center rounded-2xl border-2 border-[#E5E5E5] px-8 py-4 text-[16px] font-semibold text-[#1A1A1A] transition-colors hover:border-[#FF8400]"
                >
                  查看安装步骤
                </a>
              </div>
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              <div className="rounded-3xl border border-white/60 bg-white/72 p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF1E6]">
                  <Download size={18} className="text-[#FF8400]" />
                </div>
                <h2 className="mt-4 text-[20px] font-bold">官网直接下载</h2>
                <p className="mt-3 text-[14px] leading-7 text-[#666]">
                  当前提供 Chrome / Edge 手动安装包，下载后可立即加载到浏览器。
                </p>
              </div>

              <div className="rounded-3xl border border-white/60 bg-white/72 p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EEF3FF]">
                  <Sparkles size={18} className="text-[#8B5CF6]" />
                </div>
                <h2 className="mt-4 text-[20px] font-bold">和官网同一套翻译引擎</h2>
                <p className="mt-3 text-[14px] leading-7 text-[#666]">
                  插件与官网翻译页共享相同的混合模式、DeepL 和 AI 语义，不再割裂。
                </p>
              </div>

              <div className="rounded-3xl border border-white/60 bg-[#1A1A1A] p-6 text-white">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                  <Shield size={18} className="text-white" />
                </div>
                <h2 className="mt-4 text-[20px] font-bold">首次安装提示</h2>
                <p className="mt-3 text-[14px] leading-7 text-white/78">
                  第一次安装需要浏览器开发者模式。后续升级扩展时，只需替换目录并在扩展管理页点一次 Reload。
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="install-steps" className="py-16 md:py-20">
          <div className="mx-auto max-w-[1200px] px-6">
            <div className="max-w-[760px]">
              <span className="text-[13px] font-semibold uppercase tracking-wider text-[#FF8400]">Install Guide</span>
              <h2 className="mt-3 text-[28px] font-extrabold md:text-[40px]">安装与配置</h2>
              <p className="mt-3 text-[16px] leading-7 text-[#888]">
                页面结构保持和官网主站一致，只保留必要信息，不再额外做浮层式板块。
              </p>
            </div>

            <div className="mt-12 grid gap-12 lg:grid-cols-2">
              <div>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF1E6]">
                    <Download size={18} className="text-[#FF8400]" />
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#8C8C8C]">Step 1</p>
                    <h3 className="mt-1 text-[24px] font-extrabold">安装浏览器插件</h3>
                  </div>
                </div>
                <ol className="mt-8 space-y-5">
                  {installSteps.map((item, index) => (
                    <li key={item} className="flex gap-4 border-b border-[#F0F0F0] pb-5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FF8400] text-[13px] font-bold text-white">
                        {index + 1}
                      </div>
                      <p className="pt-0.5 text-[15px] leading-7 text-[#555]">{item}</p>
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F3EEFF]">
                    <Settings2 size={18} className="text-[#8B5CF6]" />
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#8C8C8C]">Step 2</p>
                    <h3 className="mt-1 text-[24px] font-extrabold">完成基础配置</h3>
                  </div>
                </div>
                <ol className="mt-8 space-y-5">
                  {setupSteps.map((item, index) => (
                    <li key={item} className="flex gap-4 border-b border-[#F0F0F0] pb-5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#8B5CF6] text-[13px] font-bold text-white">
                        {index + 1}
                      </div>
                      <p className="pt-0.5 text-[15px] leading-7 text-[#555]">{item}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#FAFAFA] py-16 md:py-20">
          <div className="mx-auto max-w-[1200px] px-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="max-w-[700px]">
                <span className="text-[13px] font-semibold uppercase tracking-wider text-[#FF8400]">Translation Modes</span>
                <h2 className="mt-3 text-[28px] font-extrabold md:text-[40px]">网页 / 字幕翻译引擎怎么选</h2>
              </div>
              <p className="max-w-[460px] text-[15px] leading-7 text-[#666]">
                官网翻译页和浏览器插件现在共用同一套引擎语义，配置理解保持一致。
              </p>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {modeCards.map((item) => (
                <article key={item.title} className="border border-[#ECECEC] bg-white p-7">
                  <div className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#FF8400]">
                    <Sparkles size={14} />
                    {item.title}
                  </div>
                  <p className="mt-4 text-[15px] leading-7 text-[#555]">{item.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 md:py-20">
          <div className="mx-auto grid max-w-[1200px] gap-12 px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <span className="text-[13px] font-semibold uppercase tracking-wider text-[#FF8400]">FAQ</span>
              <h2 className="mt-3 text-[28px] font-extrabold md:text-[40px]">常见问题</h2>

              <div className="mt-10 divide-y divide-[#F0F0F0] border-t border-[#F0F0F0]">
                {faqItems.map((item) => (
                  <article key={item.q} className="py-6">
                    <h3 className="text-[18px] font-bold text-[#1A1A1A]">{item.q}</h3>
                    <p className="mt-3 text-[15px] leading-7 text-[#666]">{item.a}</p>
                  </article>
                ))}
              </div>
            </div>

            <aside>
              <div className="sticky top-[104px] border border-[#ECECEC] bg-[#1A1A1A] p-7 text-white">
                <p className="inline-flex items-center gap-2 text-[13px] font-semibold text-white/72">
                  <Globe size={14} />
                  使用建议
                </p>
                <ul className="mt-6 space-y-4">
                  {usageTips.map((tip) => (
                    <li key={tip} className="flex items-start gap-3 text-[14px] leading-7 text-white/82">
                      <CheckCircle2 size={18} className="mt-1 shrink-0 text-[#FFB15C]" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        </section>
      </main>

      <Footer linkBase="/" />
    </div>
  )
}
