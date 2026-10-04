import { describe, expect, it } from 'vitest'
import { variantForDate } from '../variant'
import type { LevelText } from '../types'

const day = (n: number): number => new Date(2026, 0, 1 + n, 12, 0, 0, 0).getTime()

const mk = (mark: string): LevelText => ({
  start: [mark],
  target: [mark],
  cursor: { line: 0, col: 0 },
  parKeys: 'x',
})

describe('variantForDate（PLAN §2.4B）', () => {
  it('隔天必换（×2 变体交替，不假设起始奇偶）', () => {
    const texts = [mk('A'), mk('B')]
    const d0 = variantForDate(texts, day(0))
    expect(variantForDate(texts, day(1))).not.toBe(d0)
    expect(variantForDate(texts, day(2))).toBe(d0)
    expect(variantForDate(texts, day(3))).not.toBe(d0)
  })

  it('同日内任意时刻取值稳定（会话内稳定）', () => {
    const texts = [mk('A'), mk('B')]
    const noon = day(5) // 本地正午
    const v = variantForDate(texts, noon)
    expect(variantForDate(texts, noon + 3_600_000)).toBe(v) // 13:00
    expect(variantForDate(texts, noon + 11 * 3_600_000)).toBe(v) // 23:00 仍是同一本地日
  })

  it('单变体恒返回它（ch1 未配变体的已知妥协）', () => {
    const texts = [mk('only')]
    expect(variantForDate(texts, day(0))).toBe(texts[0])
    expect(variantForDate(texts, day(99))).toBe(texts[0])
  })

  it('空 texts 是内容错误，立即失败', () => {
    expect(() => variantForDate([], day(0))).toThrow()
  })
})
