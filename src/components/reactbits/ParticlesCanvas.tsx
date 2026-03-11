/**
 * ParticlesCanvas — 纯 Canvas 2D 粒子动态背景
 *
 * 不依赖 WebGL / OGL，100% 兼容所有浏览器（Safari、Firefox、Chrome）
 * 发光粒子 + 连线网络 + 鼠标交互
 */
import { useEffect, useRef, useCallback } from 'react'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  color: string
  alpha: number
  glowRadius: number
}

interface ParticlesCanvasProps {
  particleCount?: number
  colors?: string[]
  speed?: number
  connectDistance?: number
  maxRadius?: number
  minRadius?: number
  className?: string
}

export default function ParticlesCanvas({
  particleCount = 80,
  colors = ['#FF8400', '#FF9E33', '#FFB866', '#8B5CF6', '#3B82F6'],
  speed = 0.4,
  connectDistance = 150,
  maxRadius = 4,
  minRadius = 2,
  className = '',
}: ParticlesCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const mouseRef = useRef({ x: -1000, y: -1000 })
  const animIdRef = useRef(0)

  const initParticles = useCallback((w: number, h: number) => {
    const arr: Particle[] = []
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2
      const spd = (0.2 + Math.random() * 0.8) * speed
      const r = minRadius + Math.random() * (maxRadius - minRadius)
      arr.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        radius: r,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 0.6 + Math.random() * 0.4,
        glowRadius: r * (3 + Math.random() * 4),
      })
    }
    particlesRef.current = arr
  }, [particleCount, colors, speed, maxRadius, minRadius])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const w = parent.clientWidth
      const h = parent.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      initParticles(w, h)
    }

    resize()
    window.addEventListener('resize', resize)

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    const handleMouseLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 }
    }
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseleave', handleMouseLeave)

    const draw = () => {
      animIdRef.current = requestAnimationFrame(draw)
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      ctx.clearRect(0, 0, w, h)

      const particles = particlesRef.current
      const mx = mouseRef.current.x
      const my = mouseRef.current.y

      // 先画连线（在粒子下面）
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j]
          const dx = p.x - p2.x
          const dy = p.y - p2.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < connectDistance) {
            const lineAlpha = (1 - dist / connectDistance) * 0.3
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(p2.x, p2.y)
            ctx.strokeStyle = p.color
            ctx.globalAlpha = lineAlpha
            ctx.lineWidth = 1
            ctx.stroke()
          }
        }
      }

      // 再画粒子（带发光光晕）
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]

        // 鼠标斥力
        const dmx = p.x - mx
        const dmy = p.y - my
        const distMouse = Math.sqrt(dmx * dmx + dmy * dmy)
        if (distMouse < 120) {
          const force = (120 - distMouse) / 120 * 1.0
          p.vx += (dmx / distMouse) * force
          p.vy += (dmy / distMouse) * force
        }

        p.vx *= 0.99
        p.vy *= 0.99
        p.x += p.vx
        p.y += p.vy

        if (p.x < 0) { p.x = 0; p.vx *= -1 }
        if (p.x > w) { p.x = w; p.vx *= -1 }
        if (p.y < 0) { p.y = 0; p.vy *= -1 }
        if (p.y > h) { p.y = h; p.vy *= -1 }

        // 发光光晕（径向渐变）
        ctx.globalAlpha = 1
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.glowRadius)
        grad.addColorStop(0, p.color + 'AA')
        grad.addColorStop(0.4, p.color + '44')
        grad.addColorStop(1, p.color + '00')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.glowRadius, 0, Math.PI * 2)
        ctx.fill()

        // 实心粒子核心
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.globalAlpha = p.alpha
        ctx.fill()
      }

      ctx.globalAlpha = 1
    }

    animIdRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(animIdRef.current)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [initParticles, connectDistance])

  return (
    <canvas
      ref={canvasRef}
      className={`block w-full h-full ${className}`}
    />
  )
}
