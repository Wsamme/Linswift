import type {
  GrammarExercise,
  GrammarExample,
  GrammarNodeBlueprint,
  GrammarUnit,
  GrammarWorkshop,
} from '../lib/grammar'

interface GrammarSeed {
  nodeId: string
  level: string
  cluster: string
  summary: string
  prerequisiteNodeIds: string[]
  formulas: string[]
  scenarios: string[]
  contrasts: string[]
  mistakes: string[]
  errorTags: string[]
  examples: GrammarExample[]
  exercises: GrammarExercise[]
  workshops: GrammarWorkshop[]
  longSentenceReadingIds: string[]
}

function choice(
  id: string,
  title: string,
  prompt: string,
  options: string[],
  answerIndex: number,
  explanation: string,
  errorTag: string,
  required = true,
): GrammarExercise {
  return { id, type: 'choice', title, prompt, options, answerIndex, explanation, errorTag, required }
}

function cloze(
  id: string,
  title: string,
  prompt: string,
  acceptedAnswers: string[],
  explanation: string,
  errorTag: string,
  placeholder = '请输入答案',
  required = true,
): GrammarExercise {
  return { id, type: 'cloze', title, prompt, acceptedAnswers, explanation, errorTag, placeholder, required }
}

function correction(
  id: string,
  title: string,
  prompt: string,
  sourceSentence: string,
  acceptedAnswers: string[],
  explanation: string,
  errorTag: string,
  required = true,
): GrammarExercise {
  return { id, type: 'correction', title, prompt, sourceSentence, acceptedAnswers, explanation, errorTag, required }
}

function rewrite(
  id: string,
  title: string,
  prompt: string,
  sampleAnswer: string,
  checklist: string[],
  errorTag: string,
  hint?: string,
): GrammarExercise {
  return { id, type: 'rewrite', title, prompt, sampleAnswer, checklist, errorTag, hint, required: false }
}

function example(id: string, sentence: string, translation: string, note: string, linkedReadingId?: string): GrammarExample {
  return {
    id,
    sentence,
    translation,
    note,
    sourceType: linkedReadingId ? 'reader' : 'core',
    linkedReadingId,
  }
}

function workshop(id: string, title: string, prompt: string, checklist: string[]): GrammarWorkshop {
  return { id, title, prompt, checklist }
}

function buildUnits(seed: GrammarSeed): GrammarUnit[] {
  return [
    {
      id: `${seed.nodeId}-unit-form`,
      title: '规则骨架',
      objective: '先把这个语法点的形式和句法位置看清楚。',
      formula: seed.formulas.slice(0, 3),
      scenarios: seed.scenarios.slice(0, 2),
      contrast: seed.contrasts.slice(0, 1),
      commonMistakes: seed.mistakes.slice(0, 2),
      errorTags: seed.errorTags.slice(0, 2),
    },
    {
      id: `${seed.nodeId}-unit-contrast`,
      title: '场景辨析',
      objective: '知道什么时候该用它，什么时候不该用它。',
      formula: seed.formulas.slice(1, 4),
      scenarios: seed.scenarios.slice(1, 3),
      contrast: seed.contrasts.slice(0, 2),
      commonMistakes: seed.mistakes.slice(1, 3),
      errorTags: seed.errorTags.slice(0, 2),
    },
    {
      id: `${seed.nodeId}-unit-repair`,
      title: '易错修正',
      objective: '把高频错误和输出动作绑定起来，形成复习抓手。',
      formula: seed.formulas.slice(-2),
      scenarios: seed.scenarios.slice(-2),
      contrast: seed.contrasts.slice(-2),
      commonMistakes: seed.mistakes.slice(-3),
      errorTags: seed.errorTags,
    },
  ]
}

