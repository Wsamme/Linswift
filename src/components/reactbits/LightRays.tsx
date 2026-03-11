/**
 * LightRays — WebGL 光线背景效果
 *
 * 来源：https://reactbits.dev/backgrounds/light-rays
 * 基于 OGL (WebGL1)，Safari / Chrome / Firefox 均兼容
 */
import { useRef, useEffect, useState } from 'react'
import { Renderer, Program, Triangle, Mesh } from 'ogl'

export type RaysOrigin =
  | 'top-center' | 'top-left' | 'top-right'
  | 'right' | 'left'
  | 'bottom-center' | 'bottom-right' | 'bottom-left'

interface LightRaysProps {
  raysOrigin?: RaysOrigin
  raysColor?: string
  raysSpeed?: number
  lightSpread?: number
  rayLength?: number
  pulsating?: boolean
  fadeDistance?: number
  saturation?: number
  followMouse?: boolean
  mouseInfluence?: number
  noiseAmount?: number
  distortion?: number
  className?: string
}

const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m
    ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255]
    : [1, 1, 1]
}

type Vec2 = [number, number]

const getAnchorAndDir = (
  origin: RaysOrigin, w: number, h: number
): { anchor: Vec2; dir: Vec2 } => {
  const out = 0.2
  switch (origin) {
    case 'top-left':     return { anchor: [0, -out * h], dir: [0, 1] }
    case 'top-right':    return { anchor: [w, -out * h], dir: [0, 1] }
    case 'left':         return { anchor: [-out * w, 0.5 * h], dir: [1, 0] }
    case 'right':        return { anchor: [(1 + out) * w, 0.5 * h], dir: [-1, 0] }
    case 'bottom-left':  return { anchor: [0, (1 + out) * h], dir: [0, -1] }
    case 'bottom-center':return { anchor: [0.5 * w, (1 + out) * h], dir: [0, -1] }
    case 'bottom-right': return { anchor: [w, (1 + out) * h], dir: [0, -1] }
    default:             return { anchor: [0.5 * w, -out * h], dir: [0, 1] }
  }
}

const VERT = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`

const FRAG = `precision highp float;

uniform float iTime;
uniform vec2  iResolution;
uniform vec2  rayPos;
uniform vec2  rayDir;
uniform vec3  raysColor;
uniform float raysSpeed;
uniform float lightSpread;
uniform float rayLength;
uniform float pulsating;
uniform float fadeDistance;
uniform float saturation;
uniform vec2  mousePos;
uniform float mouseInfluence;
uniform float noiseAmount;
uniform float distortion;

varying vec2 vUv;

