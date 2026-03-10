/**
 * Supabase 客户端配置
 * 
 * 使用说明：
 * 1. 在 Supabase Dashboard 创建项目后，获取 URL 和 ANON KEY
 * 2. 在 .env 文件中配置：
 *    VITE_SUPABASE_URL=你的项目URL
 *    VITE_SUPABASE_ANON_KEY=你的anon key
 * 3. 在组件中导入使用：
 *    import { supabase } from '@/lib/supabase'
 */

import { createClient } from '@supabase/supabase-js'

// 从环境变量读取 Supabase 配置
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 检查环境变量是否配置
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase 环境变量未配置！')
  console.error('请在 .env 文件中添加：')
  console.error('  VITE_SUPABASE_URL=你的项目URL')
  console.error('  VITE_SUPABASE_ANON_KEY=你的anon key')
}

// 创建 Supabase 客户端实例
export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    // 持久化会话到 localStorage
    persistSession: true,
    // 自动刷新 token
    autoRefreshToken: true,
    // 检测会话恢复
    detectSessionInUrl: true,
  },
})

// =============================================================================
// 类型定义（根据数据库表结构）
// =============================================================================

/**
 * 用户资料表
 */
export interface Profile {
  id: string // UUID
  username: string | null
  avatar_url: string | null
  level: number
  total_study_days: number
  total_study_hours: number
  vocabulary_count: number
  created_at: string
  updated_at: string
}

/**
 * 用户词汇表
 */
export interface UserVocabulary {
  id: number
  user_id: string
  word: string
  phonetic: string | null
  meaning: string | null
  example_sentence: string | null
  source: 'translate' | 'reading' | 'manual' | 'test' | 'ai'
  starred: boolean
  mastery_level: number // 0-5
  scene_tags: string[] | null
  next_review_at: string | null
  review_count: number
  created_at: string
  updated_at: string
}

/**
 * 词汇复习记录
 */
export interface VocabularyReview {
  id: number
  user_id: string
  vocabulary_id: number
  result: 'known' | 'fuzzy' | 'unknown'
  review_type: 'flashcard' | 'game' | 'test' | 'reading' | 'ai'
  created_at: string
}

/**
 * 用户书架
 */
export interface UserBook {
  id: number
  user_id: string
  title: string
  author: string | null
  cover_emoji: string
  file_path: string | null
  /** PDF 提取的全文内容（纯文本） */
  content_text: string | null
  total_pages: number | null
  current_page: number
  progress: number
  unfamiliar_words_count: number
  created_at: string
  updated_at: string
}

/**
 * 学习记录（热度图）
 */
export interface StudyRecord {
  id: number
  user_id: string
  study_date: string // YYYY-MM-DD
  study_duration: number // 分钟
  vocabulary_learned: number
  listening_minutes: number
  speaking_minutes: number
  reading_pages: number
  created_at: string
}

/**
 * 听力内容
 */
export interface ListeningContent {
  id: number
  title: string
  category: 'ted' | 'news' | 'course' | 'study' | 'music'
  audio_url: string | null
  thumbnail_url: string | null
  duration_seconds: number | null
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  vocabulary_count: number | null
  transcript: string | null
  created_at: string
}

/**
 * 口语对话记录
 */
export interface SpeakingDialogue {
  id: number
  user_id: string
  scene: string
  messages: { role: string; content: string }[]
  grammar_corrections: any
  score: any
  created_at: string
}

/**
 * 翻译历史
 */
export interface UserTranslation {
  id: number
  user_id: string
  source_text: string
  translated_text: string
  source_lang: string
  target_lang: string
  unfamiliar_words: string[] | null
  is_starred: boolean
  created_at: string
}

/**
 * 用户设置
 */
export interface UserSettings {
  id: number
  user_id: string
  daily_goal_minutes: number
  reminder_time: string
  notification_enabled: boolean
  auto_translate: boolean
  auto_collect_words: boolean
  theme: 'light' | 'dark' | 'auto'
  created_at: string
  updated_at: string
}

// =============================================================================
// 辅助函数
// =============================================================================

/**
 * 获取当前登录用户
 * @returns 用户对象或 null
 */
export async function getCurrentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/**
 * 检查用户是否已登录
 * @returns boolean
 */
export async function isAuthenticated() {
  const user = await getCurrentUser()
  return !!user
}

/**
 * 登出
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

/**
 * 上传文件到 Supabase Storage
 * @param bucket - 存储桶名称 ('avatars', 'books', 'audio')
 * @param path - 文件路径
 * @param file - 文件对象
 * @returns 公开 URL
 */
export async function uploadFile(bucket: string, path: string, file: File) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: true,
  })

  if (error) throw error

  // 获取公开 URL
  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(path)

  return publicUrl
}

/**
 * 删除文件
 * @param bucket - 存储桶名称
 * @param path - 文件路径
 */
export async function deleteFile(bucket: string, path: string) {
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) throw error
}
