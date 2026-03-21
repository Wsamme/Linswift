-- V8: Custom vocabulary sets (folders) + set-word mapping

CREATE TABLE IF NOT EXISTS user_vocab_sets (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_vocab_sets_user_created
  ON user_vocab_sets(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_vocab_sets_user_name
  ON user_vocab_sets(user_id, lower(name));

ALTER TABLE user_vocab_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own vocab sets" ON user_vocab_sets;
CREATE POLICY "Users can select own vocab sets"
  ON user_vocab_sets
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own vocab sets" ON user_vocab_sets;
CREATE POLICY "Users can insert own vocab sets"
  ON user_vocab_sets
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own vocab sets" ON user_vocab_sets;
CREATE POLICY "Users can update own vocab sets"
  ON user_vocab_sets
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own vocab sets" ON user_vocab_sets;
CREATE POLICY "Users can delete own vocab sets"
  ON user_vocab_sets
  FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_user_vocab_sets_updated_at ON user_vocab_sets;
CREATE TRIGGER update_user_vocab_sets_updated_at
  BEFORE UPDATE ON user_vocab_sets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS user_vocab_set_words (
  id BIGSERIAL PRIMARY KEY,
  set_id BIGINT NOT NULL REFERENCES user_vocab_sets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vocabulary_id BIGINT NOT NULL REFERENCES user_vocabulary(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(set_id, vocabulary_id)
);

CREATE INDEX IF NOT EXISTS idx_user_vocab_set_words_set
  ON user_vocab_set_words(set_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_vocab_set_words_user
  ON user_vocab_set_words(user_id);

ALTER TABLE user_vocab_set_words ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own set words" ON user_vocab_set_words;
CREATE POLICY "Users can select own set words"
  ON user_vocab_set_words
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own set words" ON user_vocab_set_words;
CREATE POLICY "Users can insert own set words"
  ON user_vocab_set_words
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own set words" ON user_vocab_set_words;
CREATE POLICY "Users can delete own set words"
  ON user_vocab_set_words
  FOR DELETE
  USING (auth.uid() = user_id);
