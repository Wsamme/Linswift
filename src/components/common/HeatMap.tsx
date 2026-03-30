/**
 * 学习热度图组件
 * 设计稿参考：screen-learn 中的 3行 x 12列 GitHub 风格热度图
 * 颜色从浅到深：#F0F0F0 -> #FFE4C4 -> #FFB366 -> #FF8400 -> #CC6A00
 *
 * 只渲染真实数据。
 * 若没有数据，则显示全 0 空白格，避免把演示数据误当成真实学习记录。
 */

// 强度对应颜色（0=无数据, 1-4=由浅到深）
const colors = ['#F0F0F0', '#FFE4C4', '#FFB366', '#FF8400', '#CC6A00']

interface HeatMapProps {
  /**
   * 热度数据 —— 一维数组，每个元素 0-4 表示强度
   * 会自动拆分为 3 行（每行 Math.ceil(data.length / 3) 列）
   * 不传时使用空白热力格
   */
  data?: number[]
  cellSizeClassName?: string
  gapClassName?: string
  fitToWidth?: boolean
  gapPx?: number
  maxCellSizePx?: number
}

export default function HeatMap({
  data,
  cellSizeClassName = 'w-[22px] h-[22px]',
  gapClassName = 'gap-[4px]',
  fitToWidth = false,
  gapPx = 4,
  maxCellSizePx = 24,
}: HeatMapProps) {
  const source = data && data.length > 0 ? data : Array.from({ length: 36 }, () => 0)
  const cols = Math.ceil(source.length / 3)
  const grid = [
    source.slice(0, cols),
    source.slice(cols, cols * 2),
    source.slice(cols * 2, cols * 3),
  ]

  return (
    <div
      className={fitToWidth ? 'flex w-full flex-col' : `flex flex-col ${gapClassName}`}
      style={fitToWidth ? { gap: `${gapPx}px` } : undefined}
    >
      {grid.map((row, i) => (
        <div
          key={i}
          className={fitToWidth ? 'grid w-full' : `flex ${gapClassName}`}
          style={
            fitToWidth
              ? {
                  gap: `${gapPx}px`,
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                }
              : undefined
          }
        >
          {row.map((level, j) => (
            <div
              key={j}
              className={fitToWidth ? 'aspect-square w-full rounded-[4px]' : `${cellSizeClassName} rounded-[4px]`}
              style={
                fitToWidth
                  ? {
                      backgroundColor: colors[Math.min(level, 4)],
                      maxWidth: `${maxCellSizePx}px`,
                      justifySelf: 'center',
                    }
                  : { backgroundColor: colors[Math.min(level, 4)] }
              }
            />
          ))}
        </div>
      ))}
    </div>
  )
}
