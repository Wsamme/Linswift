import { useMemo, useState } from 'react'

type LabState = 'ocr' | 'translating' | 'done'
type OverlayPlacement = 'below' | 'above'

const SAMPLE_LINES = [
  'Complete homework before 6:05.',
  'Do a short workout and take a shower after that.',
  'Finish MakeMore lesson 1, then send Puti a quick update about today’s plan.',
]

const SAMPLE_TRANSLATION = [
  '请在 6:05 前完成作业。',
  '之后简单运动并洗澡。',
  '完成 MakeMore 第一课后，再给 Puti 发一条关于今天安排的简短更新。',
]

const SAMPLE_WORDS = [
  { word: 'homework', meaning: '家庭作业' },
  { word: 'workout', meaning: '锻炼' },
  { word: 'update', meaning: '更新' },
  { word: 'shower', meaning: '淋浴' },
  { word: 'lesson', meaning: '课程' },
]

function highlightLine(line: string) {
  return line
    .replace('homework', '<span class="text-orange-400 font-semibold underline decoration-orange-300/60 underline-offset-2">homework</span>')
    .replace('workout', '<span class="text-orange-400 font-semibold underline decoration-orange-300/60 underline-offset-2">workout</span>')
    .replace('shower', '<span class="text-orange-400 font-semibold underline decoration-orange-300/60 underline-offset-2">shower</span>')
    .replace('lesson', '<span class="text-orange-400 font-semibold underline decoration-orange-300/60 underline-offset-2">lesson</span>')
    .replace('update', '<span class="text-orange-400 font-semibold underline decoration-orange-300/60 underline-offset-2">update</span>')
}

