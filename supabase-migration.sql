-- =============================================================================
-- Linswift Supabase 数据库迁移脚本
-- =============================================================================
-- 说明：在 Supabase SQL Editor 中按顺序执行此脚本
-- 执行前请确保已登录 Supabase 项目后台
-- =============================================================================

-- ============= 1. 用户资料表 =============

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  avatar_url TEXT,
  level INTEGER DEFAULT 1,
  total_study_days INTEGER DEFAULT 0,
  total_study_hours DECIMAL(10,2) DEFAULT 0,
  vocabulary_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 行级安全策略（RLS）
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- 触发器：自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 触发器：用户注册时自动创建 profile
CREATE OR REPLACE FUNCTION create_profile_for_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_profile_for_user();

-- ============= 2. 用户词汇表 =============

CREATE TABLE IF NOT EXISTS user_vocabulary (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  phonetic TEXT,
  meaning TEXT,
  example_sentence TEXT,
  source TEXT CHECK (source IN ('translate', 'reading', 'manual', 'test', 'ai')),
  starred BOOLEAN DEFAULT FALSE,
  mastery_level INTEGER DEFAULT 0 CHECK (mastery_level BETWEEN 0 AND 5),
  scene_tags TEXT[],
  next_review_at TIMESTAMPTZ,
  review_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, word)
);

CREATE INDEX IF NOT EXISTS idx_user_vocab_user ON user_vocabulary(user_id);
CREATE INDEX IF NOT EXISTS idx_user_vocab_next_review ON user_vocabulary(next_review_at);
CREATE INDEX IF NOT EXISTS idx_user_vocab_starred ON user_vocabulary(user_id, starred) WHERE starred = true;

ALTER TABLE user_vocabulary ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own vocabulary" ON user_vocabulary;
CREATE POLICY "Users can manage own vocabulary" ON user_vocabulary USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_user_vocabulary_updated_at ON user_vocabulary;
CREATE TRIGGER update_user_vocabulary_updated_at BEFORE UPDATE ON user_vocabulary
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============= 3. 词汇复习记录 =============

