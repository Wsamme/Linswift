-- =============================================================================
-- Linswift V2 数据库迁移脚本
-- =============================================================================
-- 说明：在 Supabase SQL Editor 中执行此脚本
-- 此脚本是 V1 supabase-migration.sql 的补充，用于修复和新增 V2 功能
-- =============================================================================

-- ============= 1. 修复 profiles 表 RLS 策略 =============
-- 问题：ensureProfile 使用 upsert 但缺少 INSERT 策略

-- 允许用户创建自己的 profile（注册时需要）
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============= 2. 修复 study_records 表 RLS 策略 =============
-- 问题：recordStudy 使用 upsert 但只有 SELECT 策略

DROP POLICY IF EXISTS "Users can insert own study records" ON study_records;
CREATE POLICY "Users can insert own study records"
  ON study_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own study records" ON study_records;
CREATE POLICY "Users can update own study records"
  ON study_records FOR UPDATE
  USING (auth.uid() = user_id);

-- ============= 3. 修复 vocabulary_reviews 表 RLS 策略 =============
-- 问题：addReview 需要 INSERT 策略

DROP POLICY IF EXISTS "Users can insert own reviews" ON vocabulary_reviews;
CREATE POLICY "Users can insert own reviews"
  ON vocabulary_reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============= 4. 修复 user_settings 表 RLS 策略 =============
-- 问题：ensureProfile 中 upsert user_settings 需要 INSERT 策略

DROP POLICY IF EXISTS "Users can insert own settings" ON user_settings;
CREATE POLICY "Users can insert own settings"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own settings" ON user_settings;
CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- ============= 5. 为 user_books 添加 content_text 字段（V2 PDF 功能） =============
-- 用于存储 PDF 提取的全文文本

ALTER TABLE user_books ADD COLUMN IF NOT EXISTS content_text TEXT;

-- 修复 user_books 的 RLS 策略（需要 INSERT）
DROP POLICY IF EXISTS "Users can insert own books" ON user_books;
CREATE POLICY "Users can insert own books"
  ON user_books FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own books" ON user_books;
CREATE POLICY "Users can update own books"
  ON user_books FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own books" ON user_books;
CREATE POLICY "Users can delete own books"
  ON user_books FOR DELETE
  USING (auth.uid() = user_id);

-- ============= 6. 创建 Storage Buckets =============
-- Supabase Storage buckets 通过 storage API 创建

-- 创建 avatars 桶（公开读，用户可上传自己的头像）
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 创建 books 桶（私有，用户只能访问自己的文件）
INSERT INTO storage.buckets (id, name, public)
VALUES ('books', 'books', false)
ON CONFLICT (id) DO NOTHING;

-- 创建 audio 桶（公开读，听力资源）
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio', 'audio', true)
ON CONFLICT (id) DO NOTHING;

-- ============= 7. Storage RLS 策略 =============

-- ----- avatars 桶策略 -----
-- 所有人可以查看头像（公开读）
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- 用户只能上传到自己的文件夹（路径以 user_id 开头）
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 用户只能更新自己的头像
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 用户只能删除自己的头像
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ----- books 桶策略 -----
-- 用户只能查看自己的书籍
DROP POLICY IF EXISTS "Users can view own books files" ON storage.objects;
CREATE POLICY "Users can view own books files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'books'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 用户只能上传到自己的文件夹
DROP POLICY IF EXISTS "Users can upload own books" ON storage.objects;
CREATE POLICY "Users can upload own books"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'books'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 用户只能删除自己的书籍文件
DROP POLICY IF EXISTS "Users can delete own books files" ON storage.objects;
CREATE POLICY "Users can delete own books files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'books'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- =============================================================================
-- V2 迁移完成！
-- =============================================================================
-- 执行此脚本后：
-- ✅ profiles 表支持客户端 INSERT（注册流程正常工作）
-- ✅ study_records 支持 INSERT/UPDATE（学习记录可写入）
-- ✅ vocabulary_reviews 支持 INSERT（复习记录可写入）
-- ✅ user_books 有 content_text 字段（PDF 文本提取功能）
-- ✅ avatars/books/audio Storage 桶已创建并配置权限
-- ✅ 头像可公开访问，用户只能管理自己文件夹下的文件
-- =============================================================================