const grammarSeeds: GrammarSeed[] = [
  {
    nodeId: 'grammar-a1-sentence-forms',
    level: 'A1',
    cluster: '句子骨架',
    summary: '先固定英语基本句序，再练肯定、否定和一般疑问句三种句型切换。',
    prerequisiteNodeIds: [],
    formulas: ['肯定句：S + V + O', '否定句：S + do/does not + V', '一般疑问：Do/Does + S + V ?', '特殊疑问：Wh- + do/does + S + V ?'],
    scenarios: ['描述事实和习惯', '提出一般问题', '在完整句中表达否定'],
    contrasts: ['英语主要靠语序和助动词表达句型变化，不像中文只改语气。', '问句和否定句都不能直接堆原形动词。'],
    mistakes: ['忘记补主语，直接写动词。', '否定句把 not 直接放在实义动词后。', '一般疑问句不加 do/does。'],
    errorTags: ['sentence_form', 'word_order'],
    examples: [
      example('sf-1', 'She reads the report every morning.', '她每天早上都读这份报告。', '先确认主语、谓语、宾语顺序。'),
      example('sf-2', 'Do they need a new plan?', '他们需要一个新方案吗？', '问句里先出助动词再出主语。'),
    ],
    exercises: [
      choice('sf-e1', '识别正确语序', '哪一句语序正确？', ['Reads she the report.', 'She reads the report.', 'She the report reads.', 'Read she report.'], 1, '英语基本陈述句通常是主语在前，谓语在中，宾语在后。', 'word_order'),
      choice('sf-e2', '否定句骨架', '下列哪个是否定句？', ['She not likes tea.', 'She does not like tea.', 'Does she not likes tea.', 'She no like tea.'], 1, '一般现在时否定句用 does not + 动词原形。', 'sentence_form'),
      cloze('sf-e3', '补助动词', '____ you like reading before bed?', ['Do'], '一般疑问句需要 do/does 引导。', 'sentence_form'),
      correction('sf-e4', '修正病句', '把下面句子改对。', 'She not go to school on Sundays.', ['She does not go to school on Sundays.'], '第三人称单数否定句需要 does not，动词回到原形。', 'sentence_form'),
      rewrite('sf-e5', '输出练习', '用“Do ... ?”写一个关于 daily routine 的问题。', 'Do you check your email before breakfast?', ['Do', 'you', 'before'], 'sentence_form', '至少包含一个日常动作和一个时间状语。'),
    ],
    workshops: [
      workshop('sf-w1', '句型切换', '把一个肯定句改成否定句和一般疑问句。', ['保留主语', '补 do/does', '实义动词回原形']),
    ],
    longSentenceReadingIds: ['reading-01'],
  },
  {
    nodeId: 'grammar-a1-be-therebe',
    level: 'A1',
    cluster: '句子骨架',
    summary: '把 be 动词和 there be 分开记，先判断是在描述状态，还是在引出“有/存在”。',
    prerequisiteNodeIds: ['grammar-a1-sentence-forms'],
    formulas: ['I am / You are / He is', 'There is + 单数名词', 'There are + 复数名词', 'There is no / There are no ...'],
    scenarios: ['介绍人或物的状态', '说明某处有什么', '表达某物不存在'],
    contrasts: ['be 动词连接主语和表语；there be 用来引出存在。', 'there be 后的动词要和后面的真正主语保持一致。'],
    mistakes: ['There have many books. 受中文“有”干扰。', 'there is / there are 跟名词数不一致。', 'be 动词和实义动词同时乱用。'],
    errorTags: ['be_verb', 'there_be'],
    examples: [
      example('be-1', 'There are three books on the desk.', '桌子上有三本书。', '先看后面的真正主语 three books。'),
      example('be-2', 'She is ready for the interview.', '她已经准备好面试了。', 'be 动词后接形容词表状态。'),
    ],
    exercises: [
      choice('be-e1', '识别存在句', '哪一句在表达“某处有某物”？', ['She is in the room.', 'There is a lamp by the bed.', 'The lamp is bright.', 'They are late.'], 1, '只有 there is/are 结构是在引出存在。', 'there_be'),
      choice('be-e2', '主谓一致', 'There ____ two emails in your inbox.', ['is', 'are', 'be', 'was'], 1, '真正主语是 two emails，应用 are。', 'there_be'),
      cloze('be-e3', '补 be 动词', 'My parents ____ at home now.', ['are'], '复数主语用 are。', 'be_verb'),
      correction('be-e4', '修正中式英语', '把下面句子改对。', 'There have many students in the library.', ['There are many students in the library.'], '存在句要用 there are，而不是 there have。', 'there_be'),
      rewrite('be-e5', '输出练习', '用 there is / there are 写一句描述你桌面的句子。', 'There is a notebook next to my keyboard.', ['There', 'is', 'next to'], 'there_be'),
    ],
    workshops: [
      workshop('be-w1', '存在句扫描', '观察一段房间描写，标出哪些句子应该用 there be。', ['先找“某处有……”', '再判断单复数', '最后检查介词位置']),
    ],
    longSentenceReadingIds: ['reading-05'],
  },
  {
    nodeId: 'grammar-a1-pronouns',
    level: 'A1',
    cluster: '代词与名词',
    summary: '先把主格、宾格、物主和指示代词分清，再去做代词替换。',
    prerequisiteNodeIds: ['grammar-a1-sentence-forms'],
    formulas: ['主格：I / you / he / she / they', '宾格：me / you / him / her / them', '物主形容词：my / your / his / her / their', '指示代词：this / that / these / those'],
    scenarios: ['避免重复名词', '说明“谁的”', '指向近处和远处事物'],
    contrasts: ['主格做主语，宾格通常跟在动词或介词后。', '物主形容词后面通常要接名词。'],
    mistakes: ['把 me 当主语用。', 'this/these 和 that/those 的单复数混乱。', 'his/him 混用。'],
    errorTags: ['pronoun_case', 'word_order'],
    examples: [
      example('pro-1', 'They told her the news after class.', '他们下课后告诉了她这个消息。', '主格 they，宾格 her。'),
      example('pro-2', 'These books are mine.', '这些书是我的。', 'these 对应复数名词。'),
    ],
    exercises: [
      choice('pro-e1', '主宾格选择', '哪一句代词形式正确？', ['Me like this song.', 'Her called me yesterday.', 'They invited him to dinner.', 'Us are ready.'], 2, 'They 作主语，him 作宾语，形式都正确。', 'pronoun_case'),
      choice('pro-e2', '指示代词', '远处的复数物品应该用哪个？', ['this', 'that', 'these', 'those'], 3, 'those 表远处复数。', 'pronoun_case'),
      cloze('pro-e3', '补物主形容词', 'This is ____ notebook, not mine.', ['your'], '修饰 notebook 要用物主形容词。', 'pronoun_case'),
      correction('pro-e4', '修正病句', '把下面句子改对。', 'Him is my best friend.', ['He is my best friend.'], '作主语时要用主格 he。', 'pronoun_case'),
      rewrite('pro-e5', '输出练习', '用 these / those 造一个比较句。', 'Those shoes are cheaper than these ones.', ['Those', 'these'], 'pronoun_case'),
    ],
    workshops: [
      workshop('pro-w1', '代词替换', '把一段重复使用名词的短文改写得更自然。', ['找重复名词', '判断主语还是宾语', '检查单复数']),
    ],
    longSentenceReadingIds: ['reading-02'],
  },
  {
    nodeId: 'grammar-a1-articles-nouns',
    level: 'A1',
    cluster: '代词与名词',
    summary: '冠词和名词数是一组问题，要一起练，不要分开背。',
    prerequisiteNodeIds: ['grammar-a1-pronouns'],
    formulas: ['a/an + 单数可数名词', 'the + 特指名词', '零冠词 + 不可数/复数泛指', '可数名词单数通常不能裸奔'],
    scenarios: ['第一次提到某物', '已经知道或唯一的事物', '谈抽象概念和泛指类别'],
    contrasts: ['a/an 是“一个、某个”，the 是“说的就是这个”。', '不可数名词通常不直接加复数 s。'],
    mistakes: ['单数可数名词前漏冠词。', 'information, advice 等不可数名词乱加 s。', '第一次提到就直接用 the。'],
    errorTags: ['article', 'noun_number'],
    examples: [
      example('art-1', 'I bought a notebook and the notebook is already full.', '我买了一个笔记本，而那个笔记本已经写满了。', '第一次 a，第二次 the。'),
      example('art-2', 'She gave me useful advice.', '她给了我有用的建议。', 'advice 不可数。'),
    ],
    exercises: [
      choice('art-e1', '冠词选择', '第一次提到单数可数名词时通常用：', ['the', 'a/an', '零冠词', '所有格'], 1, '第一次提到、听者尚未锁定时通常用 a/an。', 'article'),
      choice('art-e2', '不可数名词', '哪一个通常是不可数名词？', ['books', 'chairs', 'advice', 'apples'], 2, 'advice 通常不可数。', 'noun_number'),
      cloze('art-e3', '补冠词', 'She is reading ____ interesting article.', ['an'], 'interesting 以元音音素开头，用 an。', 'article'),
      correction('art-e4', '修正名词数', '把下面句子改对。', 'He gave me many useful advices.', ['He gave me a lot of useful advice.', 'He gave me much useful advice.'], 'advice 不可数，不能直接加复数 s。', 'noun_number'),
      rewrite('art-e5', '输出练习', '写一句包含第一次提到和再次提到同一个物品的句子。', 'I saw a movie yesterday, and the movie was surprisingly good.', ['a', 'the'], 'article'),
    ],
    workshops: [
      workshop('art-w1', '冠词标记', '阅读一段短文，圈出每个名词前为什么用 a/an、the 或零冠词。', ['先判断是否第一次出现', '再判断是否特指', '再判断是否可数']),
    ],
    longSentenceReadingIds: ['reading-07'],
  },
  {
    nodeId: 'grammar-a1-quantifiers',
    level: 'A1',
    cluster: '代词与名词',
    summary: '数量词的关键不是背单词，而是先判断名词可数性，再判断肯定、否定和疑问语境。',
    prerequisiteNodeIds: ['grammar-a1-articles-nouns'],
    formulas: ['many + 可数复数', 'much + 不可数名词', 'some 常见于肯定句', 'any 常见于否定句和疑问句'],
    scenarios: ['问数量', '表达“有一些/没有”', '礼貌请求中用 some'],
    contrasts: ['many / few 对应可数名词；much / little 对应不可数名词。', 'some 虽多见于肯定句，但在建议和请求里也常见。'],
    mistakes: ['much books / many water 这种错配。', '否定句还用 some。', 'few / a few 语气差异没意识到。'],
    errorTags: ['quantifier', 'noun_number'],
    examples: [
      example('quan-1', 'How much time do we have before the class starts?', '上课前我们还有多少时间？', 'time 在这里不可数。'),
      example('quan-2', 'There are only a few seats left.', '只剩下几个座位了。', 'a few 表示“有几个”，不是几乎没有。'),
    ],
    exercises: [
      choice('quan-e1', '数量词匹配', '哪组搭配正确？', ['much books', 'many chairs', 'many milk', 'much students'], 1, 'chairs 可数复数，对应 many。', 'quantifier'),
      choice('quan-e2', '否定句选择', 'We do not have ____ sugar left.', ['some', 'many', 'any', 'few'], 2, '否定句里常用 any。', 'quantifier'),
      cloze('quan-e3', '补数量词', 'There are only ____ minutes before the meeting.', ['a few', 'few'], 'minutes 可数复数；这里表示“还有几个”，a few 更自然。', 'quantifier'),
      correction('quan-e4', '修正病句', '把下面句子改对。', 'I do not have some money with me.', ['I do not have any money with me.'], '否定句里通常用 any。', 'quantifier'),
      rewrite('quan-e5', '输出练习', '写一句包含 how much 或 how many 的问题。', 'How many pages did you finish today?', ['How', 'many'], 'quantifier'),
    ],
    workshops: [
      workshop('quan-w1', '可数性判断', '把一列名词分成可数和不可数，再给它们匹配数量词。', ['先判断可数性', '再判断单复数', '最后套数量词']),
    ],
    longSentenceReadingIds: ['reading-09'],
  },
  {
    nodeId: 'grammar-a1-prep-time-place',
    level: 'A1',
    cluster: '介词与语序',
    summary: '时间地点介词最怕中文直译，要把时间粒度和空间层级拆开记。',
    prerequisiteNodeIds: ['grammar-a1-quantifiers'],
    formulas: ['at + 时间点/具体点位', 'on + 日期/具体某天/表面', 'in + 月份/年份/大范围空间', 'to/from + 方向起止'],
    scenarios: ['说时间', '描述地点', '表达移动方向'],
    contrasts: ['at 最小，on 居中，in 最大。', 'in the room / on the wall / at the station 的空间层级不同。'],
    mistakes: ['in Monday、at the wall 之类的中文迁移。', 'arrive to home 这种搭配错误。', '把时间介词和地点介词混用。'],
    errorTags: ['preposition'],
    examples: [
      example('prep-1', 'We have class at nine on Monday in March.', '我们三月的一个周一九点上课。', '同一句里可以出现不同层级的时间介词。'),
      example('prep-2', 'The picture is on the wall in the living room.', '那幅画在客厅的墙上。', '先说接触面，再说更大的空间。'),
    ],
    exercises: [
      choice('prep-e1', '时间介词', '____ Friday evening', ['in', 'on', 'at', 'from'], 1, '具体某一天或某天的晚上用 on。', 'preposition'),
      choice('prep-e2', '地点介词', 'The keys are ____ the table.', ['on', 'in', 'at', 'to'], 0, '物体在表面上通常用 on。', 'preposition'),
      cloze('prep-e3', '补介词', 'She arrived ____ the station before noon.', ['at'], 'arrive at 常接较小地点，如 station。', 'preposition'),
      correction('prep-e4', '修正病句', '把下面句子改对。', 'We will meet in Monday morning.', ['We will meet on Monday morning.'], '具体某天上午用 on。', 'preposition'),
      rewrite('prep-e5', '输出练习', '写一句同时包含时间和地点介词的句子。', 'I will study in the library at seven tonight.', ['in', 'at'], 'preposition'),
    ],
    workshops: [
      workshop('prep-w1', '粒度判断', '把时间表达按“点/天/月年”分层，再给每层匹配介词。', ['时间点', '具体某天', '月份年份']),
    ],
    longSentenceReadingIds: ['reading-05'],
  },
  {
    nodeId: 'grammar-a2-present-simple',
    level: 'A2',
    cluster: '核心时态',
    summary: '一般现在时不是“现在正在发生”，而是习惯、事实和稳定状态。',
    prerequisiteNodeIds: ['grammar-a1-sentence-forms'],
    formulas: ['I/You/They + 动词原形', 'He/She/It + 动词-s/-es', 'do/does + not + 动词原形', '频率副词常放在实义动词前'],
    scenarios: ['描述习惯动作', '陈述客观事实', '写流程和说明书'],
    contrasts: ['和现在进行时对比：现在进行时强调正在发生。', '频率副词不要和进行时乱混。'],
    mistakes: ['第三人称单数忘加 s。', '把 now 和一般现在时混用。', '否定句里保留三单 s。'],
    errorTags: ['tense', 'word_order'],
    examples: [
      example('ps-1', 'He usually checks the figures before the meeting.', '他通常会在会议前检查数字。', '频率副词 usually 放在实义动词前。'),
      example('ps-2', 'Water boils at 100 degrees Celsius.', '水在 100 摄氏度沸腾。', '客观事实也用一般现在时。'),
    ],
    exercises: [
      choice('ps-e1', '三单识别', '哪一句正确？', ['She go to work by bus.', 'She goes to work by bus.', 'She going to work by bus.', 'She is go to work by bus.'], 1, '第三人称单数主语后，实义动词一般加 -s/-es。', 'tense'),
      choice('ps-e2', '时态辨析', '哪种场景最适合一般现在时？', ['正在打电话', '昨天去了公司', '每周固定开会', '明天的计划'], 2, '规律、习惯和固定安排常用一般现在时。', 'tense'),
      cloze('ps-e3', '补动词', 'My brother ____ coffee every morning.', ['drinks'], '第三人称单数主语后用 drinks。', 'tense'),
      correction('ps-e4', '修正病句', '把下面句子改对。', 'He does not likes online classes.', ['He does not like online classes.'], 'does not 后面用动词原形。', 'tense'),
      rewrite('ps-e5', '输出练习', '用 always 或 usually 写一句你的习惯。', 'I usually read English news before lunch.', ['usually', 'read'], 'tense'),
    ],
    workshops: [
      workshop('ps-w1', '习惯 vs 正在发生', '同一组动词分别写成“一般现在时”和“现在进行时”两句。', ['一个表示习惯', '一个表示此刻', '检查副词或时间标志']),
    ],
    longSentenceReadingIds: ['reading-02'],
  },
  {
    nodeId: 'grammar-a2-present-continuous',
    level: 'A2',
    cluster: '核心时态',
    summary: '现在进行时主要表示此刻正在发生，或已经安排好的近期计划。',
    prerequisiteNodeIds: ['grammar-a2-present-simple'],
    formulas: ['am/is/are + V-ing', 'be not + V-ing', 'be + V-ing 可表近期安排', '时间标志：now / right now / at the moment'],
    scenarios: ['此刻动作', '临时变化', '近期明确安排'],
    contrasts: ['和一般现在时对比：一个看此刻，一个看习惯。', '静态动词一般不直接用进行时。'],
    mistakes: ['漏 be 动词。', '把 know / like 这类状态动词硬写成进行时。', 'V-ing 拼写变化错。'],
    errorTags: ['aspect', 'be_verb'],
    examples: [
      example('pc-1', 'They are waiting outside the office right now.', '他们现在正在办公室外面等。', 'right now 是典型标志。'),
      example('pc-2', 'I am meeting the client tomorrow afternoon.', '我明天下午要见客户。', '现在进行时也可表达已安排的近未来。'),
    ],
    exercises: [
      choice('pc-e1', '进行时结构', '哪一句是现在进行时？', ['She waits outside.', 'She is waiting outside.', 'She waiting outside.', 'She has waited outside.'], 1, 'be + V-ing 是现在进行时骨架。', 'aspect'),
      choice('pc-e2', '状态动词', '哪一句通常不自然？', ['I am reading now.', 'We are preparing dinner.', 'She is knowing the answer.', 'They are leaving tomorrow.'], 2, 'know 这类状态动词通常不用进行时。', 'aspect'),
      cloze('pc-e3', '补 be 动词', 'The kids ____ playing in the yard.', ['are'], '复数主语对应 are。', 'be_verb'),
      correction('pc-e4', '修正病句', '把下面句子改对。', 'He going to the station now.', ['He is going to the station now.'], '现在进行时不能省略 be 动词。', 'aspect'),
      rewrite('pc-e5', '输出练习', '写一句你现在正在做的事情。', 'I am reviewing grammar notes now.', ['am', 'now'], 'aspect'),
    ],
    workshops: [
      workshop('pc-w1', '时间标志配对', '给 now, every day, tomorrow evening 分别配合适时态写句子。', ['找时间标志', '决定进行时还是其他时态', '检查 be + V-ing']),
    ],
    longSentenceReadingIds: ['reading-05'],
  },
  {
    nodeId: 'grammar-a2-past-simple',
    level: 'A2',
    cluster: '核心时态',
    summary: '一般过去时锁定的是过去某个完成的时间点或时间段。',
    prerequisiteNodeIds: ['grammar-a2-present-simple'],
    formulas: ['规则动词：V-ed', '不规则动词：went / saw / made ...', 'did not + 动词原形', 'Did + S + V ?'],
    scenarios: ['叙述昨天发生的事', '讲过去已结束的经历', '做时间顺序描述'],
    contrasts: ['和现在完成时对比：一般过去时强调过去时间点。', 'did 之后动词回原形。'],
    mistakes: ['did 后面还保留过去式。', '不规则过去式用错。', '过去时间标志和现在完成时混用。'],
    errorTags: ['tense'],
    examples: [
      example('past-1', 'We finished the draft yesterday afternoon.', '我们昨天下午完成了草稿。', 'yesterday afternoon 锁定过去时间。'),
      example('past-2', 'Did you see the update in the group chat?', '你在群聊里看到那条更新了吗？', 'Did 引导的一般疑问句。'),
    ],
    exercises: [
      choice('past-e1', '过去式选择', '哪一句正确？', ['They did went home early.', 'They went home early.', 'They go home early yesterday.', 'They have went home early.'], 1, 'went 是 go 的过去式。', 'tense'),
      choice('past-e2', '时间标志', '哪个标志最常和一般过去时一起出现？', ['already', 'every day', 'last week', 'right now'], 2, 'last week 明确指向过去。', 'tense'),
      cloze('past-e3', '补助动词', '____ she call you after the class?', ['Did'], '一般过去时疑问句常用 Did。', 'tense'),
      correction('past-e4', '修正病句', '把下面句子改对。', 'He did not finished the task.', ['He did not finish the task.'], 'did not 后面用原形 finish。', 'tense'),
      rewrite('past-e5', '输出练习', '写一句你昨天完成的事情。', 'I revised two grammar lessons last night.', ['last', 'revised'], 'tense'),
    ],
    workshops: [
      workshop('past-w1', '时间线复述', '把今天的三件事改写成“昨天发生的三件事”。', ['全部落到过去时间', '动词改过去式', '检查 did/did not']),
    ],
    longSentenceReadingIds: ['reading-08'],
  },
  {
    nodeId: 'grammar-a2-future-forms',
    level: 'A2',
    cluster: '核心时态',
    summary: '将来表达要先判断：临时决定、已有计划还是有证据的预测。',
    prerequisiteNodeIds: ['grammar-a2-present-continuous'],
    formulas: ['will + 动词原形：临时决定/预测', 'be going to + 动词原形：计划或有根据预测', '现在进行时：已安排的近未来'],
    scenarios: ['刚刚做决定', '已经定好的安排', '看到迹象后的预测'],
    contrasts: ['will 常更即时；be going to 更像已有打算。', '近未来安排也能用现在进行时。'],
    mistakes: ['所有将来都只会用 will。', 'be going to 漏 be。', '把 timetable 类事实误当临时决定。'],
    errorTags: ['tense', 'aspect'],
    examples: [
      example('future-1', 'I will answer the email after lunch.', '我午饭后就回那封邮件。', '刚做出的决定。'),
      example('future-2', 'We are meeting the supplier next Tuesday.', '我们下周二要见供应商。', '已安排好的计划。'),
    ],
    exercises: [
      choice('future-e1', '形式辨析', '看到乌云后说“要下雨了”更自然的是：', ['It will rain every Monday.', 'It is raining.', 'It is going to rain.', 'It rains tomorrow.'], 2, '有明显迹象的预测常用 be going to。', 'aspect'),
      choice('future-e2', '安排表达', '哪一句最像已安排好的近未来？', ['I will maybe travel someday.', 'I am meeting my tutor at 3 p.m. tomorrow.', 'I go to travel tomorrow.', 'I going to travel.'], 1, '明确时间并已安排好的事可用现在进行时。', 'tense'),
      cloze('future-e3', '补动词', 'She ____ going to start a new course next month.', ['is'], 'be going to 不能漏 be。', 'aspect'),
      correction('future-e4', '修正病句', '把下面句子改对。', 'They going to visit us this weekend.', ['They are going to visit us this weekend.'], 'be going to 结构要有 are。', 'aspect'),
      rewrite('future-e5', '输出练习', '分别用 will 和 be going to 各写一句将来表达。', 'I will call you tonight. I am going to start a new notebook this weekend.', ['will', 'going to'], 'tense'),
    ],
    workshops: [
      workshop('future-w1', '意图区分', '把 4 个将来句分成“即时决定 / 已计划 / 有证据预测”。', ['先看语境', '再选形式', '注意 be 是否完整']),
    ],
    longSentenceReadingIds: ['reading-04'],
  },
  {
    nodeId: 'grammar-a2-comparatives',
    level: 'A2',
    cluster: '比较与修饰',
    summary: '比较级和最高级先看音节和不规则形式，再看 than / the 的搭配位置。',
    prerequisiteNodeIds: ['grammar-a1-articles-nouns'],
    formulas: ['短词：-er / -est', '长词：more / most', '不规则：good-better-best / bad-worse-worst', '比较级 + than'],
    scenarios: ['比较两个对象', '选出范围内最突出的一项', '说明程度变化'],
    contrasts: ['比较级是二者对比；最高级通常涉及三者或以上范围。', 'more 与 -er 不能重复叠加。'],
    mistakes: ['more easier 这种双重比较。', '最高级漏 the。', 'than 后面对象不完整。'],
    errorTags: ['comparative'],
    examples: [
      example('comp-1', 'This route is faster than the old one.', '这条路线比旧路线更快。', '二者对比用比较级。'),
      example('comp-2', 'She is the most careful student in the group.', '她是组里最细心的学生。', '范围内最高级常带 the。'),
    ],
    exercises: [
      choice('comp-e1', '比较级选择', '哪一句正确？', ['This task is more easier.', 'This task is easier than that one.', 'This task is easiest than that one.', 'This task is the more easy.'], 1, 'easier than 是正确的比较级结构。', 'comparative'),
      choice('comp-e2', '最高级判断', '三者以上比较通常用：', ['比较级', '最高级', '原级', '现在完成时'], 1, '三者及以上通常用最高级。', 'comparative'),
      cloze('comp-e3', '补形容词', 'The second plan is ____ than the first one.', ['better'], 'good 的比较级是不规则的 better。', 'comparative'),
      correction('comp-e4', '修正病句', '把下面句子改对。', 'He is most tall student in the class.', ['He is the tallest student in the class.'], '最高级常要加 the，并用 tallest。', 'comparative'),
      rewrite('comp-e5', '输出练习', '写一句比较你现在和过去学习状态的句子。', 'I am more focused now than I was last year.', ['more', 'than'], 'comparative'),
    ],
    workshops: [
      workshop('comp-w1', '比较地图', '给 5 个形容词标记“短词/长词/不规则”，再写比较级。', ['短词 -er', '长词 more', '不规则单记']),
    ],
    longSentenceReadingIds: ['reading-07'],
  },
  {
    nodeId: 'grammar-a2-adverbs-order',
    level: 'A2',
    cluster: '比较与修饰',
    summary: '副词位置和英语信息流有关，不是想放哪就放哪。',
    prerequisiteNodeIds: ['grammar-a2-present-simple'],
    formulas: ['频率副词常放实义动词前', 'be 动词后接频率副词', '方式副词常放句尾', '程度副词通常紧贴被修饰成分'],
    scenarios: ['说频率', '说明方式', '加强程度'],
    contrasts: ['always goes 和 is always late 的位置不同。', '副词位置一错，句子不一定不懂，但会很不自然。'],
    mistakes: ['She goes always late. 位置错。', '程度副词离被修饰词太远。', '句尾堆太多副词导致结构松散。'],
    errorTags: ['word_order'],
    examples: [
      example('adv-1', 'She always checks the references carefully.', '她总是认真检查参考资料。', '频率副词在实义动词前。'),
      example('adv-2', 'He is usually tired after the trip.', '他旅行后通常很累。', 'be 动词后接 usually。'),
    ],
    exercises: [
      choice('adv-e1', '频率副词位置', '哪一句更自然？', ['She checks always the file.', 'She always checks the file.', 'She checks the always file.', 'Always she checks the file.'], 1, '频率副词通常在实义动词前。', 'word_order'),
      choice('adv-e2', 'be 动词位置', '哪一句正确？', ['He usually is late.', 'He is usually late.', 'Usually he late is.', 'He late is usually.'], 1, 'be 动词后接频率副词。', 'word_order'),
      cloze('adv-e3', '补副词', 'They speak English ____ in class.', ['fluently'], '方式副词 often 放在句尾较自然。', 'word_order'),
      correction('adv-e4', '修正病句', '把下面句子改对。', 'I drink often coffee at work.', ['I often drink coffee at work.'], '实义动词前放频率副词。', 'word_order'),
      rewrite('adv-e5', '输出练习', '写一句同时包含频率副词和方式副词的句子。', 'She usually speaks very clearly in meetings.', ['usually', 'clearly'], 'word_order'),
    ],
    workshops: [
      workshop('adv-w1', '位置迁移', '把中文语序的副词句改成更自然的英语顺序。', ['先找主干', '再放频率副词', '最后安置方式副词']),
    ],
    longSentenceReadingIds: ['reading-01'],
  },
  {
    nodeId: 'grammar-b1-present-perfect',
    level: 'B1',
    cluster: '时态深化',
    summary: '现在完成时核心是“过去动作和现在有联系”，不是单纯“过去发生过”。',
    prerequisiteNodeIds: ['grammar-a2-past-simple'],
    formulas: ['have/has + 过去分词', 'for / since 表持续', 'already / yet / just 表结果', 'ever / never 表经历'],
    scenarios: ['到现在仍持续', '到现在已有结果', '截至目前的经历'],
    contrasts: ['和一般过去时对比：一般过去时常带明确过去时间。', '现在完成时不和 yesterday, last week 直接连用。'],
    mistakes: ['把明确过去时间和现在完成时混用。', 'has/have 和过去分词搭配错。', 'been / gone 混用。'],
    errorTags: ['tense', 'aspect'],
    examples: [
      example('pp-1', 'She has worked here for five years.', '她已经在这里工作五年了。', '动作从过去持续到现在。'),
      example('pp-2', 'I have already sent the updated file.', '我已经把更新后的文件发出去了。', '强调结果对现在有效。'),
    ],
    exercises: [
      choice('pp-e1', '时态判断', '哪一句更适合现在完成时？', ['I finished it yesterday.', 'She has lived here since 2020.', 'He went there last week.', 'They saw the film in June.'], 1, 'since 2020 指向从过去延续到现在。', 'aspect'),
      choice('pp-e2', '搭配限制', '哪一个时间标志通常不能直接和现在完成时连用？', ['already', 'yet', 'last year', 'since May'], 2, 'last year 锁定明确过去时间，通常用一般过去时。', 'tense'),
      cloze('pp-e3', '补助动词', 'We ____ never tried this method before.', ['have'], '主语 we 对应 have。', 'tense'),
      correction('pp-e4', '修正病句', '把下面句子改对。', 'I have seen him yesterday.', ['I saw him yesterday.'], 'yesterday 这种明确过去时间通常改用一般过去时。', 'aspect'),
      rewrite('pp-e5', '输出练习', '用 for 或 since 写一句持续到现在的经历。', 'I have studied English for three years.', ['have', 'for'], 'aspect'),
    ],
    workshops: [
      workshop('pp-w1', '完成时对比', '把 4 个句子分成“过去时间点”与“影响现在”两类。', ['找时间标志', '找是否持续到现在', '再选时态']),
    ],
    longSentenceReadingIds: ['reading-02', 'reading-05'],
  },
  {
    nodeId: 'grammar-b1-modal-verbs',
    level: 'B1',
    cluster: '功能语法',
    summary: '情态动词重在语气和说话人态度，不是单纯翻译成“能、必须、应该”。',
    prerequisiteNodeIds: ['grammar-a2-future-forms'],
    formulas: ['can/could 表能力或可能', 'must / have to 表强义务', 'should 表建议', 'might / may 表较弱可能'],
    scenarios: ['提建议', '表达义务', '推测可能性'],
    contrasts: ['must 说话人主观义务更强；have to 更像客观要求。', 'could 既能表示过去能力，也能表示更委婉请求。'],
    mistakes: ['情态动词后再加 to。', '把 should 当强制命令。', 'must not 和 do not have to 混淆。'],
    errorTags: ['modal'],
    examples: [
      example('modal-1', 'You should review the feedback before sending the draft.', '你在发草稿前应该先复查反馈。', 'should 表建议。'),
      example('modal-2', 'Visitors must wear badges in this building.', '访客在这栋楼里必须佩戴证件。', 'must 表强义务。'),
    ],
    exercises: [
      choice('modal-e1', '语气选择', '老师给学生建议时更自然的是：', ['must', 'should', 'had to', 'does'], 1, '建议通常用 should。', 'modal'),
      choice('modal-e2', '结构骨架', '情态动词后面应接：', ['to do', 'doing', '动词原形', '过去分词'], 2, '情态动词后接动词原形。', 'modal'),
      cloze('modal-e3', '补情态动词', 'We ____ leave now, or we will miss the train.', ['must'], '强烈必要性可用 must。', 'modal'),
      correction('modal-e4', '修正病句', '把下面句子改对。', 'She should to check the data again.', ['She should check the data again.'], 'should 后直接接原形。', 'modal'),
      rewrite('modal-e5', '输出练习', '各写一句 should 和 might 的句子。', 'You should back up the file. It might rain tonight.', ['should', 'might'], 'modal'),
    ],
    workshops: [
      workshop('modal-w1', '语气阶梯', '把同一件事分别写成建议、必须、可能三种版本。', ['建议 should', '义务 must/have to', '可能 might/may']),
    ],
    longSentenceReadingIds: ['reading-04'],
  },
  {
    nodeId: 'grammar-b1-gerund-infinitive',
    level: 'B1',
    cluster: '功能语法',
    summary: '动名词和不定式的关键不是规则少，而是搭配和意义变化。',
    prerequisiteNodeIds: ['grammar-a2-present-simple'],
    formulas: ['enjoy / finish / avoid + doing', 'want / decide / hope + to do', 'stop doing ≠ stop to do', 'remember doing ≠ remember to do'],
    scenarios: ['表达喜欢/避免/完成', '表达计划/希望/决定', '说明动作先后或意义差异'],
    contrasts: ['有些动词只接 doing，有些只接 to do。', '部分动词两者都能接，但意义不同。'],
    mistakes: ['want doing / enjoy to do 乱配。', 'stop doing 和 stop to do 语义没区分。', 'remember to do 和 remember doing 混淆。'],
    errorTags: ['verb_pattern'],
    examples: [
      example('gi-1', 'I enjoy reading before bed.', '我喜欢睡前阅读。', 'enjoy 后接 doing。'),
      example('gi-2', 'She stopped to answer the phone.', '她停下来去接电话。', 'stop to do 表“停下当前动作去做另一件事”。'),
    ],
    exercises: [
      choice('gi-e1', '搭配选择', '哪一句正确？', ['I enjoy to read at night.', 'I enjoy reading at night.', 'I enjoy read at night.', 'I enjoying read at night.'], 1, 'enjoy 通常接动名词。', 'verb_pattern'),
      choice('gi-e2', '意义辨析', 'stop to do 更接近哪种意思？', ['停止做某事', '停下来去做某事', '已经做完某事', '不再打算做某事'], 1, 'stop to do 表示先停下，再去做另一件事。', 'verb_pattern'),
      cloze('gi-e3', '补形式', 'They decided ____ the old plan.', ['to change'], 'decide 后接 to do。', 'verb_pattern'),
      correction('gi-e4', '修正病句', '把下面句子改对。', 'He avoided to talk about the problem.', ['He avoided talking about the problem.'], 'avoid 后接 doing。', 'verb_pattern'),
      rewrite('gi-e5', '输出练习', '用 remember to do 或 remember doing 写一句提醒类句子。', 'Remember to lock the door before you leave.', ['Remember', 'to'], 'verb_pattern'),
    ],
    workshops: [
      workshop('gi-w1', '搭配清单', '把常见动词分成“只接 doing / 只接 to do / 两者都可但意义不同”三类。', ['enjoy / avoid', 'want / decide', 'stop / remember']),
    ],
    longSentenceReadingIds: ['reading-06'],
  },
  {
    nodeId: 'grammar-b1-passive-voice',
    level: 'B1',
    cluster: '功能语法',
    summary: '被动语态的重点是“把承受者推到前台”，不是机械把 every sentence 都改成被动。',
    prerequisiteNodeIds: ['grammar-a2-past-simple'],
    formulas: ['be + 过去分词', '时态变化体现在 be 上', '动作执行者可用 by + 名词补充', '不知道或不重要执行者时更常用被动'],
    scenarios: ['强调结果或承受者', '正式说明书和报道', '执行者未知或不重要'],
    contrasts: ['主动句关注谁做；被动句关注谁被影响。', '被动不是更高级，而是焦点不同。'],
    mistakes: ['漏 be 动词。', '过去分词形式错。', '所有句子都硬转被动，失去自然度。'],
    errorTags: ['passive', 'tense'],
    examples: [
      example('pass-1', 'The samples were stored in a cooler.', '样品被放在冷藏箱里。', '过去时被动：were stored。', 'reading-09'),
      example('pass-2', 'The form is checked before submission.', '表单会在提交前被检查。', '一般现在时被动。'),
    ],
    exercises: [
      choice('pass-e1', '被动骨架', '哪一句是被动语态？', ['The team stored the samples.', 'The samples were stored in a cooler.', 'The samples storing in a cooler.', 'The team was stored the samples.'], 1, 'be + 过去分词才是被动骨架。', 'passive'),
      choice('pass-e2', '焦点判断', '哪种语境更适合被动？', ['强调是谁做的', '强调承受影响的对象', '描述习惯', '表达猜测'], 1, '当承受者更重要时，被动更自然。', 'passive'),
      cloze('pass-e3', '补 be 动词', 'The documents ____ sent to all members yesterday.', ['were'], 'documents 是复数，过去时间用 were。', 'passive'),
      correction('pass-e4', '修正病句', '把下面句子改对。', 'The meeting delayed because the report unfinished.', ['The meeting was delayed because the report was unfinished.', 'The meeting was delayed because the report was not finished.'], '被动结构不能省略 be。', 'passive'),
      rewrite('pass-e5', '输出练习', '把“Someone updated the charts.”改写成被动。', 'The charts were updated.', ['The charts', 'were updated'], 'passive'),
    ],
    workshops: [
      workshop('pass-w1', '主动被动切换', '找出句子里真正更重要的信息，再决定是否改写成被动。', ['谁是信息焦点', '时态落在 be 上', '过去分词正确']),
    ],
    longSentenceReadingIds: ['reading-01', 'reading-09'],
  },
  {
    nodeId: 'grammar-b1-conjunctions',
    level: 'B1',
    cluster: '功能语法',
    summary: '连接词不是堆词，而是在组织句间逻辑：并列、原因、让步、转折、结果。',
    prerequisiteNodeIds: ['grammar-a1-sentence-forms'],
    formulas: ['and / but / so / or', 'because / although / while', '从属连词后接完整从句', '逻辑词先于炫技'],
    scenarios: ['连接两个动作或观点', '说明原因结果', '表达转折和让步'],
    contrasts: ['because 讲原因，so 讲结果；although 已经带转折，不再随意叠 but。', 'while 可表示时间，也可表示对比。'],
    mistakes: ['Although..., but... 双重转折。', 'because 和 so 同句叠加。', '连词后接不完整结构。'],
    errorTags: ['conjunction', 'word_order'],
    examples: [
      example('conj-1', 'Although the report was finished, the meeting was delayed.', '尽管报告完成了，会议还是被推迟了。', '让步逻辑已经由 although 表达。', 'reading-01'),
      example('conj-2', 'We stayed inside because it was raining.', '我们待在室内，因为当时正在下雨。', 'because 引原因从句。'),
    ],
    exercises: [
      choice('conj-e1', '逻辑选择', '表达“虽然……但是……”更自然的是：', ['Although it was late, but he stayed.', 'Although it was late, he stayed.', 'Because it was late, but he stayed.', 'It was late although but he stayed.'], 1, 'although 已经表示让步，后面通常不再加 but。', 'conjunction'),
      choice('conj-e2', '原因 vs 结果', '哪一个更适合放在原因从句前？', ['so', 'because', 'therefore', 'however'], 1, 'because 用于引导原因从句。', 'conjunction'),
      cloze('conj-e3', '补连接词', '____ the data was incomplete, we ran the test again.', ['Because'], 'because 引导原因。', 'conjunction'),
      correction('conj-e4', '修正病句', '把下面句子改对。', 'Although he was tired, but he continued.', ['Although he was tired, he continued.'], 'although 和 but 不应重复表达同一转折。', 'conjunction'),
      rewrite('conj-e5', '输出练习', '写一句包含 because 或 although 的复合句。', 'Although the task looked simple, it took more time than expected.', ['Although', 'it'], 'conjunction'),
    ],
    workshops: [
      workshop('conj-w1', '逻辑命名', '给一组句子标注“原因/结果/让步/并列/转折”。', ['先看逻辑关系', '再选连词', '最后检查主从结构']),
    ],
    longSentenceReadingIds: ['reading-01', 'reading-07'],
  },
  {
    nodeId: 'grammar-b1-question-tags',
    level: 'B1',
    cluster: '功能语法',
    summary: '反义疑问句要先抓主句的肯否和时态，再镜像出附加部分。',
    prerequisiteNodeIds: ['grammar-a2-present-simple'],
    formulas: ['肯定主句 + 否定尾巴', '否定主句 + 肯定尾巴', '附加部分沿用助动词/时态/主语代词', '语调上升多表示确认，下降更像寻求认同'],
    scenarios: ['口语确认信息', '让对方附和', '柔化陈述句'],
    contrasts: ['主句是 be、助动词、情态动词时，尾巴沿用它。', 'nobody / nothing 等近似否定要格外注意。'],
    mistakes: ['didn’t he? / does he? 镜像错误。', '主句已经否定，尾巴还是否定。', '主语不用代词回指。'],
    errorTags: ['question_tag', 'tense'],
    examples: [
      example('tag-1', 'She is coming later, isn’t she?', '她晚点会来，对吧？', '主句肯定，尾巴否定。'),
      example('tag-2', 'You didn’t submit the form, did you?', '你没提交表单，是吧？', '主句否定，尾巴肯定。'),
    ],
    exercises: [
      choice('tag-e1', '尾巴镜像', 'She works here, ____ ?', ['doesn’t she', 'didn’t she', 'isn’t she', 'does she'], 0, '一般现在时实义动词尾巴用 doesn’t she。', 'question_tag'),
      choice('tag-e2', '主句否定', 'They are not ready, ____ ?', ['aren’t they', 'don’t they', 'are they', 'weren’t they'], 2, '主句否定，尾巴要肯定。', 'question_tag'),
      cloze('tag-e3', '补尾巴', 'You can help us, ____ ?', ['can’t you'], '情态动词 can 镜像为 can’t you。', 'question_tag'),
      correction('tag-e4', '修正病句', '把下面句子改对。', 'He went home, doesn’t he?', ['He went home, didn’t he?'], '过去时要用 didn’t he。', 'question_tag'),
      rewrite('tag-e5', '输出练习', '写一句带反义疑问句的确认句。', 'This plan looks better, doesn’t it?', ['doesn’t'], 'question_tag'),
    ],
    workshops: [
      workshop('tag-w1', '镜像练习', '先判断主句肯否和时态，再写尾巴。', ['先看主句', '找助动词', '改成相反极性']),
    ],
    longSentenceReadingIds: ['reading-06'],
  },
  {
    nodeId: 'grammar-b2-relative-clauses',
    level: 'B2',
    cluster: '复杂结构',
    summary: '定语从句不是为了炫技，而是为了把“哪个人/哪件事”说得更精确。',
    prerequisiteNodeIds: ['grammar-b1-conjunctions'],
    formulas: ['who / which / that 引导定语从句', 'whose 表所属', '限定性从句决定身份，非限定性从句补充信息', '先行词决定关系词选择'],
    scenarios: ['压缩信息', '说明人或物的特征', '书面表达中减少重复句'],
    contrasts: ['限定性从句和非限定性从句语气不同。', 'that 不能随意替代所有关系词，非限定性从句通常不用 that。'],
    mistakes: ['which / who 选错。', '非限定性从句漏逗号或乱用 that。', '先行词和关系词逻辑不一致。'],
    errorTags: ['relative_clause', 'word_order'],
    examples: [
      example('rel-1', 'The students who had reviewed the data carefully noticed the missing values.', '那些认真检查过数据的学生注意到了缺失值。', 'who 引导修饰 students 的定语从句。', 'reading-02'),
      example('rel-2', 'The vendor, whose schedule was realistic, won the project.', '那家时间安排现实的供应商赢得了项目。', 'whose 表所属。', 'reading-08'),
    ],
    exercises: [
      choice('rel-e1', '关系词选择', '修饰 people 时更常用：', ['which', 'who', 'where', 'when'], 1, '修饰人通常用 who。', 'relative_clause'),
      choice('rel-e2', '所属关系', '表示“他的计划”的关系词是：', ['which', 'that', 'whose', 'whom'], 2, 'whose 表示所属关系。', 'relative_clause'),
      cloze('rel-e3', '补关系词', 'The book ____ you lent me was very helpful.', ['that', 'which'], '修饰物且作宾语时可用 that/which。', 'relative_clause'),
      correction('rel-e4', '修正病句', '把下面句子改对。', 'My teacher, that lives in Beijing, is visiting us.', ['My teacher, who lives in Beijing, is visiting us.'], '非限定性从句通常不用 that。', 'relative_clause'),
      rewrite('rel-e5', '输出练习', '把两个简单句合并成一个定语从句句子：I met a woman. She designs apps.', 'I met a woman who designs apps.', ['who', 'woman'], 'relative_clause'),
    ],
    workshops: [
      workshop('rel-w1', '从句挂接', '先找到先行词，再决定从句是在限定身份还是补充说明。', ['先行词是谁', '关系词选对', '逗号是否需要']),
    ],
    longSentenceReadingIds: ['reading-02', 'reading-05', 'reading-08'],
  },
  {
    nodeId: 'grammar-b2-conditionals',
    level: 'B2',
    cluster: '复杂结构',
    summary: '条件句先看真假和时间，再选时态，不要从 if 开始死背表格。',
    prerequisiteNodeIds: ['grammar-a2-future-forms'],
    formulas: ['零条件：if + 一般现在时, 一般现在时', '一类条件：if + 一般现在时, will + V', '二类条件：if + 一般过去时, would + V', '三类条件：if + 过去完成时, would have + 过去分词'],
    scenarios: ['客观规律', '真实可能', '与现在相反假设', '与过去相反假设'],
    contrasts: ['一类条件讨论真实未来可能。', '二类/三类更像假设与反事实。'],
    mistakes: ['if 从句里乱加 will。', '二类条件里 If I was you。', '三类条件结构混乱。'],
    errorTags: ['conditional', 'tense'],
    examples: [
      example('cond-1', 'If the company had explained the policy earlier, fewer employees would have complained.', '如果公司更早解释政策，抱怨的员工就会少一些。', '典型三类条件句。', 'reading-03'),
      example('cond-2', 'If it rains tomorrow, we will stay home.', '如果明天下雨，我们就待在家里。', '一类条件句。'),
    ],
    exercises: [
      choice('cond-e1', '一类条件句', 'If it ____ tomorrow, we will stay home.', ['rains', 'will rain', 'rained', 'would rain'], 0, 'if 从句里通常不用 will。', 'conditional'),
      choice('cond-e2', '虚拟条件', 'If I ____ you, I would ask more questions.', ['am', 'was', 'were', 'be'], 2, '虚拟条件句常用 If I were you。', 'conditional'),
      cloze('cond-e3', '补结果部分', 'If they had left earlier, they ____ have caught the bus.', ['would'], '三类条件句结果部分常用 would have + 过去分词。', 'conditional'),
      correction('cond-e4', '修正病句', '把下面句子改对。', 'If she will study harder, she will pass.', ['If she studies harder, she will pass.'], '一类条件句 if 从句用一般现在时。', 'conditional'),
      rewrite('cond-e5', '输出练习', '写一个与现在事实相反的二类条件句。', 'If I had more time, I would read every night.', ['If', 'would'], 'conditional'),
    ],
    workshops: [
      workshop('cond-w1', '真假判断', '先判断“真实可能/与现在相反/与过去相反”，再匹配条件句类型。', ['判断时间', '判断真假', '再选时态']),
    ],
    longSentenceReadingIds: ['reading-03'],
  },
  {
    nodeId: 'grammar-b2-reported-speech',
    level: 'B2',
    cluster: '复杂结构',
    summary: '间接引语的关键是“视角变了”，所以时态、人称、时间地点词都可能后移。',
    prerequisiteNodeIds: ['grammar-a2-past-simple'],
    formulas: ['say/tell + that 从句', '时态常回溯：am -> was, have done -> had done', 'this/today/here 等常随说话视角改变', '命令请求可用 told/asked + 人 + to do'],
    scenarios: ['转述别人说的话', '写会议纪要', '复述采访内容'],
    contrasts: ['如果事实仍然有效或说话时间很近，未必强制回溯。', 'tell 通常后面接人，say 不直接接人。'],
    mistakes: ['say me that... 结构错误。', '时态回溯遗漏。', 'today / tomorrow 等时间词不改。'],
    errorTags: ['reported_speech', 'tense'],
    examples: [
      example('rs-1', 'She said that the file was ready.', '她说文件已经准备好了。', '直接引语转述为 reported speech。'),
      example('rs-2', 'The manager told us to update the chart.', '经理让我们更新图表。', 'told + 人 + to do。'),
    ],
    exercises: [
      choice('rs-e1', 'say vs tell', '哪一句正确？', ['She said me the truth.', 'She told me the truth.', 'She told the truth me.', 'She said me that she was late.'], 1, 'tell 后接人，say 通常不直接接人。', 'reported_speech'),
      choice('rs-e2', '时态回溯', 'He said, "I am busy." 转成间接引语更常见的是：', ['He said that he is busy.', 'He said that he was busy.', 'He said he busy.', 'He said that I was busy.'], 1, '在过去转述时，am 常回溯成 was。', 'reported_speech'),
      cloze('rs-e3', '补结构', 'She told me ____ finish the report that night.', ['to'], '命令/要求常用 told + 人 + to do。', 'reported_speech'),
      correction('rs-e4', '修正病句', '把下面句子改对。', 'He said me that the train was late.', ['He told me that the train was late.', 'He said that the train was late.'], 'say 和 tell 结构不能混。', 'reported_speech'),
      rewrite('rs-e5', '输出练习', '把直接引语改成间接引语：She said, "I have finished it."', 'She said that she had finished it.', ['said', 'had finished'], 'reported_speech'),
    ],
    workshops: [
      workshop('rs-w1', '视角迁移', '每次转述都检查人称、时间词、地点词和时态。', ['谁在说', '什么时候说', '哪些指代要变']),
    ],
    longSentenceReadingIds: ['reading-03'],
  },
  {
    nodeId: 'grammar-b2-noun-clauses',
    level: 'B2',
    cluster: '复杂结构',
    summary: '名词性从句的重点是：它在句子里扮演名词角色，但内部仍保持完整句结构。',
    prerequisiteNodeIds: ['grammar-b1-conjunctions'],
    formulas: ['that / whether / if / what / why 等引导', '主语从句、宾语从句、表语从句', '从句在主句里整体充当“名词位置”', '从句内部仍要有自己的主谓结构'],
    scenarios: ['表达观点、疑问、不确定性', '解释“真正重要的是什么”', '学术和正式写作中组织复杂观点'],
    contrasts: ['that 从句重陈述；whether/if 更偏是否；what 从句自带内容。', '名词性从句和定语从句不要混。'],
    mistakes: ['把从句语序写成疑问句语序。', 'whether/if 使用环境不分。', 'what 和 that 混用。'],
    errorTags: ['noun_clause', 'word_order'],
    examples: [
      example('nc-1', 'What the professor wanted the class to understand was that a clear argument matters more than complicated vocabulary.', '教授想让全班明白的是，清晰论证比复杂词汇更重要。', '前半是主语从句，后半是表语内容。', 'reading-06'),
      example('nc-2', 'I wonder whether the team has enough time.', '我想知道团队是否有足够时间。', 'whether 引导不确定内容。'),
    ],
    exercises: [
      choice('nc-e1', '语序判断', '名词性从句内部通常使用：', ['疑问句语序', '陈述句语序', '祈使句语序', '省略主语语序'], 1, '即使句意像问题，名词性从句内部通常也用陈述句语序。', 'noun_clause'),
      choice('nc-e2', '引导词选择', '表达“是否”更常见的引导词是：', ['what', 'that', 'whether', 'whose'], 2, 'whether/if 常表达“是否”。', 'noun_clause'),
      cloze('nc-e3', '补引导词', 'I do not know ____ he will join us.', ['whether', 'if'], 'whether/if 都可表示“是否”。', 'noun_clause'),
      correction('nc-e4', '修正病句', '把下面句子改对。', 'I wonder what is the problem.', ['I wonder what the problem is.'], '名词性从句内部用陈述句语序。', 'noun_clause'),
      rewrite('nc-e5', '输出练习', '用 what 引导一个主语从句写一句话。', 'What we need now is a clearer plan.', ['What', 'is'], 'noun_clause'),
    ],
    workshops: [
      workshop('nc-w1', '名词位置检测', '先看从句整体在主句里是主语、宾语还是表语，再决定结构。', ['主语位置', '宾语位置', '内部仍是完整句']),
    ],
    longSentenceReadingIds: ['reading-06'],
  },
  {
    nodeId: 'grammar-c1-inversion-emphasis',
    level: 'C1',
    cluster: '高级表达',
    summary: '倒装和强调是为了突出信息焦点，不是为了让句子显得复杂。',
    prerequisiteNodeIds: ['grammar-b2-conditionals'],
    formulas: ['Never / Rarely / Hardly ... + 助动词 + 主语 + 动词', 'Only then / Only after ... + 助动词倒装', 'It is/was ... that/who ... 强调句', 'Not only ... but also ... 可引发倒装'],
    scenarios: ['正式写作和演讲强调', '增强语气', '突出时间、地点、条件'],
    contrasts: ['普通语序足够时不必强行倒装。', '强调句和定语从句表面像，但作用不同。'],
    mistakes: ['倒装时漏助动词。', '强调句结构不完整。', '所有高级句都滥用倒装。'],
    errorTags: ['inversion', 'word_order'],
    examples: [
      example('inv-1', 'Not only did the designer simplify the interface, but she also added a tutorial.', '设计师不仅简化了界面，还加入了教程。', 'not only 前置会触发倒装。', 'reading-04'),
      example('inv-2', 'It was the final review that revealed the missing data.', '正是最后一次审查发现了缺失数据。', '强调句型。'),
    ],
    exercises: [
      choice('inv-e1', '倒装骨架', '哪一句更符合倒装结构？', ['Never I have seen this.', 'Never have I seen this.', 'Never I saw this.', 'Have never I seen this.'], 1, '否定副词前置后常用助动词倒装。', 'inversion'),
      choice('inv-e2', '强调句识别', '强调“是 John 打破了记录”更自然的是：', ['John was broke the record.', 'It is John who broke the record.', 'John who broke the record.', 'It John broke the record.'], 1, '强调句型是 It is/was ... that/who ...。', 'inversion'),
      cloze('inv-e3', '补助动词', 'Only then ____ she realize the real issue.', ['did'], '过去语境下常用 did 倒装。', 'inversion'),
      correction('inv-e4', '修正病句', '把下面句子改对。', 'Rarely she checks the details so carefully.', ['Rarely does she check the details so carefully.'], '否定副词前置后要倒装。', 'inversion'),
      rewrite('inv-e5', '输出练习', '用 It was ... that ... 写一句强调句。', 'It was the extra practice that improved my grammar.', ['It was', 'that'], 'inversion'),
    ],
    workshops: [
      workshop('inv-w1', '焦点重写', '先写普通句，再只改最需要突出的一部分为倒装或强调句。', ['先有普通版', '再确定焦点', '最后改结构']),
    ],
    longSentenceReadingIds: ['reading-04'],
  },
  {
    nodeId: 'grammar-c1-discourse-linking',
    level: 'C1',
    cluster: '高级表达',
    summary: '语篇衔接词不只是“连句子”，而是在管理论证方向、转折力度和信息层级。',
    prerequisiteNodeIds: ['grammar-b1-conjunctions'],
    formulas: ['however / nevertheless 表转折', 'therefore / thus / as a result 表结果', 'moreover / furthermore 表递进', 'whereas / while 表对照'],
    scenarios: ['正式写作', '口头表达组织观点', '比较与让步结构'],
    contrasts: ['however 语气比 but 更书面。', 'therefore 更像推论结果，不等于 because。'],
    mistakes: ['衔接词只会堆 but / so。', '逗号和位置乱放。', '逻辑关系不匹配，词虽高级但语义不准。'],
    errorTags: ['discourse', 'conjunction'],
    examples: [
      example('disc-1', 'The design looked simple; however, the setup was still confusing for first-time users.', '这个设计看起来简单；然而，对首次用户来说设置流程仍然让人困惑。', 'however 用于正式转折。'),
      example('disc-2', 'The evidence was incomplete; therefore, the committee delayed the decision.', '证据不完整，因此委员会推迟了决定。', 'therefore 表推论结果。'),
    ],
    exercises: [
      choice('disc-e1', '逻辑匹配', '表示“因此”更正式的连接词是：', ['however', 'therefore', 'whereas', 'nevertheless'], 1, 'therefore 常用于正式结果关系。', 'discourse'),
      choice('disc-e2', '对比关系', '表示两者对照时更自然的是：', ['moreover', 'whereas', 'therefore', 'indeed'], 1, 'whereas 常引对照关系。', 'discourse'),
      cloze('disc-e3', '补衔接词', 'The app is fast; ____, many users still find the navigation unclear.', ['however', 'nevertheless'], '前后是转折关系。', 'discourse'),
      correction('disc-e4', '修正逻辑', '把下面句子改对。', 'The sample size was too small, because, the result was unreliable.', ['The sample size was too small; therefore, the result was unreliable.'], '这里更适合结果衔接，而不是 because 直接并列。', 'discourse'),
      rewrite('disc-e5', '输出练习', '写两句观点，再用 however 或 therefore 把它们连成一句。', 'The tool saves time; however, it still needs clearer feedback.', ['however'], 'discourse'),
    ],
    workshops: [
      workshop('disc-w1', '论证地图', '给每个段落句子标记“提出观点/补充/转折/推论”，再选衔接词。', ['先看逻辑', '再选词', '最后检查标点']),
    ],
    longSentenceReadingIds: ['reading-01', 'reading-07'],
  },
]

