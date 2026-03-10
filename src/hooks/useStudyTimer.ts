/**
 * useStudyTimer - 全局学习计时器 hook
 *
 * 功能：
 * 1. 每分钟自动将学习时长写入 study_records 表
 * 2. 用户只要停留在受保护页面即认为在学习
 * 3. 页面卸载或关闭时也会尝试上报（beforeunload）
 *
 * 使用方式：在 AppShell 或 ProtectedRoute 中调用
 */

import { useEffect, useRef, useCallback } from 'react'
import { useStudyRecords } from './useStudyRecords'
import { useAuth } from '../contexts/AuthContext'

export function useStudyTimer() {
  const { user } = useAuth()
  const { recordStudy } = useStudyRecords()
  const minutesRef = useRef(0) // 本次会话已累积的分钟数

  // ===== 上报学习时长 =====
  const flush = useCallback(async () => {
    if (!user || minutesRef.current <= 0) return
    const minutes = minutesRef.current
    minutesRef.current = 0 // 重置（避免重复上报）
    try {
      await recordStudy({ study_duration: minutes })
    } catch {
      // 上报失败不影响用户体验
    }
  }, [user, recordStudy])

  useEffect(() => {
    if (!user) return

    // 每 60 秒累加 1 分钟
    const interval = setInterval(() => {
      minutesRef.current += 1
    }, 60 * 1000)

    // 每 5 分钟上报一次
    const flushInterval = setInterval(() => {
      flush()
    }, 5 * 60 * 1000)

    // 页面关闭/卸载时也尝试上报
    const handleUnload = () => {
      if (minutesRef.current > 0) {
        // 使用 sendBeacon 确保在页面关闭时也能发送
        // 但 Supabase SDK 不支持 sendBeacon，降级为 async flush
        flush()
      }
    }
    window.addEventListener('beforeunload', handleUnload)

    return () => {
      clearInterval(interval)
      clearInterval(flushInterval)
      window.removeEventListener('beforeunload', handleUnload)
      flush() // 组件卸载时上报
    }
  }, [user, flush])

  return { minutesThisSession: minutesRef.current }
}
