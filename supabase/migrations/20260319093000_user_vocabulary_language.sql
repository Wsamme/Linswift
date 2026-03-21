ALTER TABLE user_vocabulary
  ADD COLUMN IF NOT EXISTS language_code TEXT,
  ADD COLUMN IF NOT EXISTS language_label TEXT;

UPDATE user_vocabulary
SET language_code = CASE
  WHEN word ~ '[ぁ-ゖァ-ヺー]' THEN 'ja'
  WHEN word ~ '[가-힣]' THEN 'ko'
  WHEN word ~ '[一-龥々〆ヵヶ]' THEN 'zh'
  WHEN word ~ '[A-Za-z]' THEN 'en'
  ELSE 'und'
END
WHERE language_code IS NULL;

UPDATE user_vocabulary
SET language_label = CASE
  WHEN language_code IN ('zh', 'zh-CN', 'zh-Hans') THEN '简中'
  WHEN language_code IN ('zh-TW', 'zh-HK', 'zh-Hant') THEN '繁中'
  WHEN language_code = 'ja' THEN '日本語'
  WHEN language_code = 'ko' THEN '한국어'
  WHEN language_code = 'und' THEN '未分类'
  ELSE 'English'
END
WHERE language_label IS NULL;

ALTER TABLE user_vocabulary
  ALTER COLUMN language_code SET DEFAULT 'en',
  ALTER COLUMN language_label SET DEFAULT 'English';

ALTER TABLE user_vocabulary
  DROP CONSTRAINT IF EXISTS user_vocabulary_user_id_word_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_vocabulary_user_id_word_language_code_key'
  ) THEN
    ALTER TABLE user_vocabulary
      ADD CONSTRAINT user_vocabulary_user_id_word_language_code_key
      UNIQUE (user_id, word, language_code);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_user_vocab_user_language
  ON user_vocabulary(user_id, language_code);