export default function DesktopScreenshotLabPage() {
  const [state, setState] = useState<LabState>('done')
  const [placement, setPlacement] = useState<OverlayPlacement>('below')
  const [smartWordsEnabled, setSmartWordsEnabled] = useState(true)
  const [targetLang, setTargetLang] = useState<'简体中文' | '繁體中文' | 'English' | '日本語'>('简体中文')

  const statusText = useMemo(() => {
    if (state === 'ocr') return 'OCR 识别中…'
    if (state === 'translating') return '翻译中…'
    return 'OCR 已完成'
  }, [state])

  const overlayOffsetClass = placement === 'below' ? 'top-[28rem]' : 'top-[1.5rem]'

  return (
    <div className="min-h-screen bg-[#f7f2ea] px-6 py-10 text-[#251d19]">
      <div className="mx-auto flex max-w-[1440px] gap-8">
        <div className="w-[320px] shrink-0 rounded-[28px] border border-white/70 bg-white/65 p-6 shadow-[0_18px_40px_rgba(48,30,16,0.08)] backdrop-blur-xl">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8d8379]">
              Screenshot Lab
            </p>
            <h1 className="text-4xl font-bold tracking-tight">截图翻译实验室</h1>
            <p className="text-sm leading-6 text-[#7e756c]">
              这里专门用来可视化迭代桌面版截图翻译。先调选区框、加载态、弹窗层级，再进 Electron 验证系统定位。
            </p>
          </div>

          <div className="mt-8 space-y-5">
            <div className="space-y-3">
              <p className="text-sm font-semibold text-[#5f564d]">当前状态</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['ocr', 'OCR 中'],
                  ['translating', '翻译中'],
                  ['done', '完成'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setState(value)}
                    className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                      state === value
                        ? 'bg-[#ff8a10] text-white shadow-[0_10px_22px_rgba(255,138,16,0.24)]'
                        : 'border border-white/80 bg-white/75 text-[#8b8075]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-[#5f564d]">弹窗位置</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['below', '选区下方'],
                  ['above', '选区上方'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPlacement(value)}
                    className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                      placement === value
                        ? 'bg-[#ff8a10] text-white shadow-[0_10px_22px_rgba(255,138,16,0.24)]'
                        : 'border border-white/80 bg-white/75 text-[#8b8075]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[22px] border border-white/70 bg-white/72 p-4">
              <label className="flex items-center justify-between gap-4">
                <span className="text-sm font-semibold text-[#4d443d]">智慧识词</span>
                <button
                  type="button"
                  onClick={() => setSmartWordsEnabled((value) => !value)}
                  className={`relative h-8 w-14 rounded-full transition ${
                    smartWordsEnabled ? 'bg-[#ff8a10]' : 'bg-[#cfc7bf]'
                  }`}
                >
                  <span
                    className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${
                      smartWordsEnabled ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </label>
              <p className="mt-3 text-xs leading-5 text-[#7d746b]">
                用它来提前调 `OCR 识别区域`、深灰原文块、译文玻璃卡和词汇胶囊的层级关系。
              </p>
            </div>

            <div className="rounded-[22px] border border-white/70 bg-white/72 p-4 text-xs leading-5 text-[#7d746b]">
              <p className="font-semibold text-[#5f564d]">建议开发流程</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4">
                <li>先跑 `npm run dev`，打开这个实验室页面。</li>
                <li>视觉和交互定稿后，再用 `npm run desktop:start:dev` 看 Electron。</li>
                <li>最后才打 DMG，不再每次安装手测。</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="relative min-h-[920px] flex-1 overflow-hidden rounded-[32px] border border-white/70 bg-[linear-gradient(180deg,#fdfaf4,#f6efe4)] shadow-[0_24px_60px_rgba(42,26,16,0.10)]">
          <div className="absolute inset-x-0 top-0 h-16 border-b border-[#efe6db] bg-white/80 backdrop-blur-xl" />
          <div className="absolute left-10 top-5 flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-[#ff8d57]" />
            <div className="h-3 w-3 rounded-full bg-[#ffd166]" />
            <div className="h-3 w-3 rounded-full bg-[#8ed081]" />
          </div>
          <div className="absolute left-12 top-28 h-[720px] w-[1020px] rounded-[30px] border border-[#eadfce] bg-white/55 p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
            <p className="text-[42px] font-semibold tracking-tight text-[#332821]">Weekend reset checklist</p>
            <div className="mt-8 max-w-[720px] space-y-6 text-[34px] leading-[1.28] text-[#3a2c23]">
              {SAMPLE_LINES.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>

          <div className="absolute left-[88px] top-[118px] h-[292px] w-[724px] rounded-[28px] border-[4px] border-[#ff7f4b] shadow-[0_0_0_1px_rgba(255,255,255,0.42),0_18px_36px_rgba(25,14,9,0.18)]">
            <div className="absolute -top-5 left-4 inline-flex h-9 items-center rounded-full bg-[linear-gradient(180deg,#ff8d57,#ff7646)] px-4 text-sm font-bold tracking-[0.03em] text-[#fff8f1] shadow-[0_10px_24px_rgba(255,123,68,0.28)]">
              OCR 识别区域
            </div>
            <div className="absolute -bottom-5 left-4 inline-flex h-9 items-center gap-2 rounded-full bg-[rgba(54,57,63,0.94)] px-4 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(18,12,9,0.24)]">
              <span className="h-2 w-2 rounded-full bg-[#ff9b4c] shadow-[0_0_10px_rgba(255,155,76,0.6)]" />
              {statusText}
            </div>
          </div>

          <div className={`absolute left-[116px] w-[676px] ${overlayOffsetClass}`}>
            <div className="relative rounded-[30px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,250,245,0.92),rgba(250,244,236,0.90))] shadow-[0_18px_42px_rgba(36,26,20,0.16),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-[24px]">
              <button
                type="button"
                className="absolute right-3 top-3 z-[3] h-8 w-8 rounded-full bg-white/60 text-lg text-[#9b8f84] backdrop-blur-sm"
              >
                ×
              </button>

              <div className="grid gap-3 p-4 pt-12">
                <section className="overflow-hidden rounded-[22px] border border-white/20 bg-[rgba(67,71,78,0.96)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <div className="flex items-center justify-between gap-2 px-4 pt-3">
                    <p className="text-[11px] font-bold tracking-[0.04em] text-[rgba(250,246,240,0.92)]">OCR 原文</p>
                    <p className="text-[10px] font-semibold text-[rgba(250,246,240,0.82)]">点按复制</p>
                  </div>
                  <div className="space-y-1 px-4 pb-4 pt-3 text-[14px] font-medium leading-[1.5] text-[#faf5ef]">
                    {SAMPLE_LINES.map((line) => (
                      <p key={line} dangerouslySetInnerHTML={{ __html: highlightLine(line) }} />
                    ))}
                  </div>
                </section>

                <section className="overflow-hidden rounded-[22px] border border-white/40 bg-[rgba(255,249,242,0.74)] backdrop-blur-[16px]">
                  <div className="flex items-center justify-between gap-2 px-4 pt-3">
                    <p className="text-[11px] font-bold tracking-[0.04em] text-[#6e6259]">译文</p>
                    <p className="text-[10px] font-semibold text-[#8d8278]">点按复制</p>
                  </div>
                  <div className="space-y-1 px-4 pb-4 pt-3 text-[14px] font-medium leading-[1.5] text-[#2f251f]">
                    {SAMPLE_TRANSLATION.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                </section>

                <section className="overflow-hidden rounded-[22px] border border-white/40 bg-[rgba(242,233,220,0.72)] backdrop-blur-[14px]">
                  <p className="px-4 pt-3 text-[11px] font-semibold text-[#8a7b70]">
                    识别到 5 个值得学习的词汇：
                  </p>
                  <div className="grid grid-cols-3 gap-2 px-4 pt-3">
                    {SAMPLE_WORDS.map((item) => (
                      <div
                        key={item.word}
                        className="flex min-w-0 items-center gap-1 rounded-full border border-white/80 bg-[rgba(255,248,241,0.86)] px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                      >
                        <span className="truncate text-[10px] font-bold text-[#f28a1d]">{item.word}</span>
                        <span className="truncate text-[9px] font-semibold text-[#8d7b68]">{item.meaning}</span>
                        <span className="ml-auto text-[11px] font-bold text-[#f28a1d]">+</span>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="mx-4 mb-4 mt-3 h-9 w-[calc(100%-2rem)] rounded-full border border-white/80 bg-[rgba(255,248,241,0.96)] text-[11px] font-bold text-[#d67f1f] shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]"
                  >
                    一键收录 5 个陌生词汇
                  </button>
                </section>

                <footer className="grid grid-cols-[auto_auto_1fr] gap-2">
                  <div className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-[rgba(74,77,83,0.96)] px-4 text-sm font-semibold text-white">
                    <span className="h-2 w-2 rounded-full bg-[#4ade80]" />
                    OCR 已完成
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const cycle = ['简体中文', '繁體中文', 'English', '日本語'] as const
                      const nextIndex = (cycle.indexOf(targetLang) + 1) % cycle.length
                      setTargetLang(cycle[nextIndex])
                    }}
                    className="inline-flex h-10 items-center rounded-full border border-white/10 bg-[rgba(74,77,83,0.96)] px-4 text-[14px] font-semibold text-white"
                  >
                    {`英语 → ${targetLang === '简体中文' ? '中文(简)' : targetLang === '繁體中文' ? '中文(繁)' : targetLang}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSmartWordsEnabled((value) => !value)}
                    className="inline-flex h-10 items-center justify-between rounded-full border border-white/10 bg-[rgba(74,77,83,0.96)] px-4 text-[14px] font-semibold text-white"
                  >
                    <span>智慧识词</span>
                    <span className={`relative h-6 w-11 rounded-full ${smartWordsEnabled ? 'bg-[#ff8a10]' : 'bg-[#b5b2ae]'}`}>
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
                          smartWordsEnabled ? 'left-[22px]' : 'left-0.5'
                        }`}
                      />
                    </span>
                  </button>
                </footer>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
