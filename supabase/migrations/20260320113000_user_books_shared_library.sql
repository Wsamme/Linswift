-- =============================================================================
-- Shared classics library support
-- =============================================================================
-- Public-domain classics are hosted as static assets and referenced by slug.
-- Supabase only stores each user's lightweight bookshelf row and reading progress.
-- =============================================================================

ALTER TABLE user_books
  ADD COLUMN IF NOT EXISTS shared_book_slug TEXT;

CREATE INDEX IF NOT EXISTS idx_user_books_shared_book_slug
  ON user_books(shared_book_slug);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_books_user_shared_book_slug
  ON user_books(user_id, shared_book_slug)
  WHERE shared_book_slug IS NOT NULL;
