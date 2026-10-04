import { describe, expect, it } from 'vitest'
import { createMemoryStorage } from '../../storage/progress'
import { DAY_MS } from '../retention'
import { dismissWarmupToday, isWarmupDismissed, selectWarmup } from '../warmup'

describe('selectWarmup（PLAN §2.4C 选题规则）', () => {
  it('只选 due 的关卡，最多 3 题', () => {
    const ids = selectWarmup([
      { levelId: 'a', due: false, bestStars: 1, lastPlayedAt: 1 },
      { levelId: 'b', due: true, bestStars: 3, lastPlayedAt: 2 },
      { levelId: 'c', due: true, bestStars: 2, lastPlayedAt: 3 },
      { levelId: 'd', due: true, bestStars: 2, lastPlayedAt: 4 },
      { levelId: 'e', due: true, bestStars: 1, lastPlayedAt: 5 },
    ])
    expect(ids).toEqual(['e', 'c', 'd']) // bestStars 最低优先，同星按最旧
  })

  it('同星同 due 时 lastPlayedAt 最旧的排前', () => {
    expect(
      selectWarmup([
        { levelId: 'new', due: true, bestStars: 3, lastPlayedAt: 300 },
        { levelId: 'old', due: true, bestStars: 3, lastPlayedAt: 100 },
      ]),
    ).toEqual(['old', 'new'])
  })

  it('无 due 关卡时返回空（热身永不空转）', () => {
    expect(selectWarmup([{ levelId: 'a', due: false, bestStars: 1, lastPlayedAt: 1 }])).toEqual([])
  })
})

describe('热身收起标记（当日只出现一次）', () => {
  it('同日已收起 → true；隔天重置', () => {
    const storage = createMemoryStorage()
    const now = Date.UTC(2026, 9, 4, 12)
    expect(isWarmupDismissed(storage, now)).toBe(false)
    dismissWarmupToday(storage, now)
    expect(isWarmupDismissed(storage, now + 60_000)).toBe(true)
    expect(isWarmupDismissed(storage, now + 2 * DAY_MS)).toBe(false)
  })
})
