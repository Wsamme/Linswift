import type { ListeningContent } from '../lib/supabase'

export interface ListeningContentItem extends ListeningContent {
  source_label?: string
}

const BUILT_IN_LISTENING_CONTENT: ListeningContentItem[] = [
  {
    id: -101,
    title: 'Morning Focus: Start Your Day in English',
    category: 'study',
    audio_url: null,
    thumbnail_url: null,
    duration_seconds: 165,
    difficulty: 'beginner',
    vocabulary_count: 18,
    transcript: `Good morning and welcome back to your English routine. Today we begin with a simple idea: consistency is more important than intensity. If you study for twenty focused minutes every day, your brain will remember more than if you study for three hours once a week. Start by listening for key phrases, then repeat the sentence out loud. When you hear a new expression, connect it to your real life. English becomes easier when it is attached to a daily action, a real object, or a personal memory. Keep your notebook nearby, mark one useful phrase, and use it before the day ends.`,
    created_at: '2026-03-22T00:00:00.000Z',
  },
  {
    id: -102,
    title: 'Campus News Brief: Student Makers Fair Opens',
    category: 'news',
    audio_url: null,
    thumbnail_url: null,
    duration_seconds: 180,
    difficulty: 'intermediate',
    vocabulary_count: 22,
    transcript: `Good afternoon. The annual Student Makers Fair opened today at Riverside University with more than one hundred projects on display. Visitors explored robotics prototypes, sustainability tools, and language learning apps designed by student teams from eight departments. Organizers say the fair has become one of the most popular events on campus because it connects classroom ideas with real-world problems. This year, a low-cost smart pen for pronunciation training received the highest attention from visitors. The exhibition will remain open until Friday, and students are encouraged to vote for the most practical invention before the final awards ceremony.`,
    created_at: '2026-03-22T00:00:00.000Z',
  },
  {
    id: -103,
    title: 'TED-style Talk: Why Small Habits Win',
    category: 'ted',
    audio_url: null,
    thumbnail_url: null,
    duration_seconds: 215,
    difficulty: 'intermediate',
    vocabulary_count: 26,
    transcript: `People often believe that change begins with a dramatic decision, but in reality it usually begins with a repeatable habit. A habit is powerful because it lowers the cost of action. You do not need fresh motivation every morning if your behavior is already built into your environment. If your book is open on your desk, if your headphones are charged, and if your notebook is within reach, starting becomes easier than postponing. The same logic applies to language learning. Fluency is not the reward for one brilliant week. It is the result of hundreds of ordinary sessions that looked too small to matter on their own.`,
    created_at: '2026-03-22T00:00:00.000Z',
  },
  {
    id: -104,
    title: 'Course Clip: How to Shadow an English Sentence',
    category: 'course',
    audio_url: null,
    thumbnail_url: null,
    duration_seconds: 190,
    difficulty: 'beginner',
    vocabulary_count: 20,
    transcript: `Shadowing is one of the fastest ways to improve listening and speaking together. First, listen to one short sentence without reading the text. Second, play the sentence again and try to repeat it at the same time as the speaker. Third, notice where your speech breaks or slows down. Usually the problem is not one difficult word. It is the rhythm of the whole sentence. Finally, repeat the same sentence three more times until your voice becomes smoother. The goal is not to sound perfect immediately. The goal is to train your ear to predict the next sound and your mouth to follow it with less hesitation.`,
    created_at: '2026-03-22T00:00:00.000Z',
  },
  {
    id: -105,
    title: 'Story Listening: The Library Card',
    category: 'study',
    audio_url: null,
    thumbnail_url: null,
    duration_seconds: 205,
    difficulty: 'beginner',
    vocabulary_count: 21,
    transcript: `On the first Monday of spring, Nina walked into the city library and asked for a card. She had passed the building many times but had never entered it before. The librarian smiled and showed her a quiet corner filled with graded readers and audio stations. Nina borrowed one short book and promised herself that she would read ten pages a night. A week later, she returned for another book and realized something had changed. She was no longer translating every sentence in her head. She was beginning to understand the story directly, and that small moment gave her the confidence to keep going.`,
    created_at: '2026-03-22T00:00:00.000Z',
  },
  {
    id: -106,
    title: 'News Analysis: Cities Expand Public Reading Spaces',
    category: 'news',
    audio_url: null,
    thumbnail_url: null,
    duration_seconds: 210,
    difficulty: 'intermediate',
    vocabulary_count: 25,
    transcript: `Several cities across Asia are expanding public reading spaces as part of broader education policies. Officials say the new plan is not limited to adding bookshelves. It also includes quiet audio booths, mobile libraries, and digital reading stations for commuters. Education researchers support the move because reading behavior often depends on environment rather than intention alone. When books and audio materials become visible in daily life, more people form a regular learning habit. Early reports suggest that communities with these reading spaces are seeing stronger participation from students, working adults, and older learners who previously felt excluded from formal study programs.`,
    created_at: '2026-03-22T00:00:00.000Z',
  },
  {
    id: -107,
    title: 'TED-style Talk: Learning in Public',
    category: 'ted',
    audio_url: null,
    thumbnail_url: null,
    duration_seconds: 220,
    difficulty: 'advanced',
    vocabulary_count: 28,
    transcript: `One of the quiet advantages of learning in public is accountability. When your effort becomes visible, even in a small way, your identity begins to shift. You stop thinking of yourself as someone who wants to improve and start acting like someone who is already in motion. This is why study groups, public reading logs, and shared practice sessions matter. They create evidence. Evidence changes belief, and belief changes future behavior. In language learning, public effort does not mean showing off. It means building a social structure that makes consistency easier to protect when motivation naturally rises and falls.`,
    created_at: '2026-03-22T00:00:00.000Z',
  },
  {
    id: -108,
    title: 'Course Clip: Listening for Signal Words',
    category: 'course',
    audio_url: null,
    thumbnail_url: null,
    duration_seconds: 175,
    difficulty: 'beginner',
    vocabulary_count: 17,
    transcript: `When you listen to longer English passages, signal words help you predict what will come next. Words like first, however, because, for example, and finally show the structure of the speaker's ideas. If you train your ear to notice these signals, you do not need to understand every word immediately. You can still follow the logic of the message. A useful exercise is to listen once for the main idea, then listen again and write down only the signal words you hear. After that, try to retell the passage using those words as a map.`,
    created_at: '2026-03-22T00:00:00.000Z',
  },
  {
    id: -109,
    title: 'Greensleeves',
    category: 'music',
    audio_url: null,
    thumbnail_url: null,
    duration_seconds: 150,
    difficulty: 'beginner',
    vocabulary_count: 12,
    transcript: `Alas, my love, you do me wrong, to cast me off discourteously. For I have loved you well and long, delighting in your company. Greensleeves was all my joy, Greensleeves was my delight. Greensleeves was my heart of gold, and who but my lady Greensleeves.`,
    created_at: '2026-03-22T00:00:00.000Z',
  },
  {
    id: -110,
    title: 'Amazing Grace',
    category: 'music',
    audio_url: null,
    thumbnail_url: null,
    duration_seconds: 145,
    difficulty: 'beginner',
    vocabulary_count: 13,
    transcript: `Amazing grace, how sweet the sound, that saved a wretch like me. I once was lost, but now am found, was blind, but now I see. Through many dangers, toils, and snares, I have already come. Tis grace hath brought me safe thus far, and grace will lead me home.`,
    created_at: '2026-03-22T00:00:00.000Z',
  },
]

export function getBuiltInListeningContent(): ListeningContentItem[] {
  return BUILT_IN_LISTENING_CONTENT.map((item) => ({ ...item }))
}

export function mergeListeningContent(
  remote: ListeningContent[] | null | undefined,
  options?: { categories?: Array<ListeningContent['category']> }
): ListeningContentItem[] {
  const categorySet = options?.categories ? new Set(options.categories) : null
  const builtIn = getBuiltInListeningContent().filter((item) => (categorySet ? categorySet.has(item.category) : true))
  const incoming = (remote || []).filter((item) => (categorySet ? categorySet.has(item.category) : true))

  const seen = new Set<string>()
  const normalized: ListeningContentItem[] = []

  for (const item of [...incoming, ...builtIn]) {
    const key = `${item.category}:${item.title.trim().toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push({
      ...item,
      transcript: item.transcript || item.title,
      source_label: item.id > 0 ? 'cloud' : 'built-in',
    })
  }

  return normalized
}

export function getListeningBadge(item: ListeningContentItem): string {
  if (item.category === 'music') return '歌词训练'
  if (item.category === 'ted') return 'TED 风格'
  if (item.category === 'news') return '资讯精听'
  if (item.category === 'course') return '课程讲解'
  return '学习素材'
}