float noise(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

float rayStrength(vec2 src, vec2 refDir, vec2 coord,
                  float seedA, float seedB, float speed) {
  vec2 s2c = coord - src;
  vec2 dn  = normalize(s2c);
  float ca = dot(dn, refDir);

  float da = ca + distortion * sin(iTime * 2.0 + length(s2c) * 0.01) * 0.2;
  float sf = pow(max(da, 0.0), 1.0 / max(lightSpread, 0.001));

  float dist = length(s2c);
  float maxD = iResolution.x * rayLength;
  float lf   = clamp((maxD - dist) / maxD, 0.0, 1.0);
  float ff   = clamp((iResolution.x * fadeDistance - dist) / (iResolution.x * fadeDistance), 0.5, 1.0);
  float pulse = pulsating > 0.5 ? (0.8 + 0.2 * sin(iTime * speed * 3.0)) : 1.0;

  float base = clamp(
    (0.45 + 0.15 * sin(da * seedA + iTime * speed)) +
    (0.3  + 0.2  * cos(-da * seedB + iTime * speed)),
    0.0, 1.0
  );

  return base * lf * ff * sf * pulse;
}

void main() {
  vec2 coord = vec2(gl_FragCoord.x, iResolution.y - gl_FragCoord.y);

  vec2 fd = rayDir;
  if (mouseInfluence > 0.0) {
    vec2 msp = mousePos * iResolution.xy;
    vec2 md  = normalize(msp - rayPos);
    fd = normalize(mix(rayDir, md, mouseInfluence));
  }

  vec4 r1 = vec4(1.0) * rayStrength(rayPos, fd, coord, 36.2214, 21.11349, 1.5 * raysSpeed);
  vec4 r2 = vec4(1.0) * rayStrength(rayPos, fd, coord, 22.3991, 18.0234, 1.1 * raysSpeed);

  vec4 c = r1 * 0.5 + r2 * 0.4;

  if (noiseAmount > 0.0) {
    float n = noise(coord * 0.01 + iTime * 0.1);
    c.rgb *= (1.0 - noiseAmount + noiseAmount * n);
  }

  float brightness = 1.0 - (coord.y / iResolution.y);
  c.x *= 0.1 + brightness * 0.8;
  c.y *= 0.3 + brightness * 0.6;
  c.z *= 0.5 + brightness * 0.5;

  if (saturation != 1.0) {
    float gray = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    c.rgb = mix(vec3(gray), c.rgb, saturation);
  }

  c.rgb *= raysColor;
  gl_FragColor = c;
}`

export default function LightRays({
  raysOrigin = 'top-center',
  raysColor = '#ffffff',
  raysSpeed = 1,
  lightSpread = 1,
  rayLength = 2,
  pulsating = false,
  fadeDistance = 1.0,
  saturation = 1.0,
  followMouse = true,
  mouseInfluence = 0.1,
  noiseAmount = 0.0,
  distortion = 0.0,
  className = '',
}: LightRaysProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef  = useRef<Renderer | null>(null)
  const uniformsRef  = useRef<Record<string, { value: unknown }> | null>(null)
  const meshRef      = useRef<Mesh | null>(null)
  const animRef      = useRef<number | null>(null)
  const mouseRef     = useRef({ x: 0.5, y: 0.5 })
  const smoothRef    = useRef({ x: 0.5, y: 0.5 })
  const cleanupRef   = useRef<(() => void) | null>(null)
  const [visible, setVisible] = useState(false)

  // IntersectionObserver: 只在可见时渲染
  useEffect(() => {
    if (!containerRef.current) return
    const obs = new IntersectionObserver(
      ([e]) => setVisible(e.isIntersecting),
      { threshold: 0.1 },
    )
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  // 初始化 WebGL
  useEffect(() => {
    if (!visible || !containerRef.current) return
    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null }

    const el = containerRef.current

    const renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio, 2), alpha: true })
    rendererRef.current = renderer
    const gl = renderer.gl
    gl.canvas.style.width = '100%'
    gl.canvas.style.height = '100%'

    while (el.firstChild) el.removeChild(el.firstChild)
    el.appendChild(gl.canvas)

    const uniforms: Record<string, { value: unknown }> = {
      iTime:          { value: 0 },
      iResolution:    { value: [1, 1] as Vec2 },
      rayPos:         { value: [0, 0] as Vec2 },
      rayDir:         { value: [0, 1] as Vec2 },
      raysColor:      { value: hexToRgb(raysColor) },
      raysSpeed:      { value: raysSpeed },
      lightSpread:    { value: lightSpread },
      rayLength:      { value: rayLength },
      pulsating:      { value: pulsating ? 1.0 : 0.0 },
      fadeDistance:    { value: fadeDistance },
      saturation:     { value: saturation },
      mousePos:       { value: [0.5, 0.5] as Vec2 },
      mouseInfluence: { value: mouseInfluence },
      noiseAmount:    { value: noiseAmount },
      distortion:     { value: distortion },
    }
    uniformsRef.current = uniforms

    const geometry = new Triangle(gl)
    const program  = new Program(gl, { vertex: VERT, fragment: FRAG, uniforms })
    const mesh     = new Mesh(gl, { geometry, program })
    meshRef.current = mesh

    const resize = () => {
      if (!el || !renderer) return
      renderer.dpr = Math.min(window.devicePixelRatio, 2)
      const { clientWidth: cw, clientHeight: ch } = el
      renderer.setSize(cw, ch)
      const dpr = renderer.dpr
      const w = cw * dpr, h = ch * dpr
      ;(uniforms.iResolution.value as Vec2)[0] = w
      ;(uniforms.iResolution.value as Vec2)[1] = h
      const { anchor, dir } = getAnchorAndDir(raysOrigin, w, h)
      uniforms.rayPos.value = anchor
      uniforms.rayDir.value = dir
    }

    const loop = (t: number) => {
      if (!rendererRef.current || !meshRef.current) return
      uniforms.iTime.value = t * 0.001
      if (followMouse && mouseInfluence > 0) {
        const s = 0.92
        smoothRef.current.x = smoothRef.current.x * s + mouseRef.current.x * (1 - s)
        smoothRef.current.y = smoothRef.current.y * s + mouseRef.current.y * (1 - s)
        ;(uniforms.mousePos.value as Vec2)[0] = smoothRef.current.x
        ;(uniforms.mousePos.value as Vec2)[1] = smoothRef.current.y
      }
      try { renderer.render({ scene: mesh }); animRef.current = requestAnimationFrame(loop) }
      catch { /* WebGL lost */ }
    }

    window.addEventListener('resize', resize)
    resize()
    animRef.current = requestAnimationFrame(loop)

    cleanupRef.current = () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
      try {
        const ext = gl.getExtension('WEBGL_lose_context')
        if (ext) ext.loseContext()
        if (gl.canvas.parentNode) gl.canvas.parentNode.removeChild(gl.canvas)
      } catch { /* ignore */ }
      rendererRef.current = null
      uniformsRef.current = null
      meshRef.current = null
    }

    return () => { if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null } }
  }, [
    visible, raysOrigin, raysColor, raysSpeed, lightSpread,
    rayLength, pulsating, fadeDistance, saturation,
    followMouse, mouseInfluence, noiseAmount, distortion,
  ])

  // 鼠标跟踪
  useEffect(() => {
    if (!followMouse) return
    const onMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const r = containerRef.current.getBoundingClientRect()
      mouseRef.current = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [followMouse])

  return <div ref={containerRef} className={`w-full h-full ${className}`} />
}
