/**
 * DotGrid — 交互式点阵网格背景
 *
 * 灵感来源：https://reactbits.dev/backgrounds/dot-grid
 * 纯 Canvas 2D 实现，不依赖 GSAP InertiaPlugin（付费插件），
 * 用弹性回弹动画替代，100% 兼容所有浏览器。
 *
 * 特性：
 * - 鼠标靠近时圆点变色
 * - 鼠标快速划过时圆点被弹开
 * - 点击产生冲击波
 * - 自动适配容器尺寸
 */
import { useRef, useEffect, useCallback, useMemo } from 'react'

interface Dot {
  cx: number
  cy: number
  offsetX: number
  offsetY: number
  velX: number
  velY: number
}

interface DotGridProps {
  dotSize?: number
  gap?: number
  baseColor?: string
  activeColor?: string
  baseAlpha?: number
  proximity?: number
  pushRadius?: number
  pushStrength?: number
  shockRadius?: number
  shockStrength?: number
  className?: string
}

function hexToRgb(hex: string) {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (!m) return { r: 0, g: 0, b: 0 }
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

export default function DotGrid({
  dotSize = 14,
  gap = 28,
  baseColor = '#FF8400',
  activeColor = '#FF6000',
  baseAlpha = 0.35,
  proximity = 140,
  pushRadius = 120,
  pushStrength = 6,
  shockRadius = 200,
  shockStrength = 8,
  className = '',
}: DotGridProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dotsRef = useRef<Dot[]>([])
  const animRef = useRef(0)

  const pointerRef = useRef({
    x: -9999, y: -9999,
    prevX: -9999, prevY: -9999,
    speed: 0,
  })

  const baseRgb = useMemo(() => hexToRgb(baseColor), [baseColor])
  const activeRgb = useMemo(() => hexToRgb(activeColor), [activeColor])

  const buildGrid = useCallback(() => {
    const wrap = wrapperRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    const { width, height } = wrap.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')
    if (ctx) ctx.scale(dpr, dpr)

    const cell = dotSize + gap
    const cols = Math.floor((width + gap) / cell)
    const rows = Math.floor((height + gap) / cell)

    const gridW = cell * cols - gap
    const gridH = cell * rows - gap
    const startX = (width - gridW) / 2 + dotSize / 2
    const startY = (height - gridH) / 2 + dotSize / 2

    const dots: Dot[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        dots.push({
          cx: startX + c * cell,
          cy: startY + r * cell,
          offsetX: 0, offsetY: 0,
          velX: 0, velY: 0,
        })
      }
    }
    dotsRef.current = dots
  }, [dotSize, gap])

  useEffect(() => {
    buildGrid()

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && wrapperRef.current) {
      ro = new ResizeObserver(buildGrid)
      ro.observe(wrapperRef.current)
    } else {
      window.addEventListener('resize', buildGrid)
    }
    return () => {
      if (ro) ro.disconnect()
      else window.removeEventListener('resize', buildGrid)
    }
  }, [buildGrid])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const pr = pointerRef.current
      pr.prevX = pr.x
      pr.prevY = pr.y
      pr.x = e.clientX - rect.left
      pr.y = e.clientY - rect.top
      const dx = pr.x - pr.prevX
      const dy = pr.y - pr.prevY
      pr.speed = Math.sqrt(dx * dx + dy * dy)

      // 快速移动时弹开附近圆点
      if (pr.speed > 8) {
        const dots = dotsRef.current
        for (const dot of dots) {
          const ddx = dot.cx - pr.x
          const ddy = dot.cy - pr.y
          const dist = Math.sqrt(ddx * ddx + ddy * ddy)
          if (dist < pushRadius && dist > 0) {
            const falloff = 1 - dist / pushRadius
            const strength = pushStrength * falloff * Math.min(pr.speed / 30, 3)
            dot.velX += (ddx / dist) * strength
            dot.velY += (ddy / dist) * strength
          }
        }
      }
    }

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      for (const dot of dotsRef.current) {
        const dx = dot.cx - cx
        const dy = dot.cy - cy
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < shockRadius && dist > 0) {
          const falloff = 1 - dist / shockRadius
          dot.velX += (dx / dist) * shockStrength * falloff
          dot.velY += (dy / dist) * shockStrength * falloff
        }
      }
    }

    window.addEventListener('mousemove', handleMove, { passive: true })
    window.addEventListener('click', handleClick)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('click', handleClick)
    }
  }, [pushRadius, pushStrength, shockRadius, shockStrength])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const proxSq = proximity * proximity
    const halfDot = dotSize / 2

    // 弹性系数 & 阻尼
    const stiffness = 0.08
    const damping = 0.85

    const draw = () => {
      animRef.current = requestAnimationFrame(draw)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      ctx.clearRect(0, 0, w, h)

      const { x: px, y: py } = pointerRef.current
      const dots = dotsRef.current

      for (const dot of dots) {
        // 弹性回弹物理
        const springX = -dot.offsetX * stiffness
        const springY = -dot.offsetY * stiffness
        dot.velX = (dot.velX + springX) * damping
        dot.velY = (dot.velY + springY) * damping
        dot.offsetX += dot.velX
        dot.offsetY += dot.velY

        // 微小偏移归零
        if (Math.abs(dot.offsetX) < 0.01 && Math.abs(dot.velX) < 0.01) {
          dot.offsetX = 0; dot.velX = 0
        }
        if (Math.abs(dot.offsetY) < 0.01 && Math.abs(dot.velY) < 0.01) {
          dot.offsetY = 0; dot.velY = 0
        }

        // 颜色：靠近鼠标时从 baseColor 渐变到 activeColor
        const ddx = dot.cx - px
        const ddy = dot.cy - py
        const dsq = ddx * ddx + ddy * ddy

        let r = baseRgb.r, g = baseRgb.g, b = baseRgb.b, a = baseAlpha
        if (dsq <= proxSq) {
          const t = 1 - Math.sqrt(dsq) / proximity
          r = Math.round(baseRgb.r + (activeRgb.r - baseRgb.r) * t)
          g = Math.round(baseRgb.g + (activeRgb.g - baseRgb.g) * t)
          b = Math.round(baseRgb.b + (activeRgb.b - baseRgb.b) * t)
          a = baseAlpha + t * (1 - baseAlpha)
        }

        ctx.beginPath()
        ctx.arc(dot.cx + dot.offsetX, dot.cy + dot.offsetY, halfDot, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r},${g},${b},${a})`
        ctx.fill()
      }
    }

    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current)
  }, [proximity, dotSize, baseRgb, activeRgb, baseAlpha])

  return (
    <div ref={wrapperRef} className={`w-full h-full ${className}`}>
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  )
}
