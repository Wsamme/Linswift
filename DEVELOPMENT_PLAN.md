# Linswift 开发规划文档

## 📋 目录
1. [功能缺失分析](#功能缺失分析)
2. [Supabase 数据库架构](#supabase-数据库架构)
3. [开发任务清单](#开发任务清单)

---

## 1. 功能缺失分析

### 1.1 核心功能（Phase 1）

#### 🔐 登录页 (`/login`)
**当前状态：** 静态 UI，模拟登录
**缺失功能：**
- [ ] 真实的用户注册功能
- [ ] 邮箱/手机号验证
- [ ] 密码强度检查
- [ ] 第三方登录（微信、Apple、Google OAuth）
- [ ] 忘记密码功能
- [ ] 与 Supabase Auth 集成
- [ ] 登录状态持久化（LocalStorage/SessionStorage）
- [ ] 登录后跳转逻辑

**按钮跳转：**
- "登录" → `/learn` （需验证成功）
- "注册账号" → `/register` （新页面，待创建）

---

#### 🏠 学习页 (`/learn`)
**当前状态：** 静态数据 + AI 推荐（已接入）
**缺失功能：**
- [ ] 从数据库读取用户学习统计（天数、时长）
- [ ] 热度图数据绑定（从学习记录生成）
- [ ] 今日任务进度实时更新（从数据库读取）
- [ ] 图书馆书籍列表从数据库读取
- [ ] 推荐课程个性化（基于用户水平）
- [ ] 设置按钮跳转到设置页
- [ ] 学习时长计时器（后台运行）

**按钮跳转：**
- "背单词" → `/ebbinghaus` ✅
- "听力" → `/listening` ✅
- "口语" → `/speaking` ✅
- "语法" → `/grammar` ✅
- "图书馆全部" → `/bookshelf` ✅
- "设置" → `/settings` ❌（待创建）

---

#### 📖 翻译页 (`/translate`)
**当前状态：** AI 翻译已接入
**缺失功能：**
- [ ] 翻译历史记录保存到数据库
- [ ] 收藏功能（保存到 Supabase）
- [ ] 发音功能（TTS API 集成）
- [ ] 一键收录陌生词汇到词库（写入数据库）
- [ ] 语言切换动画优化
- [ ] 离线翻译缓存

**按钮跳转：**
- "收藏" → 保存到数据库 `user_translations` 表
- "一键收录" → 批量写入 `user_vocabulary` 表

---

#### 📚 词库页 (`/vocab`)
**当前状态：** 静态词汇列表 + AI 搜索
**缺失功能：**
- [ ] 从 Supabase 读取用户词汇表
- [ ] 筛选功能（全部/收藏/AI 分类）绑定数据库查询
- [ ] 词汇熟练度实时更新（基于学习记录）
- [ ] 词汇量测试结果保存
- [ ] 收藏/取消收藏实时同步
- [ ] 删除词汇功能
- [ ] 批量导出词汇

**按钮跳转：**
- "陌生词汇测试" → `/vocab-test` ✅
- "AI 分类" → `/ai-classify` ✅
- 点击词汇 → 弹窗显示详情（已实现）

---

#### 👤 个人页 (`/profile`)
**当前状态：** 静态数据展示
**缺失功能：**
- [ ] 从 Supabase 读取用户信息（昵称、头像、等级）
- [ ] 学习统计数据绑定（学习天数、词汇量、时长）
- [ ] 设置菜单项跳转
- [ ] 退出登录功能（清除 Supabase 会话）
- [ ] 编辑个人资料功能
- [ ] 等级系统计算（基于学习时长和词汇量）
- [ ] 头像上传

**按钮跳转：**
- "用户信息" → `/profile-edit` ❌（待创建）
- "学习设置" → `/settings/study` ❌
- "通知设置" → `/settings/notification` ❌
- "隐私设置" → `/settings/privacy` ❌
- "关于我们" → `/about` ❌
- "退出登录" → 清除会话，跳转 `/login`

---

### 1.2 阅读器模块（Phase 2）

#### 📕 书架页 (`/bookshelf`)
**当前状态：** 静态书籍列表
**缺失功能：**
- [ ] PDF 导入功能（文件上传到 Supabase Storage）
- [ ] 从数据库读取用户书架
- [ ] 阅读进度保存与恢复
- [ ] 书籍搜索与筛选
- [ ] 删除书籍功能
- [ ] 书籍元数据提取（标题、作者、页数）
- [ ] AI 提取陌生词汇（后台任务）

**按钮跳转：**
- "导入 PDF" → 文件上传对话框
- 点击书籍 → `/reading-prep?bookId=xxx` ✅

---

#### 📝 阅读准备页 (`/reading-prep`)
**当前状态：** 静态陌生词汇列表
**缺失功能：**
- [ ] 从数据库读取该书的陌生词汇
- [ ] 与用户词库对比（已会的词不显示）
- [ ] "先学习"功能状态保存
- [ ] AI 预测词汇难度

**按钮跳转：**
- "先学习" → `/flashcard?bookId=xxx` ✅
- "直接阅读" → `/reading?bookId=xxx` ✅

---

#### 🃏 卡片学习页 (`/flashcard`)
**当前状态：** 静态卡片交互
**缺失功能：**
- [ ] 从数据库读取待学习词汇
- [ ] 学习进度保存（会/模糊/不会）
- [ ] 艾宾浩斯记忆曲线计算（下次复习时间）
- [ ] 卡片滑动手势优化
- [ ] 发音功能（TTS）
- [ ] 学习完成后统计报告

**按钮跳转：**
- "会" / "模糊" / "不会" → 保存到数据库 `vocabulary_reviews` 表
- 学习完成 → 返回 `/reading-prep` 或 `/ebbinghaus`

---

#### 📖 阅读界面 (`/reading`)
**当前状态：** 静态文本展示
**缺失功能：**
- [ ] 从 Supabase Storage 读取 PDF 内容
- [ ] 阅读进度保存（当前页/段落）
- [ ] 自动翻译开关状态保存
- [ ] 自动收录陌生词汇功能
- [ ] 点击词汇弹窗交互（已有静态版）
- [ ] 阅读时长统计
- [ ] 书签功能
- [ ] 夜间模式

**按钮跳转：**
- 点击陌生词汇 → 弹窗显示详情（单词详情弹窗）
- "我会了" → 更新词汇熟练度

---

### 1.3 背单词模块（Phase 2）

#### 📅 艾宾浩斯记忆规划 (`/ebbinghaus`)
**当前状态：** 静态看板
**缺失功能：**
- [ ] 从数据库读取用户学习计划
- [ ] 艾宾浩斯算法实现（1天、2天、4天、7天复习）
- [ ] 今日待学/待复习数量实时计算
- [ ] 已掌握词汇统计
- [ ] 学习模式入口点击跳转

**按钮跳转：**
- "卡片学习" → `/flashcard?mode=review` ✅
- "游戏记忆" → `/vocab-game` ✅
- "AI 速记" → `/aimemo` ✅

---

#### 🎮 游戏记忆模式 (`/vocab-game`)
**当前状态：** 静态游戏列表
**缺失功能：**
- [ ] 四种游戏的实际实现（新页面）
  - [ ] 单词连连看 `/game/match`
  - [ ] 拼写挑战 `/game/spell`
  - [ ] 听音辨词 `/game/listen`
  - [ ] 限时闪电 `/game/flash`
- [ ] 游戏成绩保存
- [ ] 排行榜数据（从数据库读取）
- [ ] 游戏进度统计

**按钮跳转：**
- 点击游戏模式 → 对应游戏页面（待创建）

---

#### 🧠 AI 速记生成 (`/aimemo`)
**当前状态：** AI 生成故事（已接入）
**缺失功能：**
- [ ] 历史场景保存到数据库
- [ ] 收藏功能
- [ ] 朗读故事（TTS）
- [ ] 分享功能
- [ ] 从词库选择目标单词

**按钮跳转：**
- "收藏" → 保存到数据库 `saved_mnemonics` 表
- "换一个" → AI 重新生成

---

### 1.4 听力模块（Phase 3）

#### 🎧 听力练习汇总 (`/listening`)
**当前状态：** 静态统计
**缺失功能：**
- [ ] 从数据库读取听力统计（时长、天数、正确率）
- [ ] 今日听力任务绑定数据库
- [ ] 推荐内容个性化

**按钮跳转：**
- "听歌填字" → `/listen-fill` ✅
- "随行听" → `/listen-go` ✅
- "听·图书馆" → `/listen-lib` ✅

---

#### 🎵 听歌填字 (`/listen-fill`)
**当前状态：** 静态填空界面
**缺失功能：**
- [ ] 音频播放功能（音频文件从 Supabase Storage 读取）
- [ ] 填空答案验证
- [ ] 正确率统计
- [ ] 进度保存
- [ ] 歌词同步高亮

**按钮跳转：**
- "完成" → 返回 `/listening`，保存成绩

---

#### 📻 随行听 (`/listen-go`)
**当前状态：** 静态内容列表
**缺失功能：**
- [ ] 音频播放器（可后台播放）
- [ ] 播放进度保存
- [ ] 内容列表从数据库读取
- [ ] 分类筛选功能
- [ ] 难度标签绑定用户水平

**按钮跳转：**
- 点击内容 → 播放音频（当前页或新播放页）

---

#### 📚 听·图书馆 (`/listen-lib`)
**当前状态：** 静态内容列表
**缺失功能：**
- [ ] "转化图书为博客"功能（AI 生成）
- [ ] 音频博客列表从数据库读取
- [ ] 播放器功能
- [ ] 分类筛选

**按钮跳转：**
- "转化图书为博客" → `/book-to-blog` ❌（待创建）
- 点击博客 → 播放音频

---

### 1.5 口语模块（Phase 3）

#### 🗣️ 口语练习汇总 (`/speaking`)
**当前状态：** 静态统计
**缺失功能：**
- [ ] 从数据库读取口语统计
- [ ] 今日口语任务绑定数据库

**按钮跳转：**
- "复述练习" → `/retell` ✅
- "AI 场景对话" → `/scene-select` → `/ai-dialog` ✅

---

#### 🔁 复述练习 (`/retell`)
**当前状态：** 静态评分展示
**缺失功能：**
- [ ] 语音录制功能（Web Speech API 或 SDK）
- [ ] 语音识别（STT）
- [ ] AI 评分（准确率、流利度、语调）
- [ ] 差异对比算法
- [ ] 练习记录保存

**按钮跳转：**
- "重新复述" → 重新录音
- "下一句" → 加载下一个句子

---

#### 💬 AI 场景对话 (`/ai-dialog`)
**当前状态：** AI 对话已接入，语法纠错已实现
**缺失功能：**
- [ ] 语音输入（STT）
- [ ] 对话历史保存到数据库
- [ ] 建议回复功能优化
- [ ] 对话评分（流利度、语法等）
- [ ] 场景参数传递（从场景选择页）

**按钮跳转：**
- 麦克风按钮 → 开始语音输入
- "结束对话" → 返回 `/speaking`，保存记录

---

#### 🎭 场景选择 (`/scene-select`)
**当前状态：** 静态场景列表 + 雷达图
**缺失功能：**
- [ ] 快捷置顶场景编辑功能
- [ ] AI 能力评估从数据库读取（基于历史对话）
- [ ] 场景推荐个性化

**按钮跳转：**
- 点击场景 → `/ai-dialog?scene=xxx` ✅

---

### 1.6 语法模块（Phase 4）

#### 🌳 语法知识树 (`/grammar`)
**当前状态：** 静态知识树
**缺失功能：**
- [ ] 从数据库读取用户学习进度
- [ ] 节点解锁逻辑（完成前置节点）
- [ ] 视频/文章内容展示（新页面）
- [ ] 学习进度保存

**按钮跳转：**
- 点击已解锁节点 → `/grammar/lesson?id=xxx` ❌（待创建）

---

### 1.7 词汇测试（Phase 4）

#### 📄 阅读理解测试 (`/reading-test`)
**当前状态：** 静态测试界面
**缺失功能：**
- [ ] 测试题目从数据库读取
- [ ] 理解程度提交后保存
- [ ] 测试结果统计

**按钮跳转：**
- "提交" → 保存到数据库，显示结果页

---

#### 📊 词汇量测试 (`/vocab-test`)
**当前状态：** 静态卡片测试
**缺失功能：**
- [ ] 词汇卡片从题库随机抽取
- [ ] 实时词汇量计算算法
- [ ] 测试结果保存到数据库
- [ ] 生成测试报告

**按钮跳转：**
- "完成测试" → 显示结果页，保存到 `vocab_test_results` 表

---

#### 🏷️ AI 词汇分类 (`/ai-classify`)
**当前状态：** AI 分类已接入
**缺失功能：**
- [ ] 从数据库读取用户词库
- [ ] AI 分类结果保存
- [ ] 按场景查看词汇列表

**按钮跳转：**
- 点击场景卡片 → 展开词汇列表（当前页或新页面）

---

## 2. Supabase 数据库架构

### 2.1 用户认证（Supabase Auth）
使用 Supabase 内置的 Auth 模块，自动管理 `auth.users` 表。

---

### 2.2 数据表设计

#### 📌 `profiles` - 用户资料表
扩展 Supabase Auth 的用户信息。

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  avatar_url TEXT,
  level INTEGER DEFAULT 1, -- 用户等级
  total_study_days INTEGER DEFAULT 0, -- 累计学习天数
  total_study_hours DECIMAL(10,2) DEFAULT 0, -- 累计学习时长（小时）
  vocabulary_count INTEGER DEFAULT 0, -- 词汇量
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 行级安全策略（RLS）
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
```

---

#### 📚 `user_vocabulary` - 用户词汇表
存储用户收录的所有词汇。

```sql
CREATE TABLE user_vocabulary (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  phonetic TEXT,
  meaning TEXT,
  example_sentence TEXT,
  source TEXT, -- 来源：translate, reading, manual, test
  starred BOOLEAN DEFAULT FALSE, -- 是否收藏
  mastery_level INTEGER DEFAULT 0, -- 熟练度 0-5
  scene_tags TEXT[], -- AI 分类场景标签：['商务', '旅行']
  next_review_at TIMESTAMPTZ, -- 下次复习时间（艾宾浩斯）
  review_count INTEGER DEFAULT 0, -- 复习次数
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, word)
);

CREATE INDEX idx_user_vocab_user ON user_vocabulary(user_id);
CREATE INDEX idx_user_vocab_next_review ON user_vocabulary(next_review_at);
ALTER TABLE user_vocabulary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own vocabulary" ON user_vocabulary USING (auth.uid() = user_id);
```

---

#### 📝 `vocabulary_reviews` - 词汇复习记录
记录每次词汇复习的结果，用于艾宾浩斯算法。

```sql
CREATE TABLE vocabulary_reviews (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vocabulary_id BIGINT NOT NULL REFERENCES user_vocabulary(id) ON DELETE CASCADE,
  result TEXT NOT NULL CHECK (result IN ('known', 'fuzzy', 'unknown')), -- 会/模糊/不会
  review_type TEXT CHECK (review_type IN ('flashcard', 'game', 'test', 'reading')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reviews_user_vocab ON vocabulary_reviews(user_id, vocabulary_id);
ALTER TABLE vocabulary_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own reviews" ON vocabulary_reviews USING (auth.uid() = user_id);
```

---

#### 📖 `user_books` - 用户书架
存储用户导入的书籍。

```sql
CREATE TABLE user_books (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  cover_emoji TEXT, -- 封面 emoji
  file_path TEXT, -- Supabase Storage 路径
  total_pages INTEGER,
  current_page INTEGER DEFAULT 0, -- 阅读进度
  progress DECIMAL(5,2) DEFAULT 0, -- 进度百分比
  unfamiliar_words_count INTEGER DEFAULT 0, -- 陌生词汇数量
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_books_user ON user_books(user_id);
ALTER TABLE user_books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own books" ON user_books USING (auth.uid() = user_id);
```

---

#### 📄 `book_unfamiliar_words` - 书籍陌生词汇表
存储每本书识别出的陌生词汇。

```sql
CREATE TABLE book_unfamiliar_words (
  id BIGSERIAL PRIMARY KEY,
  book_id BIGINT NOT NULL REFERENCES user_books(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  context TEXT, -- 上下文（句子）
  page_number INTEGER,
  is_learned BOOLEAN DEFAULT FALSE, -- 是否已学会
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_book_words_book ON book_unfamiliar_words(book_id);
```

---

#### 📈 `study_records` - 学习记录
记录每日学习活动，用于生成热度图。

```sql
CREATE TABLE study_records (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  study_date DATE NOT NULL,
  study_duration INTEGER DEFAULT 0, -- 学习时长（分钟）
  vocabulary_learned INTEGER DEFAULT 0, -- 学了几个词
  listening_minutes INTEGER DEFAULT 0, -- 听力分钟数
  speaking_minutes INTEGER DEFAULT 0, -- 口语分钟数
  reading_pages INTEGER DEFAULT 0, -- 阅读页数
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, study_date)
);

CREATE INDEX idx_study_records_user_date ON study_records(user_id, study_date);
ALTER TABLE study_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own study records" ON study_records USING (auth.uid() = user_id);
```

---

#### 🔊 `listening_content` - 听力内容库
存储听力练习内容。

```sql
CREATE TABLE listening_content (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT, -- TED, 新闻, 课程, 学习
  audio_url TEXT, -- Supabase Storage 路径
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  difficulty TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  vocabulary_count INTEGER, -- 词汇量要求
  transcript TEXT, -- 文本/歌词
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

#### 💬 `speaking_dialogues` - 口语对话记录
存储用户与 AI 的对话历史。

```sql
CREATE TABLE speaking_dialogues (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scene TEXT NOT NULL, -- 场景：咖啡店、机场等
  messages JSONB NOT NULL, -- [{ role: 'user', content: '...' }, { role: 'assistant', content: '...' }]
  grammar_corrections JSONB, -- AI 纠错记录
  score JSONB, -- { fluency: 4, grammar: 3, vocabulary: 5, ... }
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dialogues_user ON speaking_dialogues(user_id);
ALTER TABLE speaking_dialogues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own dialogues" ON speaking_dialogues USING (auth.uid() = user_id);
```

---

#### 🧠 `grammar_progress` - 语法学习进度
记录用户在语法知识树中的进度。

```sql
CREATE TABLE grammar_progress (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL, -- 节点 ID（如 'tenses-intro'）
  status TEXT CHECK (status IN ('locked', 'in_progress', 'completed')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, node_id)
);

CREATE INDEX idx_grammar_progress_user ON grammar_progress(user_id);
ALTER TABLE grammar_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own grammar progress" ON grammar_progress USING (auth.uid() = user_id);
```

---

#### 📊 `vocab_test_results` - 词汇量测试结果
保存词汇量测试的历史结果。

```sql
CREATE TABLE vocab_test_results (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  estimated_vocabulary INTEGER NOT NULL, -- 预估词汇量
  test_type TEXT, -- 'reading_comprehension' 或 'flashcard'
  score JSONB, -- 详细分数
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_test_results_user ON vocab_test_results(user_id);
ALTER TABLE vocab_test_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own test results" ON vocab_test_results USING (auth.uid() = user_id);
```

---

#### 🔖 `user_translations` - 翻译历史
保存用户的翻译记录。

```sql
CREATE TABLE user_translations (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  source_lang TEXT DEFAULT 'en',
  target_lang TEXT DEFAULT 'zh',
  unfamiliar_words TEXT[], -- 识别出的陌生词汇
  is_starred BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_translations_user ON user_translations(user_id);
ALTER TABLE user_translations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own translations" ON user_translations USING (auth.uid() = user_id);
```

---

#### 🎨 `saved_mnemonics` - AI 速记收藏
保存用户收藏的 AI 生成记忆故事。

```sql
CREATE TABLE saved_mnemonics (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_words TEXT[] NOT NULL, -- 目标单词
  story TEXT NOT NULL, -- AI 生成的故事
  image_url TEXT, -- AI 生成的配图 URL
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mnemonics_user ON saved_mnemonics(user_id);
ALTER TABLE saved_mnemonics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own mnemonics" ON saved_mnemonics USING (auth.uid() = user_id);
```

---

### 2.3 Supabase Storage Buckets

创建以下存储桶：

1. **`avatars`** - 用户头像
   - 公开读，用户仅能上传自己的文件
   
2. **`books`** - 用户导入的 PDF 书籍
   - 私有，用户仅能访问自己的文件

3. **`audio`** - 听力音频文件
   - 公开读（用于共享内容）

---

## 3. 开发任务清单

### 🎯 Phase 5: Supabase 集成 + 核心功能实现

#### Task 5.1: Supabase 项目初始化 ⏳
- [ ] 创建 Supabase 项目（使用提供的连接字符串）
- [ ] 执行数据库迁移（创建所有表）
- [ ] 配置行级安全策略（RLS）
- [ ] 创建 Storage Buckets（avatars, books, audio）
- [ ] 获取 Supabase API Key 和 URL
- [ ] 在项目中安装 `@supabase/supabase-js`
- [ ] 创建 `src/lib/supabase.ts` 客户端文件

#### Task 5.2: 用户认证系统 🔐
- [ ] 实现注册功能（邮箱 + 密码）
- [ ] 实现登录功能（集成 Supabase Auth）
- [ ] 实现登出功能
- [ ] 添加密码重置功能
- [ ] 创建受保护路由组件（ProtectedRoute）
- [ ] 实现登录状态持久化
- [ ] 创建注册页 `/register`
- [ ] 添加第三方登录（可选：Google OAuth）

#### Task 5.3: 个人资料管理 👤
- [ ] 从 Supabase 读取用户资料（`profiles` 表）
- [ ] 创建个人资料编辑页 `/profile-edit`
- [ ] 实现头像上传（Supabase Storage）
- [ ] 实现昵称修改
- [ ] 计算用户等级（基于学习数据）
- [ ] 更新个人页统计数据（实时）

#### Task 5.4: 学习页数据绑定 📊
- [ ] 从 `study_records` 读取热度图数据
- [ ] 实现学习时长计时器
- [ ] 保存每日学习记录
- [ ] 从 `user_books` 读取图书馆书籍
- [ ] 创建设置页 `/settings`

#### Task 5.5: 翻译页数据持久化 📖
- [ ] 保存翻译历史到 `user_translations`
- [ ] 实现收藏功能（starred 字段）
- [ ] 一键收录陌生词汇到 `user_vocabulary`
- [ ] 集成 TTS API（发音功能）
- [ ] 翻译历史列表分页

#### Task 5.6: 词库页数据库集成 📚
- [ ] 从 `user_vocabulary` 读取用户词汇
- [ ] 实现筛选功能（全部/收藏/AI 分类）
- [ ] 实现收藏/取消收藏（更新 starred）
- [ ] 实时更新熟练度（基于 `vocabulary_reviews`）
- [ ] 实现删除词汇功能
- [ ] 词汇详情弹窗增强（显示学习历史）

#### Task 5.7: 阅读器模块数据库集成 📕
- [ ] 实现 PDF 上传（Supabase Storage `books` 桶）
- [ ] 从 `user_books` 读取书架
- [ ] 保存阅读进度（`current_page`, `progress`）
- [ ] AI 提取陌生词汇（保存到 `book_unfamiliar_words`）
- [ ] 从数据库读取陌生词汇列表（阅读准备页）
- [ ] 阅读界面实时更新词汇熟练度
- [ ] 书签功能

#### Task 5.8: 卡片学习 + 艾宾浩斯算法 🃏
- [ ] 实现艾宾浩斯复习算法
  - [ ] 计算下次复习时间（1天、2天、4天、7天、15天）
  - [ ] 根据结果（会/模糊/不会）调整复习间隔
- [ ] 卡片学习保存复习记录到 `vocabulary_reviews`
- [ ] 更新词汇 `next_review_at` 和 `mastery_level`
- [ ] 艾宾浩斯看板数据绑定（7天计划）
- [ ] 今日待学/待复习列表从数据库读取

#### Task 5.9: 词汇游戏实现 🎮
- [ ] 创建 4 个游戏页面：
  - [ ] `/game/match` - 单词连连看
  - [ ] `/game/spell` - 拼写挑战
  - [ ] `/game/listen` - 听音辨词
  - [ ] `/game/flash` - 限时闪电
- [ ] 实现游戏逻辑
- [ ] 保存游戏成绩
- [ ] 排行榜数据库集成

#### Task 5.10: AI 速记数据持久化 🧠
- [ ] 保存收藏的速记故事到 `saved_mnemonics`
- [ ] 历史场景列表从数据库读取
- [ ] 集成 TTS API（朗读故事）

#### Task 5.11: 听力模块数据库集成 🎧
- [ ] 从 `listening_content` 读取听力内容
- [ ] 实现音频播放器（支持后台播放）
- [ ] 保存播放进度
- [ ] 听力统计数据绑定
- [ ] 听歌填字答案验证 + 成绩保存
- [ ] 创建"转化图书为博客"页面 `/book-to-blog`

#### Task 5.12: 口语模块数据库集成 🗣️
- [ ] 从 `speaking_dialogues` 读取对话历史
- [ ] 保存对话记录（包括 AI 纠错）
- [ ] 实现语音输入（Web Speech API / STT SDK）
- [ ] 复述练习语音评分（集成 STT + AI 评分）
- [ ] 场景选择页 AI 能力评估数据绑定
- [ ] 快捷场景编辑功能（保存到用户偏好表）

#### Task 5.13: 语法模块数据库集成 🌳
- [ ] 从 `grammar_progress` 读取学习进度
- [ ] 实现节点解锁逻辑
- [ ] 创建语法课程页 `/grammar/lesson`
- [ ] 保存学习进度

#### Task 5.14: 词汇测试数据库集成 📊
- [ ] 阅读理解测试题目从数据库读取
- [ ] 词汇量测试算法实现
- [ ] 保存测试结果到 `vocab_test_results`
- [ ] 生成测试报告页
- [ ] AI 词汇分类结果保存

#### Task 5.15: 性能优化与错误处理 ⚡
- [ ] 实现数据缓存（React Query / SWR）
- [ ] 添加加载状态组件
- [ ] 添加错误边界（Error Boundary）
- [ ] 离线模式支持（PWA）
- [ ] 图片懒加载
- [ ] 数据分页优化

#### Task 5.16: Web 端页面开发（Phase 5）🖥️
- [ ] 创建 Web 登录页 `/web-login`
- [ ] 创建 Web Dashboard `/dashboard`
- [ ] 创建 AI 翻译设置页 `/translate-settings`
- [ ] 创建浏览器翻译演示页 `/browser-demo`
- [ ] 创建产品官网 Landing Page `/landing`
- [ ] Web 端响应式布局优化

#### Task 5.17: 测试与部署 🚀
- [ ] 单元测试（关键功能）
- [ ] 端到端测试（核心流程）
- [ ] 性能测试
- [ ] 安全审计（RLS 策略验证）
- [ ] 生产环境部署（Vercel + Supabase）
- [ ] 监控与日志（Sentry）

---

### 📅 预估时间表

| 任务组 | 预估时长 | 优先级 |
|--------|---------|--------|
| 5.1 Supabase 初始化 | 2 小时 | ⭐⭐⭐ 最高 |
| 5.2 用户认证系统 | 8 小时 | ⭐⭐⭐ 最高 |
| 5.3 个人资料管理 | 4 小时 | ⭐⭐ 高 |
| 5.4 学习页数据绑定 | 4 小时 | ⭐⭐ 高 |
| 5.5 翻译页数据持久化 | 4 小时 | ⭐⭐ 高 |
| 5.6 词库页数据库集成 | 6 小时 | ⭐⭐ 高 |
| 5.7 阅读器模块 | 12 小时 | ⭐⭐ 高 |
| 5.8 艾宾浩斯算法 | 8 小时 | ⭐⭐⭐ 最高 |
| 5.9 词汇游戏实现 | 16 小时 | ⭐ 中 |
| 5.10 AI 速记持久化 | 3 小时 | ⭐ 中 |
| 5.11 听力模块 | 12 小时 | ⭐⭐ 高 |
| 5.12 口语模块 | 16 小时 | ⭐⭐ 高 |
| 5.13 语法模块 | 6 小时 | ⭐ 中 |
| 5.14 词汇测试 | 8 小时 | ⭐ 中 |
| 5.15 性能优化 | 8 小时 | ⭐⭐ 高 |
| 5.16 Web 端开发 | 20 小时 | ⭐ 中 |
| 5.17 测试与部署 | 12 小时 | ⭐⭐ 高 |

**总计：约 150 小时**

---

## 🎯 下一步行动

1. **立即开始：Supabase 项目初始化**（Task 5.1）
2. **第二优先级：用户认证系统**（Task 5.2）
3. **第三优先级：艾宾浩斯算法 + 词库集成**（Task 5.8 + 5.6）

---

## 📝 备注

- 所有 AI 功能（翻译、对话、分类）已接入 Moonshot API，无需重新开发
- Supabase 连接字符串：`postgresql://postgres:[YOUR-PASSWORD]@db.xdhnerwnceeubijpuiqv.supabase.co:5432/postgres`
- 需要配置 `.env` 文件：`VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`
- TTS（语音合成）可使用 Web Speech API 或第三方服务（如 Azure TTS）
- STT（语音识别）可使用 Web Speech API 或 Moonshot Audio API（如果支持）
