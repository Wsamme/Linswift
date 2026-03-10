import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Play, Pause, SkipForward, SkipBack, Volume2,
  ChevronRight, VolumeX,
} from 'lucide-react'
import { useAudioPlayer, textToSegments, type AudioSegment } from '../hooks/useAudioPlayer'

/**
 * 随行听 —— 听力模块
 *
 * 功能：
 *  1. "正在播放" 卡片 —— 真正的 TTS 播放器
 *  2. 分类标签：推荐 / TED / 新闻 / 课程 / 学习
 *  3. 内容列表（标题、来源、时长、难度）
 *  4. 点击内容即可切换播放（自动开始朗读）
 *  5. 退出页面自动停止播放
 */

// ===== 分类标签 =====
const categories = ['推荐', 'TED', '新闻', '课程', '学习']

// ===== 内容列表 —— 附带真实英文朗读脚本 =====
const contentList = [
  {
    title: 'The Power of Vulnerability',
    source: 'TED Talk · Brené Brown',
    duration: '3:20',
    difficulty: 'B1',
    vocab: 45,
    thumb: '🎤',
    category: 'TED',
    script: `Connection is why we're here. It's what gives purpose and meaning to our lives. The ability to feel connected is neurobiologically how we're wired. It's why we're here. In order for connection to happen, we have to allow ourselves to be seen, really seen. Vulnerability is not weakness. It is our most accurate measurement of courage. To be vulnerable, to let ourselves be seen, to be honest. When we numb vulnerability, we numb joy, we numb gratitude, we numb happiness. Vulnerability is the birthplace of innovation, creativity, and change. To create is to make something that has never existed before. There's nothing more vulnerable than that.`,
  },
  {
    title: 'How AI is Transforming Education',
    source: 'TED Talk · Sal Khan',
    duration: '2:45',
    difficulty: 'B2',
    vocab: 62,
    thumb: '🤖',
    category: 'TED',
    script: `Artificial intelligence is not going to replace teachers. But teachers who use AI will replace teachers who don't. The real power of AI in education is personalization. Every student learns at a different pace. Some need more time with fractions. Others need more practice with reading comprehension. AI tutors can adapt to each student's needs in real time, providing the right challenge at the right moment. This is not about replacing human connection. It's about amplifying it. When AI handles the repetitive aspects of teaching, teachers are free to do what they do best: inspire, mentor, and connect with students on a human level.`,
  },
  {
    title: 'The Secret to Happiness',
    source: 'TED Talk · Robert Waldinger',
    duration: '3:10',
    difficulty: 'B1',
    vocab: 40,
    thumb: '😊',
    category: 'TED',
    script: `What keeps us healthy and happy as we go through life? If you think it's fame and money, you're not alone. But you're mistaken. The clearest message that we get from this seventy five year study is this: Good relationships keep us happier and healthier. Period. People who are more socially connected to family, to friends, to community, are happier. They're physically healthier. And they live longer than people who are less well connected. The experience of loneliness turns out to be toxic. It's not just the number of friends you have. It's the quality of your close relationships that matters.`,
  },
  {
    title: 'Your Body Language Shapes Who You Are',
    source: 'TED Talk · Amy Cuddy',
    duration: '2:50',
    difficulty: 'B1',
    vocab: 48,
    thumb: '🧍',
    category: 'TED',
    script: `Our bodies change our minds. And our minds can change our behavior. And our behavior can change our outcomes. When you pretend to be powerful, you are more likely to actually feel powerful. Two minutes of power posing can significantly change the outcomes of your life. Don't fake it till you make it. Fake it till you become it. Tiny tweaks can lead to big changes. Before you go into the next stressful situation, for two minutes, try doing this in the elevator or in a bathroom stall. Configure your brain to cope the best in that situation. Get your testosterone up. Get your cortisol down.`,
  },
  {
    title: 'BBC World News Update',
    source: 'BBC News',
    duration: '2:00',
    difficulty: 'B2',
    vocab: 38,
    thumb: '📰',
    category: '新闻',
    script: `Good evening. Here are the top stories from around the world. Global leaders have gathered in Geneva for the annual climate summit, where discussions focused on reducing carbon emissions by thirty percent over the next decade. In technology news, a major breakthrough in quantum computing was announced today, with researchers demonstrating a system that can solve complex problems in minutes rather than years. Meanwhile, the international space station successfully completed its latest orbital adjustment, preparing for a new series of scientific experiments. In economic news, markets showed steady growth across Asia and Europe, with technology stocks leading the gains.`,
  },
  {
    title: 'Tech Industry Weekly Roundup',
    source: 'NPR · Technology',
    duration: '2:30',
    difficulty: 'B2',
    vocab: 55,
    thumb: '💻',
    category: '新闻',
    script: `This week in technology, several major announcements captured the industry's attention. A leading smartphone manufacturer unveiled its latest flagship device, featuring an advanced camera system and a new custom designed processor. The device promises thirty percent better battery life compared to its predecessor. In the world of electric vehicles, a startup company completed its first successful test of an autonomous delivery truck, traveling over five hundred miles without human intervention. Social media platforms continue to evolve, with new features designed to promote mental health and reduce screen time. Experts say these changes reflect a growing awareness of technology's impact on well being.`,
  },
  {
    title: 'Climate Change: What You Need to Know',
    source: 'CNN · Science',
    duration: '2:20',
    difficulty: 'C1',
    vocab: 65,
    thumb: '🌍',
    category: '新闻',
    script: `Climate scientists are warning that the window for meaningful action is rapidly closing. The latest report from the Intergovernmental Panel on Climate Change paints a stark picture. Global temperatures have already risen by one point one degrees Celsius above pre-industrial levels. If current trends continue, we could see a rise of two point seven degrees by the end of this century. The consequences would be devastating. Rising sea levels would threaten coastal cities. Extreme weather events would become more frequent and more severe. Food and water security would be compromised for billions of people. However, the report also emphasizes that solutions exist and are increasingly affordable.`,
  },
  {
    title: 'English Grammar in Context',
    source: 'Cambridge Course',
    duration: '2:15',
    difficulty: 'A2',
    vocab: 20,
    thumb: '📚',
    category: '课程',
    script: `Today, we're going to learn about the present perfect tense. The present perfect is formed with "have" or "has" plus the past participle. For example: "I have visited Paris." "She has finished her homework." We use the present perfect to talk about experiences in our life. "Have you ever tried sushi?" "I have never been to Australia." We also use it for actions that started in the past and continue now. "I have lived here for five years." "She has worked at this company since two thousand twenty." Remember: we use "for" with a period of time, and "since" with a specific point in time.`,
  },
  {
    title: 'Mastering Conditionals',
    source: 'Cambridge Course',
    duration: '2:30',
    difficulty: 'B1',
    vocab: 30,
    thumb: '📖',
    category: '课程',
    script: `Let's explore conditional sentences in English. There are four main types. The zero conditional describes things that are always true. If you heat water to one hundred degrees, it boils. The first conditional talks about possible future situations. If it rains tomorrow, I will stay home. The second conditional describes unreal or unlikely situations. If I won the lottery, I would travel the world. And the third conditional talks about unreal past situations. If I had studied harder, I would have passed the exam. Pay attention to the verb tenses in each type. Practice makes perfect, so try creating your own sentences with each conditional type.`,
  },
  {
    title: 'Business English Essentials',
    source: 'Oxford Course',
    duration: '2:40',
    difficulty: 'B2',
    vocab: 50,
    thumb: '💼',
    category: '课程',
    script: `Welcome to Business English Essentials. Today we'll practice common phrases for meetings and presentations. When starting a meeting, you might say: "Thank you all for coming. Let's get started." To present an idea: "I'd like to propose a new approach to our marketing strategy." To agree with someone: "That's an excellent point. I completely agree." To disagree politely: "I see your point, but I have a slightly different perspective." To ask for clarification: "Could you elaborate on that, please?" To summarize: "So, to sum up, we've agreed on three main action items." These phrases will help you communicate more professionally in the workplace.`,
  },
  {
    title: 'Daily English Conversation',
    source: 'Learning Podcast',
    duration: '1:45',
    difficulty: 'A2',
    vocab: 15,
    thumb: '💬',
    category: '学习',
    script: `Let's practice some everyday English conversations. Imagine you're at a coffee shop. "Hi, can I get a large latte, please?" "Sure! Would you like that hot or iced?" "Iced, please. And can I add an extra shot of espresso?" "Of course. That will be five dollars and fifty cents." "Here you go. Thank you!" Now let's try ordering food at a restaurant. "Good evening. I'd like to see the menu, please." "Here you are. Our special today is grilled salmon with vegetables." "That sounds great. I'll have the salmon, please." "Excellent choice. Would you like anything to drink?"`,
  },
  {
    title: 'Travel English: At the Airport',
    source: 'Learning Podcast',
    duration: '2:00',
    difficulty: 'A2',
    vocab: 25,
    thumb: '✈️',
    category: '学习',
    script: `Today we'll practice English for traveling by air. At the check-in counter: "Good morning. I'd like to check in for my flight to London, please." "May I see your passport and booking confirmation?" "Here they are." "Would you like a window seat or an aisle seat?" "A window seat, please." At security: "Please remove your laptop from your bag and place it in the tray." "Do I need to take off my shoes?" "Yes, please." At the gate: "Excuse me, is this the gate for flight BA two four seven to London?" "Yes, boarding will begin in about twenty minutes." "Thank you." These simple phrases will help you navigate any airport with confidence.`,
  },
  {
    title: 'Idioms and Expressions',
    source: 'Learning Podcast',
    duration: '2:10',
    difficulty: 'B1',
    vocab: 35,
    thumb: '🗣️',
    category: '学习',
    script: `English is full of colorful idioms and expressions. Let's learn some common ones today. "Break a leg" means good luck. You might say this before someone gives a presentation. "Hit the nail on the head" means to describe exactly what is causing a situation or problem. "A piece of cake" means something is very easy. "Under the weather" means feeling sick or ill. "The ball is in your court" means it's your turn to make a decision. "Burning the midnight oil" means working very late into the night. "Let the cat out of the bag" means to reveal a secret accidentally. Try using these expressions in your daily conversations to sound more natural and fluent.`,
  },
  {
    title: 'Science Friday Highlights',
    source: 'NPR',
    duration: '3:00',
    difficulty: 'C1',
    vocab: 78,
    thumb: '🔬',
    category: '推荐',
    script: `Scientists have made a remarkable discovery in the field of marine biology. Deep beneath the ocean surface, in hydrothermal vents where temperatures exceed three hundred degrees Celsius, researchers have found microorganisms that defy our understanding of life. These extremophiles, as they're called, thrive in conditions that would instantly destroy most known life forms. What makes this discovery particularly fascinating is the implications for astrobiology. If life can exist in such extreme conditions on Earth, it dramatically increases the probability of finding life elsewhere in our solar system. Europa, one of Jupiter's moons, has a subsurface ocean that may have similar hydrothermal conditions. This finding has reinvigorated the scientific community's interest in sending probes to these distant worlds.`,
  },
  {
    title: 'The Art of Public Speaking',
    source: 'TED-Ed · Lesson',
    duration: '2:45',
    difficulty: 'B2',
    vocab: 52,
    thumb: '🎙️',
    category: '推荐',
    script: `Public speaking is consistently ranked as one of the most common fears. But here's a secret: even the best speakers in the world get nervous. The difference is in how they channel that energy. First, know your material inside and out. Preparation breeds confidence. Second, start with a hook. Ask a question, tell a story, or share a surprising statistic. Third, make eye contact with individuals in the audience, not just the back wall. Fourth, use pauses effectively. A well-timed pause can be more powerful than words. Fifth, practice your body language. Stand tall, use open gestures, and move with purpose. Remember, your audience wants you to succeed. They are on your side from the moment you begin speaking.`,
  },
]

