-- V4: Fix vocab_test_results persistence (RLS + constraints)

-- 1) Ensure table exists (no-op if already created)
CREATE TABLE IF NOT EXISTS vocab_test_results (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  estimated_vocabulary INTEGER NOT NULL,
  test_type TEXT,
  score JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) Ensure test_type accepts current app value
--    Historical schemas may have stricter check constraints.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'vocab_test_results'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%test_type%'
  LOOP
    EXECUTE format('ALTER TABLE vocab_test_results DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE vocab_test_results
  ADD CONSTRAINT vocab_test_results_test_type_check
  CHECK (test_type IS NULL OR test_type IN ('reading_comprehension', 'flashcard', 'mixed'));

-- 3) RLS policies: read + insert own rows
ALTER TABLE vocab_test_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own test results" ON vocab_test_results;
CREATE POLICY "Users can view own test results"
  ON vocab_test_results FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own test results" ON vocab_test_results;
CREATE POLICY "Users can insert own test results"
  ON vocab_test_results FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 4) Helpful index
CREATE INDEX IF NOT EXISTS idx_vocab_test_results_user_created
  ON vocab_test_results(user_id, created_at DESC);
