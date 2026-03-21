-- V9: ensure game_scores exists and authenticated users can insert their own scores

CREATE TABLE IF NOT EXISTS game_scores (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL CHECK (game_type IN ('match', 'spell', 'listen', 'flash')),
  score INTEGER NOT NULL,
  duration_seconds INTEGER,
  words_practiced TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_scores_user
  ON game_scores(user_id);

CREATE INDEX IF NOT EXISTS idx_game_scores_type
  ON game_scores(game_type, score DESC);

ALTER TABLE game_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own game scores" ON game_scores;
CREATE POLICY "Users can view own game scores"
  ON game_scores
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view leaderboard" ON game_scores;
CREATE POLICY "Users can view leaderboard"
  ON game_scores
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can insert own game scores" ON game_scores;
CREATE POLICY "Users can insert own game scores"
  ON game_scores
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
