export type DiffRowType = 'same' | 'del' | 'add'

export interface DiffRow {
  type: DiffRowType
  text: string
}

/**
 * 行级 unified diff（LCS）：from = 当前缓冲区，to = 目标。
 * del = 当前多出的行（红、删除线、− 前缀），add = 还差的目标行（绿、+ 前缀）。
 * 第二通道是 +/− 前缀本身，颜色不单独承载差异（PLAN §8.2 硬条款）。
 */
export function diffLines(from: readonly string[], to: readonly string[]): DiffRow[] {
  const n = from.length
  const m = to.length
  // lcs[i][j] = LCS 长度（from 前 i 行 vs to 前 j 行）
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = from[i] === to[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }
  const rows: DiffRow[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (from[i] === to[j]) {
      rows.push({ type: 'same', text: to[j]! })
      i++
      j++
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      rows.push({ type: 'del', text: from[i]! })
      i++
    } else {
      rows.push({ type: 'add', text: to[j]! })
      j++
    }
  }
  while (i < n) rows.push({ type: 'del', text: from[i++]! })
  while (j < m) rows.push({ type: 'add', text: to[j++]! })
  return rows
}
