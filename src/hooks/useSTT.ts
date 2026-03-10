/**
 * useSTT — 语音识别 React Hook
 *
 * 封装 Web Speech API，提供响应式的语音识别状态和控制方法。
 *
 * 用法：
 *   const { isListening, transcript, startListening, stopListening } = useSTT()
 *   // 点击按钮开始录音
 *   <button onClick={() => isListening ? stopListening() : startListening()}>
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  isSTTSupported,
  startRecognition,
  stopRecognition,
} from '../lib/stt'

interface UseSTTOptions {
  /** 识别语言，默认 'en-US' */
  lang?: string
  /** 是否持续识别，默认 false（说完一句自动停止） */
  continuous?: boolean
}

interface UseSTTReturn {
  /** 浏览器是否支持 STT */
  supported: boolean
  /** 是否正在录音/识别 */
  isListening: boolean
  /** 最终确认的识别文本 */
  transcript: string
  /** 实时中间结果（还没确认的部分） */
  interimTranscript: string
  /** 错误信息（麦克风权限等） */
  error: string | null
  /** 开始识别 */
  startListening: () => void
  /** 停止识别 */
  stopListening: () => void
  /** 清空所有文本 */
  resetTranscript: () => void
}

export function useSTT(options?: UseSTTOptions): UseSTTReturn {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  // 用 ref 追踪已积累的最终文本，避免闭包问题
  const accumulatedRef = useRef('')

  // 组件卸载时自动停止识别
  useEffect(() => {
    return () => {
      stopRecognition()
    }
  }, [])

  /** 开始语音识别 */
  const startListening = useCallback(() => {
    setError(null)
    setInterimTranscript('')

    const success = startRecognition({
      lang: options?.lang || 'en-US',
      continuous: options?.continuous ?? false,
      interimResults: true,

      onResult: (text, isFinal) => {
        if (isFinal) {
          // 最终结果：追加到已确认文本
          accumulatedRef.current = accumulatedRef.current
            ? accumulatedRef.current + ' ' + text
            : text
          setTranscript(accumulatedRef.current)
          setInterimTranscript('')
        } else {
          // 中间结果：仅显示，不保存
          setInterimTranscript(text)
        }
      },

      onError: (msg) => {
        setError(msg)
        setIsListening(false)
      },

      onEnd: () => {
        setIsListening(false)
        setInterimTranscript('')
      },
    })

    if (success) {
      setIsListening(true)
    }
  }, [options?.lang, options?.continuous])

  /** 停止语音识别 */
  const stopListening = useCallback(() => {
    stopRecognition()
    setIsListening(false)
    setInterimTranscript('')
  }, [])

  /** 清空所有识别文本 */
  const resetTranscript = useCallback(() => {
    accumulatedRef.current = ''
    setTranscript('')
    setInterimTranscript('')
    setError(null)
  }, [])

  return {
    supported: isSTTSupported(),
    isListening,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  }
}