export default function ListenGoPage() {
  const navigate = useNavigate()
  const [activeCategory, setActiveCategory] = useState('推荐')

  // ===== 当前选中播放的内容索引 =====
  const [activeContentIndex, setActiveContentIndex] = useState(0)

  // ===== 使用音频播放器 Hook =====
  const player = useAudioPlayer()

  // ===== 首次加载时只加载内容（不自动播放） =====
  useEffect(() => {
    const content = contentList[activeContentIndex]
    if (content) {
      const segments: AudioSegment[] = textToSegments(content.script)
      player.loadContent(segments)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ===== 退出页面时自动停止播放 =====
  useEffect(() => {
    return () => {
      // 组件卸载时停止 TTS
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  // ===== 当前播放的内容 =====
  const currentContent = contentList[activeContentIndex]

  // ===== 过滤内容列表 =====
  const filteredList = activeCategory === '推荐'
    ? contentList
    : contentList.filter(c => c.category === activeCategory)

  // ===== 点击内容列表项 → 切换播放 =====
  const handleSelectContent = (globalIndex: number) => {
    if (globalIndex === activeContentIndex) {
      // 点击当前正在播放的内容 → 切换播放/暂停
      if (player.isPlaying) {
        player.pause()
      } else {
        player.play()
      }
    } else {
      // 切换到新内容 → 自动开始播放
      setActiveContentIndex(globalIndex)
      const content = contentList[globalIndex]
      if (content) {
        const segments: AudioSegment[] = textToSegments(content.script)
        player.loadAndPlay(segments) // 加载并自动播放
      }
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
      {/* ===== Header ===== */}
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={() => { player.stop(); navigate(-1) }} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">随行听</h1>
      </div>

      {/* ===== 正在播放卡片 ===== */}
      <div className="mx-5 mb-4 p-4 rounded-[var(--radius-md)] text-white"
        style={{ background: 'linear-gradient(135deg, #3B82F6, #6366F1)' }}>
        <p className="text-[11px] text-white/70 mb-1">
          {player.isPlaying ? '正在播放' : '已暂停'}
        </p>
        <h3 className="text-[16px] font-bold mb-1">{currentContent.title}</h3>
        <p className="text-[12px] text-white/80 mb-3">{currentContent.source}</p>

        {/* 当前朗读的句子预览 */}
        {player.totalSegments > 0 && (
          <p className="text-[11px] text-white/60 mb-2 line-clamp-1 italic">
            "{player.currentIndex < player.totalSegments
              ? contentList[activeContentIndex].script
                  .split(/(?<=[.!?。！？])\s+/)[player.currentIndex] || ''
              : '播放完毕'
            }"
          </p>
        )}

        {/* 进度条 */}
        <div className="h-1 bg-white/20 rounded-full mb-2">
          <div
            className="h-full bg-white rounded-full transition-all duration-300"
            style={{ width: `${player.progress}%` }}
          />
        </div>

        {/* 时间 & 控制按钮 */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/60">
            {player.formatTime(player.elapsedTime)} / {player.formatTime(player.totalDuration)}
          </span>
          <div className="flex items-center gap-4">
            {/* 上一句 */}
            <button onClick={player.prev} className="active:scale-90 transition-transform">
              <SkipBack size={18} className="text-white/80" />
            </button>
            {/* 播放/暂停 */}
            <button
              onClick={() => player.isPlaying ? player.pause() : player.play()}
              className="active:scale-90 transition-transform"
            >
              {player.isPlaying
                ? <Pause size={22} className="text-white" />
                : <Play size={22} className="text-white" />
              }
            </button>
            {/* 下一句 */}
            <button onClick={player.next} className="active:scale-90 transition-transform">
              <SkipForward size={18} className="text-white/80" />
            </button>
            {/* 停止 */}
            <button
              onClick={player.stop}
              className="active:scale-90 transition-transform"
            >
              {player.isPlaying
                ? <Volume2 size={18} className="text-white/80" />
                : <VolumeX size={18} className="text-white/40" />
              }
            </button>
          </div>
        </div>
      </div>

      {/* ===== 分类标签 ===== */}
      <div className="flex items-center gap-2 px-5 mb-4 overflow-x-auto">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors shrink-0 ${
              activeCategory === cat
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-background-secondary)] text-[var(--color-muted)]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* ===== 内容列表 ===== */}
      <div className="flex-1 overflow-y-auto px-5 pb-8">
        <div className="space-y-2">
          {filteredList.map((item) => {
            // 找到该 item 在 contentList 中的全局索引
            const globalIndex = contentList.indexOf(item)
            const isActive = globalIndex === activeContentIndex

            return (
              <div
                key={globalIndex}
                onClick={() => handleSelectContent(globalIndex)}
                className={`flex items-center gap-3 p-3 rounded-[var(--radius-sm)] cursor-pointer active:bg-[var(--color-background-secondary)] transition-colors ${
                  isActive
                    ? 'bg-[var(--color-primary-light)] border border-[var(--color-primary)]/20'
                    : 'bg-[var(--color-card)]'
                }`}
                style={{ boxShadow: 'var(--shadow-card)' }}
              >
                {/* 缩略图 / 播放状态 */}
                <div className={`w-12 h-12 rounded-[10px] flex items-center justify-center shrink-0 ${
                  isActive ? 'bg-[var(--color-primary)]/20' : 'bg-[var(--color-primary-light)]'
                }`}>
                  {isActive && player.isPlaying ? (
                    <Pause size={20} className="text-[var(--color-primary)]" />
                  ) : isActive ? (
                    <Play size={20} className="text-[var(--color-primary)]" />
                  ) : (
                    <span className="text-[20px]">{item.thumb}</span>
                  )}
                </div>
                {/* 信息 */}
                <div className="flex-1 min-w-0">
                  <p className={`text-[14px] font-semibold line-clamp-1 ${
                    isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-foreground)]'
                  }`}>{item.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-[var(--color-muted)]">{item.source}</span>
                    <span className="text-[11px] text-[var(--color-muted)]">·</span>
                    <span className="text-[11px] text-[var(--color-muted)]">{item.duration}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] px-1.5 py-0.5 bg-[var(--color-background-secondary)] rounded text-[var(--color-muted)]">
                      {item.difficulty}
                    </span>
                    <span className="text-[10px] text-[var(--color-muted)]">{item.vocab} 词汇</span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-[var(--color-muted)] shrink-0" />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
