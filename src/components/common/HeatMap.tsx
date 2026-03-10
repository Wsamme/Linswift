/**
 * 学习热度图组件
 * 设计稿参考：screen-learn 中的 3行 x 12列 GitHub 风格热度图
 * 颜色从浅到深：#F0F0F0 -> #FFE4C4 -> #FFB366 -> #FF8400 -> #CC6A00
 *
 * 支持两种模式：
 * 1. 传入真实数据（data prop）—— 从数据库读取
 * 2. 不传数据时显示默认 mock 数据
 */

// 强度对应颜色（0=无数据, 1-4=由浅到深）
const colors = ['#F0F0F0', '#FFE4C4', '#FFB366', '#FF8400', '#CC6A00']

// 默认 mock 数据（3行 x 12列）
const defaultData: number[][] = [
  [0, 1, 2, 3, 1, 0, 2, 3, 1, 2, 0, 1],
  [2, 3, 1, 0, 2, 3, 1, 2, 3, 0, 1, 2],
  [1, 0, 3, 2, 1, 2, 0, 1, 2, 3, 2, 3],
]

interface HeatMapProps {
  /**
   * 热度数据 —— 一维数组，每个元素 0-4 表示强度
   * 会自动拆分为 3 行（每行 Math.ceil(data.length / 3) 列）
   * 如果不传则使用默认 mock 数据
   */
  data?: number[]
}

export default function HeatMap({ data }: HeatMapProps) {
  // 将一维数组拆分为 3 行
  let grid: number[][]
  if (data && data.length > 0) {
    const cols = Math.ceil(data.length / 3)
    grid = [
      data.slice(0, cols),
      data.slice(cols, cols * 2),
      data.slice(cols * 2, cols * 3),
    ]
  } else {
    grid = defaultData
  }

  return (
    <div className="flex flex-col gap-[4px]">
      {grid.map((row, i) => (
        <div key={i} className="flex gap-[4px]">
          {row.map((level, j) => (
            <div
              key={j}
              className="w-[22px] h-[22px] rounded-[4px]"
              style={{ backgroundColor: colors[Math.min(level, 4)] }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
