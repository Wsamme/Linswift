/**
 * useAuth - 快捷获取认证状态的 hook
 *
 * 直接从 AuthContext 导出，方便使用：
 *   import { useAuth } from '../hooks/useAuth'
 *   const { user, signIn, signOut } = useAuth()
 */
export { useAuth } from '../contexts/AuthContext'
