import { describe, expect, it } from 'vitest'
import { starsFor } from '../stars'

const f = (keys: number, par: number, usedHint = false, usedUndo = false) =>
  starsFor({ keys, par, usedHint, usedUndo })

describe('starsFor（PLAN §2.2）', () => {
  it('击键 ≤ par 且无提示无撤销 → 3 星', () => {
    expect(f(4, 4)).toBe(3)
    expect(f(2, 4)).toBe(3)
  })

  it('看提示 → 封顶 1 星（即使击键 = par）', () => {
    expect(f(4, 4, true)).toBe(1)
    expect(f(1, 4, true)).toBe(1)
  })

  it('撤销挡 3 星不挡 2 星', () => {
    expect(f(4, 4, false, true)).toBe(2)
    expect(f(6, 4, false, true)).toBe(2)
    expect(f(7, 4, false, true)).toBe(1)
  })

  it('2 星阈值 ≤ 1.5×par（par 为奇数不放宽）', () => {
    expect(f(7, 5)).toBe(2) // 7 ≤ 7.5
    expect(f(8, 5)).toBe(1) // 8 > 7.5
    expect(f(6, 4)).toBe(2) // 6 ≤ 6
    expect(f(7, 4)).toBe(1)
  })

  it('完成即得 1 星', () => {
    expect(f(100, 4)).toBe(1)
  })
})
