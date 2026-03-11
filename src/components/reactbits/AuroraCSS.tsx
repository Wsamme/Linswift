/**
 * AuroraCSS — 纯 CSS 极光动态背景
 *
 * 不依赖 WebGL，100% 兼容所有浏览器
 * 使用 CSS 动画 + 渐变模糊实现流光效果
 */

interface AuroraCSSProps {
  colors?: [string, string, string]
  className?: string
}

export default function AuroraCSS({
  colors = ['#FF8400', '#FF6000', '#8B5CF6'],
  className = '',
}: AuroraCSSProps) {
  return (
    <div className={`w-full h-full overflow-hidden relative ${className}`}>
      {/* 三层渐变色块，各自不同速度和方向的动画 */}
      <div
        className="absolute w-[120%] h-[120%] -left-[10%] -top-[10%] rounded-full blur-3xl animate-[aurora-drift_8s_ease-in-out_infinite_alternate]"
        style={{
          background: `radial-gradient(ellipse at 30% 50%, ${colors[0]}60, transparent 70%)`,
        }}
      />
      <div
        className="absolute w-[100%] h-[140%] -right-[10%] -top-[20%] rounded-full blur-3xl animate-[aurora-drift_12s_ease-in-out_infinite_alternate-reverse]"
        style={{
          background: `radial-gradient(ellipse at 70% 40%, ${colors[1]}50, transparent 70%)`,
        }}
      />
      <div
        className="absolute w-[80%] h-[100%] left-[10%] -bottom-[20%] rounded-full blur-3xl animate-[aurora-drift_10s_ease-in-out_infinite_alternate]"
        style={{
          background: `radial-gradient(ellipse at 50% 60%, ${colors[2]}40, transparent 70%)`,
        }}
      />

      {/* 内联 keyframes */}
      <style>{`
        @keyframes aurora-drift {
          0% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(3%, -5%) scale(1.05); }
          100% { transform: translate(-3%, 5%) scale(0.95); }
        }
      `}</style>
    </div>
  )
}
