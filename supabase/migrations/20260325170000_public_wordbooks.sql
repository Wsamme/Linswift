-- =============================================================================
-- Public wordbooks library
-- =============================================================================

CREATE TABLE IF NOT EXISTS public_wordbooks (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  category TEXT NOT NULL,
  exam_type TEXT,
  difficulty_label TEXT,
  language_code TEXT NOT NULL DEFAULT 'en',
  word_count INTEGER NOT NULL DEFAULT 0,
  tags TEXT[] NOT NULL DEFAULT '{}',
  source_repo TEXT,
  source_license TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_wordbooks_category
  ON public_wordbooks(category, word_count DESC, created_at DESC);

ALTER TABLE public_wordbooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view wordbooks" ON public_wordbooks;
CREATE POLICY "Public can view wordbooks"
  ON public_wordbooks
  FOR SELECT
  USING (true);

DROP TRIGGER IF EXISTS update_public_wordbooks_updated_at ON public_wordbooks;
CREATE TRIGGER update_public_wordbooks_updated_at
  BEFORE UPDATE ON public_wordbooks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public_wordbook_words (
  id BIGSERIAL PRIMARY KEY,
  wordbook_id BIGINT NOT NULL REFERENCES public_wordbooks(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  meaning TEXT,
  phonetic TEXT,
  example_sentence TEXT,
  source_rank INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(wordbook_id, word)
);

CREATE INDEX IF NOT EXISTS idx_public_wordbook_words_wordbook_rank
  ON public_wordbook_words(wordbook_id, source_rank ASC, word ASC);

CREATE INDEX IF NOT EXISTS idx_public_wordbook_words_word
  ON public_wordbook_words(word);

ALTER TABLE public_wordbook_words ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view wordbook words" ON public_wordbook_words;
CREATE POLICY "Public can view wordbook words"
  ON public_wordbook_words
  FOR SELECT
  USING (true);

CREATE TABLE IF NOT EXISTS user_wordbooks (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wordbook_id BIGINT NOT NULL REFERENCES public_wordbooks(id) ON DELETE CASCADE,
  vocab_set_id BIGINT REFERENCES user_vocab_sets(id) ON DELETE SET NULL,
  imported_word_count INTEGER NOT NULL DEFAULT 0,
  last_imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, wordbook_id)
);

CREATE INDEX IF NOT EXISTS idx_user_wordbooks_user
  ON user_wordbooks(user_id, created_at DESC);

ALTER TABLE user_wordbooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own wordbooks" ON user_wordbooks;
CREATE POLICY "Users can select own wordbooks"
  ON user_wordbooks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own wordbooks" ON user_wordbooks;
CREATE POLICY "Users can insert own wordbooks"
  ON user_wordbooks
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own wordbooks" ON user_wordbooks;
CREATE POLICY "Users can update own wordbooks"
  ON user_wordbooks
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own wordbooks" ON user_wordbooks;
CREATE POLICY "Users can delete own wordbooks"
  ON user_wordbooks
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_user_wordbooks_updated_at ON user_wordbooks;
CREATE TRIGGER update_user_wordbooks_updated_at
  BEFORE UPDATE ON user_wordbooks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE user_vocab_sets
  ADD COLUMN IF NOT EXISTS source_wordbook_id BIGINT REFERENCES public_wordbooks(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS idx_user_vocab_sets_user_source_wordbook;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_vocab_sets_user_source_wordbook
  ON user_vocab_sets(user_id, source_wordbook_id);

CREATE OR REPLACE FUNCTION import_public_wordbook(book_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  target_book public_wordbooks%ROWTYPE;
  imported_set_id BIGINT;
  total_word_count INTEGER := 0;
  linked_word_count INTEGER := 0;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION '请先登录后再导入词本';
  END IF;

  SELECT *
  INTO target_book
  FROM public_wordbooks
  WHERE slug = book_slug;

  IF NOT FOUND THEN
    RAISE EXCEPTION '词本不存在：%', book_slug;
  END IF;

  INSERT INTO user_vocab_sets (user_id, name, source_wordbook_id)
  VALUES (current_user_id, target_book.title, target_book.id)
  ON CONFLICT (user_id, source_wordbook_id)
  DO UPDATE
    SET name = EXCLUDED.name,
        updated_at = NOW()
  RETURNING id INTO imported_set_id;

  WITH source_words AS (
    SELECT
      LOWER(TRIM(word)) AS word,
      NULLIF(TRIM(phonetic), '') AS phonetic,
      NULLIF(TRIM(meaning), '') AS meaning,
      NULLIF(TRIM(example_sentence), '') AS example_sentence
    FROM public_wordbook_words
    WHERE wordbook_id = target_book.id
  ), upserted_vocab AS (
    INSERT INTO user_vocabulary (
      user_id,
      word,
      language_code,
      language_label,
      phonetic,
      meaning,
      example_sentence,
      source
    )
    SELECT
      current_user_id,
      source_words.word,
      'en',
      'English',
      source_words.phonetic,
      source_words.meaning,
      source_words.example_sentence,
      'manual'
    FROM source_words
    ON CONFLICT (user_id, word, language_code)
    DO UPDATE
      SET phonetic = COALESCE(user_vocabulary.phonetic, EXCLUDED.phonetic),
          meaning = COALESCE(user_vocabulary.meaning, EXCLUDED.meaning),
          example_sentence = COALESCE(user_vocabulary.example_sentence, EXCLUDED.example_sentence),
          updated_at = NOW()
    RETURNING id
  )
  SELECT COUNT(*)
  INTO total_word_count
  FROM upserted_vocab;

  INSERT INTO user_vocab_set_words (set_id, user_id, vocabulary_id)
  SELECT
    imported_set_id,
    current_user_id,
    user_vocabulary.id
  FROM user_vocabulary
  INNER JOIN public_wordbook_words
    ON public_wordbook_words.wordbook_id = target_book.id
   AND public_wordbook_words.word = user_vocabulary.word
  WHERE user_vocabulary.user_id = current_user_id
    AND COALESCE(user_vocabulary.language_code, 'en') = 'en'
  ON CONFLICT (set_id, vocabulary_id) DO NOTHING;

  GET DIAGNOSTICS linked_word_count = ROW_COUNT;

  INSERT INTO user_wordbooks (
    user_id,
    wordbook_id,
    vocab_set_id,
    imported_word_count,
    last_imported_at
  )
  VALUES (
    current_user_id,
    target_book.id,
    imported_set_id,
    total_word_count,
    NOW()
  )
  ON CONFLICT (user_id, wordbook_id)
  DO UPDATE
    SET vocab_set_id = EXCLUDED.vocab_set_id,
        imported_word_count = EXCLUDED.imported_word_count,
        last_imported_at = NOW(),
        updated_at = NOW();

  RETURN jsonb_build_object(
    'wordbookId', target_book.id,
    'slug', target_book.slug,
    'title', target_book.title,
    'setId', imported_set_id,
    'totalWords', total_word_count,
    'linkedWords', linked_word_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION import_public_wordbook(TEXT) TO authenticated;