CREATE TABLE IF NOT EXISTS vocabulary_reviews (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vocabulary_id BIGINT NOT NULL REFERENCES user_vocabulary(id) ON DELETE CASCADE,
  result TEXT NOT NULL CHECK (result IN ('known', 'fuzzy', 'unknown')),
  review_type TEXT CHECK (review_type IN ('flashcard', 'game', 'test', 'reading', 'ai')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_user_vocab ON vocabulary_reviews(user_id, vocabulary_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created ON vocabulary_reviews(created_at);

ALTER TABLE vocabulary_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own reviews" ON vocabulary_reviews;
CREATE POLICY "Users can view own reviews" ON vocabulary_reviews USING (auth.uid() = user_id);

-- ============= 4. 用户书架 =============

CREATE TABLE IF NOT EXISTS user_books (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  cover_emoji TEXT DEFAULT '📖',
  file_path TEXT,
  total_pages INTEGER,
  current_page INTEGER DEFAULT 0,
  progress DECIMAL(5,2) DEFAULT 0,
  unfamiliar_words_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_books_user ON user_books(user_id);
CREATE INDEX IF NOT EXISTS idx_books_progress ON user_books(user_id, progress);

ALTER TABLE user_books ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own books" ON user_books;
CREATE POLICY "Users can manage own books" ON user_books USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_user_books_updated_at ON user_books;
CREATE TRIGGER update_user_books_updated_at BEFORE UPDATE ON user_books
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============= 5. 书籍陌生词汇表 =============

CREATE TABLE IF NOT EXISTS book_unfamiliar_words (
  id BIGSERIAL PRIMARY KEY,
  book_id BIGINT NOT NULL REFERENCES user_books(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  context TEXT,
  page_number INTEGER,
  is_learned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_book_words_book ON book_unfamiliar_words(book_id);
CREATE INDEX IF NOT EXISTS idx_book_words_learned ON book_unfamiliar_words(book_id, is_learned);

-- ============= 6. 学习记录（热度图） =============

CREATE TABLE IF NOT EXISTS study_records (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  study_date DATE NOT NULL,
  study_duration INTEGER DEFAULT 0,
  vocabulary_learned INTEGER DEFAULT 0,
  listening_minutes INTEGER DEFAULT 0,
  speaking_minutes INTEGER DEFAULT 0,
  reading_pages INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, study_date)
);

CREATE INDEX IF NOT EXISTS idx_study_records_user_date ON study_records(user_id, study_date);

ALTER TABLE study_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own study records" ON study_records;
CREATE POLICY "Users can view own study records" ON study_records USING (auth.uid() = user_id);

-- ============= 7. 听力内容库（公共） =============

CREATE TABLE IF NOT EXISTS listening_content (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT CHECK (category IN ('ted', 'news', 'course', 'study', 'music')),
  audio_url TEXT,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  difficulty TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  vocabulary_count INTEGER,
  transcript TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listening_category ON listening_content(category);
CREATE INDEX IF NOT EXISTS idx_listening_difficulty ON listening_content(difficulty);

-- 公共读权限（所有登录用户可读）
ALTER TABLE listening_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view listening content" ON listening_content;
CREATE POLICY "Anyone can view listening content" ON listening_content FOR SELECT TO authenticated USING (true);

-- ============= 8. 听力进度记录 =============

CREATE TABLE IF NOT EXISTS listening_progress (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id BIGINT NOT NULL REFERENCES listening_content(id) ON DELETE CASCADE,
  current_position INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, content_id)
);

CREATE INDEX IF NOT EXISTS idx_listening_progress_user ON listening_progress(user_id);

ALTER TABLE listening_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own listening progress" ON listening_progress;
CREATE POLICY "Users can manage own listening progress" ON listening_progress USING (auth.uid() = user_id);

-- ============= 9. 口语对话记录 =============

CREATE TABLE IF NOT EXISTS speaking_dialogues (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scene TEXT NOT NULL,
  messages JSONB NOT NULL,
  grammar_corrections JSONB,
  score JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dialogues_user ON speaking_dialogues(user_id);
CREATE INDEX IF NOT EXISTS idx_dialogues_scene ON speaking_dialogues(user_id, scene);

ALTER TABLE speaking_dialogues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own dialogues" ON speaking_dialogues;
CREATE POLICY "Users can manage own dialogues" ON speaking_dialogues USING (auth.uid() = user_id);

-- ============= 10. 语法学习进度 =============

CREATE TABLE IF NOT EXISTS grammar_progress (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  status TEXT CHECK (status IN ('locked', 'in_progress', 'completed')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_grammar_progress_user ON grammar_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_grammar_progress_status ON grammar_progress(user_id, status);

ALTER TABLE grammar_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own grammar progress" ON grammar_progress;
CREATE POLICY "Users can manage own grammar progress" ON grammar_progress USING (auth.uid() = user_id);

-- ============= 11. 词汇量测试结果 =============

CREATE TABLE IF NOT EXISTS vocab_test_results (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  estimated_vocabulary INTEGER NOT NULL,
  test_type TEXT CHECK (test_type IN ('reading_comprehension', 'flashcard', 'mixed')),
  score JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_test_results_user ON vocab_test_results(user_id);

ALTER TABLE vocab_test_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own test results" ON vocab_test_results;
CREATE POLICY "Users can view own test results" ON vocab_test_results USING (auth.uid() = user_id);

-- ============= 12. 翻译历史 =============

CREATE TABLE IF NOT EXISTS user_translations (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  source_lang TEXT DEFAULT 'en',
  target_lang TEXT DEFAULT 'zh',
  unfamiliar_words TEXT[],
  is_starred BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_translations_user ON user_translations(user_id);
CREATE INDEX IF NOT EXISTS idx_translations_starred ON user_translations(user_id, is_starred) WHERE is_starred = true;

ALTER TABLE user_translations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own translations" ON user_translations;
CREATE POLICY "Users can manage own translations" ON user_translations USING (auth.uid() = user_id);

-- ============= 13. AI 速记收藏 =============

CREATE TABLE IF NOT EXISTS saved_mnemonics (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_words TEXT[] NOT NULL,
  story TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mnemonics_user ON saved_mnemonics(user_id);

ALTER TABLE saved_mnemonics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own mnemonics" ON saved_mnemonics;
CREATE POLICY "Users can manage own mnemonics" ON saved_mnemonics USING (auth.uid() = user_id);

-- ============= 14. 游戏成绩记录 =============

CREATE TABLE IF NOT EXISTS game_scores (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL CHECK (game_type IN ('match', 'spell', 'listen', 'flash')),
  score INTEGER NOT NULL,
  duration_seconds INTEGER,
  words_practiced TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_scores_user ON game_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_game_scores_type ON game_scores(game_type, score DESC);

ALTER TABLE game_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own game scores" ON game_scores;
DROP POLICY IF EXISTS "Users can view leaderboard" ON game_scores;
CREATE POLICY "Users can view own game scores" ON game_scores FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view leaderboard" ON game_scores FOR SELECT USING (true);

-- ============= 15. 用户设置 =============

CREATE TABLE IF NOT EXISTS user_settings (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_goal_minutes INTEGER DEFAULT 30,
  reminder_time TIME DEFAULT '19:00:00',
  notification_enabled BOOLEAN DEFAULT TRUE,
  auto_translate BOOLEAN DEFAULT TRUE,
  auto_collect_words BOOLEAN DEFAULT TRUE,
  theme TEXT DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'auto')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own settings" ON user_settings;
CREATE POLICY "Users can manage own settings" ON user_settings USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 触发器：用户注册时自动创建默认设置
CREATE OR REPLACE FUNCTION create_settings_for_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_settings (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_created ON profiles;
CREATE TRIGGER on_profile_created
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION create_settings_for_user();

-- =============================================================================
-- Storage Buckets 创建（需要在 Supabase Storage UI 中手动创建或使用 API）
-- =============================================================================
-- 1. avatars - 用户头像（公开读）
-- 2. books - 用户书籍 PDF（私有）
-- 3. audio - 听力音频文件（公开读）

-- =============================================================================
-- 初始化示例数据（可选）
-- =============================================================================

-- 插入一些示例听力内容
INSERT INTO listening_content (title, category, duration_seconds, difficulty, vocabulary_count, transcript) VALUES
('Daily English Conversation', 'study', 180, 'beginner', 50, 'Hello, how are you? I am fine, thank you.'),
('TED: The Power of Vulnerability', 'ted', 1200, 'intermediate', 300, 'So I''ll start with this: a couple years ago, an event planner called me because I was going to do a speaking event...'),
('BBC News: Technology Update', 'news', 240, 'advanced', 150, 'In today''s technology news, scientists have developed a new AI system...')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 迁移完成！
-- =============================================================================
-- 下一步：
-- 1. 在 Supabase Dashboard > Storage 创建 3 个 buckets: avatars, books, audio
-- 2. 配置 .env 文件中的 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY
-- 3. 运行 `npm install @supabase/supabase-js`
-- =============================================================================
