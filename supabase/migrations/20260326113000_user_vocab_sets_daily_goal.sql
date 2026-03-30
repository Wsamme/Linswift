-- =============================================================================
-- Per-wordbook / per-set daily learning goal
-- =============================================================================

ALTER TABLE user_vocab_sets
  ADD COLUMN IF NOT EXISTS daily_new_goal INTEGER;

ALTER TABLE user_vocab_sets
  DROP CONSTRAINT IF EXISTS user_vocab_sets_daily_new_goal_positive;

ALTER TABLE user_vocab_sets
  ADD CONSTRAINT user_vocab_sets_daily_new_goal_positive
  CHECK (daily_new_goal IS NULL OR daily_new_goal BETWEEN 1 AND 500);

COMMENT ON COLUMN user_vocab_sets.daily_new_goal
  IS 'Optional per-set daily new-word goal. Null means fallback to the global learning pace.';
