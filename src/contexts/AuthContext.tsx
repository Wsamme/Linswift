/**
 * AuthContext - 全局认证状态管理
 *
 * 功能：
 * 1. 监听 Supabase 认证状态变化（登录/登出/刷新）
 * 2. 提供 user, loading, signIn, signUp, signOut 给所有子组件
 * 3. 自动从 localStorage 恢复会话（Supabase SDK 自带此功能）
 *
 * 使用方式：
 *   在 main.tsx 中用 <AuthProvider> 包裹 <App />
 *   在任意组件中：const { user, signIn, signOut } = useAuth()
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

// ===== Context 类型定义 =====
interface AuthContextType {
  /** 当前登录的用户对象，未登录时为 null */
  user: User | null
  /** 当前会话对象 */
  session: Session | null
  /** 是否正在加载认证状态（首次进入时为 true） */
  loading: boolean
  /** 邮箱+密码登录 */
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  /** 邮箱+密码注册（可选 username） */
  signUp: (email: string, password: string, username?: string) => Promise<{ error: string | null }>
  /** Google OAuth 登录 */
  signInWithGoogle: () => Promise<{ error: string | null }>
  /** Apple OAuth 登录 */
  signInWithApple: () => Promise<{ error: string | null }>
  /** 登出 */
  signOut: () => Promise<void>
}

// 创建 Context（默认值为 undefined，在 Provider 外使用时会报错）
const AuthContext = createContext<AuthContextType | undefined>(undefined)

// ===== Provider 组件 =====
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true) // 初始为 true，等待会话恢复

  /**
   * 确保用户在 profiles 和 user_settings 表有对应记录
   * 不再依赖数据库触发器，改为应用代码主动创建
   * 使用 upsert 保证幂等（多次调用不会出错）
   */
  const ensureProfile = useCallback(async (u: User) => {
    try {
      const username = u.user_metadata?.username || u.email?.split('@')[0] || 'User'
      // 用 upsert 保证幂等：如果已存在则不操作
      await supabase.from('profiles').upsert(
        { id: u.id, username },
        { onConflict: 'id', ignoreDuplicates: true }
      )
      await supabase.from('user_settings').upsert(
        { user_id: u.id },
        { onConflict: 'user_id', ignoreDuplicates: true }
      )
    } catch {
      // profile 创建失败不阻塞用户使用（降级运行）
      console.warn('ensureProfile 失败，降级运行')
    }
  }, [])

  // 监听认证状态变化
  useEffect(() => {
    // 1. 获取当前会话（从 localStorage 恢复）
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user) ensureProfile(s.user) // 确保 profile 存在
      setLoading(false)
    })

    // 2. 监听后续的认证事件（登录、登出、token 刷新等）
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s)
        setUser(s?.user ?? null)
        if (s?.user) ensureProfile(s.user) // 登录/注册后确保 profile
        setLoading(false)
      }
    )

    // 3. 组件卸载时取消监听
    return () => {
      subscription.unsubscribe()
    }
  }, [ensureProfile])

  // ===== 登录方法 =====
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      // 把 Supabase 的错误信息转为中文提示
      if (error.message.includes('Invalid login credentials')) {
        return { error: '邮箱或密码错误' }
      }
      if (error.message.includes('Email not confirmed')) {
        return { error: '请先验证邮箱' }
      }
      return { error: error.message }
    }
    return { error: null }
  }, [])

  // ===== 注册方法 =====
  const signUp = useCallback(async (email: string, password: string, username?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // 将 username 存储到 user_metadata，触发器会自动创建 profile
        data: { username: username || email.split('@')[0] },
      },
    })
    if (error) {
      if (error.message.includes('already registered')) {
        return { error: '该邮箱已注册' }
      }
      if (error.message.includes('Password should be')) {
        return { error: '密码至少需要 6 个字符' }
      }
      return { error: error.message }
    }
    return { error: null }
  }, [])

  // ===== Google OAuth 登录 =====
  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // 登录成功后跳转回当前域名的 /learn 页面
        redirectTo: `${window.location.origin}/learn`,
      },
    })
    if (error) return { error: error.message }
    return { error: null }
  }, [])

  // ===== Apple OAuth 登录 =====
  const signInWithApple = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: `${window.location.origin}/learn`,
      },
    })
    if (error) return { error: error.message }
    return { error: null }
  }, [])

  // ===== 登出方法 =====
  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, session, loading, signIn, signUp, signInWithGoogle, signInWithApple, signOut: handleSignOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// ===== 快捷 Hook =====
/**
 * 在组件中获取认证状态和方法
 * 必须在 <AuthProvider> 内部使用
 */
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth 必须在 <AuthProvider> 内部使用')
  }
  return context
}