const grammarBlueprintMap = new Map<string, GrammarNodeBlueprint>(
  grammarSeeds.map((seed) => [
    seed.nodeId,
    {
      nodeId: seed.nodeId,
      level: seed.level,
      cluster: seed.cluster,
      summary: seed.summary,
      prerequisiteNodeIds: seed.prerequisiteNodeIds,
      units: buildUnits(seed),
      examples: seed.examples,
      exercises: seed.exercises,
      workshops: seed.workshops,
      longSentenceReadingIds: seed.longSentenceReadingIds,
    },
  ])
)

export function getGrammarBlueprint(nodeId: string) {
  return grammarBlueprintMap.get(nodeId) ?? null
}

export function listGrammarBlueprints() {
  return Array.from(grammarBlueprintMap.values())
}

export function findGrammarBlueprintsByReadingId(readingId: string) {
  return listGrammarBlueprints().filter((item) => item.longSentenceReadingIds.includes(readingId))
}

const keywordToNodeId: Array<{ keyword: string; nodeId: string }> = [
  { keyword: '一般现在时', nodeId: 'grammar-a2-present-simple' },
  { keyword: '现在进行时', nodeId: 'grammar-a2-present-continuous' },
  { keyword: '一般过去时', nodeId: 'grammar-a2-past-simple' },
  { keyword: '将来', nodeId: 'grammar-a2-future-forms' },
  { keyword: '现在完成时', nodeId: 'grammar-b1-present-perfect' },
  { keyword: '情态动词', nodeId: 'grammar-b1-modal-verbs' },
  { keyword: '动名词', nodeId: 'grammar-b1-gerund-infinitive' },
  { keyword: '不定式', nodeId: 'grammar-b1-gerund-infinitive' },
  { keyword: '被动', nodeId: 'grammar-b1-passive-voice' },
  { keyword: '连接词', nodeId: 'grammar-b1-conjunctions' },
  { keyword: '反义疑问', nodeId: 'grammar-b1-question-tags' },
  { keyword: '定语从句', nodeId: 'grammar-b2-relative-clauses' },
  { keyword: '条件句', nodeId: 'grammar-b2-conditionals' },
  { keyword: '间接引语', nodeId: 'grammar-b2-reported-speech' },
  { keyword: '名词性从句', nodeId: 'grammar-b2-noun-clauses' },
  { keyword: '倒装', nodeId: 'grammar-c1-inversion-emphasis' },
  { keyword: '强调', nodeId: 'grammar-c1-inversion-emphasis' },
  { keyword: '衔接', nodeId: 'grammar-c1-discourse-linking' },
  { keyword: 'however', nodeId: 'grammar-c1-discourse-linking' },
  { keyword: 'therefore', nodeId: 'grammar-c1-discourse-linking' },
  { keyword: 'which', nodeId: 'grammar-b2-relative-clauses' },
  { keyword: 'who', nodeId: 'grammar-b2-relative-clauses' },
  { keyword: 'if', nodeId: 'grammar-b2-conditionals' },
  { keyword: 'not only', nodeId: 'grammar-c1-inversion-emphasis' },
]

export function findGrammarBlueprintsByHints(hints: string[]) {
  const haystack = hints.join(' ').toLowerCase()
  const matchedNodeIds = keywordToNodeId
    .filter((item) => haystack.includes(item.keyword.toLowerCase()))
    .map((item) => item.nodeId)
    .filter((nodeId, index, array) => array.indexOf(nodeId) === index)

  return matchedNodeIds
    .map((nodeId) => getGrammarBlueprint(nodeId))
    .filter((item): item is GrammarNodeBlueprint => Boolean(item))
}
