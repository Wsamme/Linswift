-- V6: review cycle settings (7/15 days)

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS review_cycle_days INTEGER NOT NULL DEFAULT 7;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'user_settings'::regclass
      AND conname = 'user_settings_review_cycle_days_check'
  ) THEN
    ALTER TABLE user_settings
      ADD CONSTRAINT user_settings_review_cycle_days_check
      CHECK (review_cycle_days IN (7, 15));
  END IF;
END $$;
