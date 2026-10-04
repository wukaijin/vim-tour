import type { Stars } from './types'

export interface StarFactors {
  keys: number
  par: number
  usedHint: boolean
  usedUndo: boolean
}

/**
 * 星级判定（PLAN §2.2）：
 * - 3 星：击键 ≤ par 且未看提示且未用撤销；
 * - 看任一级提示 → 封顶 1 星；
 * - 撤销只挡 3 星（u 自由使用，PLAN §6）；
 * - 2 星：击键 ≤ 1.5 × par（按实数比较，par 为奇数时不四舍五入放宽）；
 * - 1 星：完成即得。
 */
export function starsFor(f: StarFactors): Stars {
  if (f.usedHint) return 1
  if (f.keys <= f.par && !f.usedUndo) return 3
  if (f.keys <= f.par * 1.5) return 2
  return 1
}
