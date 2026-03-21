-- =============================================================================
-- Linswift Grammar V2 Migration
-- 目标：
-- 1) 支持 grammar node -> micro unit -> example -> exercise 结构化内容
-- 2) 支持记录用户语法练习尝试、错因统计、复习队列
-- 3) 为长难句与语法路径联动预留 source_ref / metadata 字段
-- =============================================================================

CREATE TABLE IF NOT EXISTS grammar_units (
  id BIGSERIAL PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES grammar_nodes(node_id) ON DELETE CASCADE,
  unit_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  objective TEXT,
  formula_lines TEXT[] DEFAULT '{}',
  scenario_lines TEXT[] DEFAULT '{}',
  contrast_lines TEXT[] DEFAULT '{}',
  mistake_lines TEXT[] DEFAULT '{}',
  error_tags TEXT[] DEFAULT '{}',
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grammar_units_node ON grammar_units(node_id, order_index);

ALTER TABLE grammar_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view grammar units" ON grammar_units;
CREATE POLICY "Anyone can view grammar units"
  ON grammar_units FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS grammar_examples (
  id BIGSERIAL PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES grammar_nodes(node_id) ON DELETE CASCADE,
  unit_id TEXT REFERENCES grammar_units(unit_id) ON DELETE SET NULL,
  example_id TEXT UNIQUE NOT NULL,
  sentence TEXT NOT NULL,
  translation TEXT,
  note TEXT,
  source_type TEXT CHECK (source_type IN ('core', 'reader', 'imported')) DEFAULT 'core',
  source_ref TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grammar_examples_node ON grammar_examples(node_id, order_index);

ALTER TABLE grammar_examples ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view grammar examples" ON grammar_examples;
CREATE POLICY "Anyone can view grammar examples"
  ON grammar_examples FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS grammar_exercises (
  id BIGSERIAL PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES grammar_nodes(node_id) ON DELETE CASCADE,
  unit_id TEXT REFERENCES grammar_units(unit_id) ON DELETE SET NULL,
  exercise_id TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('choice', 'cloze', 'correction', 'rewrite')),
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  source_sentence TEXT,
  options JSONB,
  answer_payload JSONB,
  explanation TEXT,
  error_tag TEXT,
  required BOOLEAN DEFAULT TRUE,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grammar_exercises_node ON grammar_exercises(node_id, order_index);

ALTER TABLE grammar_exercises ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view grammar exercises" ON grammar_exercises;
CREATE POLICY "Anyone can view grammar exercises"
  ON grammar_exercises FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS grammar_attempts (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL REFERENCES grammar_nodes(node_id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL,
  answer_payload JSONB,
  is_correct BOOLEAN NOT NULL,
  error_tag TEXT,
  review_source TEXT CHECK (review_source IN ('lesson', 'review_queue', 'long_sentence')) DEFAULT 'lesson',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grammar_attempts_user_node ON grammar_attempts(user_id, node_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_grammar_attempts_user_error ON grammar_attempts(user_id, error_tag, created_at DESC);

ALTER TABLE grammar_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own grammar attempts" ON grammar_attempts;
CREATE POLICY "Users can manage own grammar attempts"
  ON grammar_attempts USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS grammar_review_queue (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL REFERENCES grammar_nodes(node_id) ON DELETE CASCADE,
  review_key TEXT NOT NULL,
  exercise_id TEXT,
  error_tag TEXT,
  source_type TEXT CHECK (source_type IN ('lesson', 'long_sentence')) DEFAULT 'lesson',
  source_ref TEXT,
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT CHECK (status IN ('pending', 'done', 'skipped')) DEFAULT 'pending',
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, review_key)
);

CREATE INDEX IF NOT EXISTS idx_grammar_review_queue_due ON grammar_review_queue(user_id, status, due_at);

ALTER TABLE grammar_review_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own grammar review queue" ON grammar_review_queue;
CREATE POLICY "Users can manage own grammar review queue"
  ON grammar_review_queue USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS grammar_error_stats (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  error_tag TEXT NOT NULL,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  corrected_count INTEGER NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, error_tag)
);

CREATE INDEX IF NOT EXISTS idx_grammar_error_stats_user ON grammar_error_stats(user_id, wrong_count DESC);

ALTER TABLE grammar_error_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own grammar error stats" ON grammar_error_stats;
CREATE POLICY "Users can manage own grammar error stats"
  ON grammar_error_stats USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION increment_grammar_error_stat(
  p_user_id UUID,
  p_error_tag TEXT,
  p_wrong_delta INTEGER DEFAULT 0,
  p_corrected_delta INTEGER DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO grammar_error_stats (
    user_id,
    error_tag,
    wrong_count,
    corrected_count,
    last_seen_at,
    updated_at
  )
  VALUES (
    p_user_id,
    p_error_tag,
    GREATEST(p_wrong_delta, 0),
    GREATEST(p_corrected_delta, 0),
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, error_tag) DO UPDATE
  SET
    wrong_count = grammar_error_stats.wrong_count + GREATEST(p_wrong_delta, 0),
    corrected_count = grammar_error_stats.corrected_count + GREATEST(p_corrected_delta, 0),
    last_seen_at = NOW(),
    updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION increment_grammar_error_stat(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_grammar_error_stat(UUID, TEXT, INTEGER, INTEGER) TO authenticated;
