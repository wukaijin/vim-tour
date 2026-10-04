import { describe, expect, it, vi } from 'vitest'
import {
  LADDER,
  DAY_MS,
  applyProgressEvent,
  freshRecord,
  retentionOf,
  sameDay,
} from '../retention'
import type { LevelEvent } from '../retention'
import type { LevelRecord, Stars } from '../types'

/** 本地正午的连续日期（避开 DST 边界；同日判断按本地日历日） */
const day = (n: number): number => new Date(2026, 0, 1 + n, 12, 0, 0, 0).getTime()

const success = (stars: Stars = 3, keys = 4, requiredStreak = 1): LevelEvent => ({
  kind: 'rep-success',
  stars,
  keys,
  requiredStreak,
})
const failure: LevelEvent = { kind: 'rep-failure' }

/** 已清关记录：指定档位与最后游玩时间 */
const clearedRec = (stage: number, last: number): LevelRecord => ({
  ...freshRecord('l1'),
  cleared: true,
  streak: 1,
  bestStars: 3,
  attempts: 1,
  lastPlayedAt: last,
  srsStage: stage,
})

describe('retentionOf：due 判定', () => {
  it('阈值：恰好 LADDER 天不算 due，超过才算（严格大于）', () => {
    for (const stage of [0, 1, 2, 3, 4]) {
      const last = day(0)
      const rec = clearedRec(stage, last)
      expect(retentionOf(rec, last + LADDER[stage] * DAY_MS).due).toBe(false)
      expect(retentionOf(rec, last + LADDER[stage] * DAY_MS + 1).due).toBe(true)
    }
  })

  it('单调性：对固定记录，due(now) 随 now 递增一旦为真不再回退', () => {
    for (const stage of [0, 1, 2, 3, 4]) {
      const last = day(0)
      const rec = clearedRec(stage, last)
      let seenDue = false
      for (let h = 0; h <= (LADDER[stage] + 2) * 24; h++) {
        const due = retentionOf(rec, last + h * 3_600_000).due
        if (seenDue) expect(due).toBe(true)
        else if (due) seenDue = true
      }
      expect(seenDue).toBe(true)
    }
  })

  it('未清关的关卡永不 due（锈蚀不是进度门禁）——即使 rep 成功攒过星级', () => {
    const rec: LevelRecord = { ...freshRecord('l1'), attempts: 5, bestStars: 3, streak: 1, lastPlayedAt: day(0) }
    expect(retentionOf(rec, day(400)).due).toBe(false)
    expect(retentionOf(rec, day(400)).cleared).toBe(false)
  })
})

describe('applyProgressEvent：阶梯转移规则', () => {
  it('首次达标 → srsStage=0（此前失败过也一样）', () => {
    let rec: LevelRecord | null = null
    rec = applyProgressEvent(rec, 'l1', failure, day(0))
    rec = applyProgressEvent(rec, 'l1', failure, day(0))
    rec = applyProgressEvent(rec, 'l1', success(), day(0))
    expect(rec.srsStage).toBe(0)
    expect(rec.bestStars).toBe(3)
    expect(retentionOf(rec, day(0)).cleared).toBe(true)
  })

  it('封顶：跨日连续清关 srsStage 封顶 4', () => {
    let rec = applyProgressEvent(null, 'l1', success(), day(0))
    for (let d = 1; d < 20; d++) {
      rec = applyProgressEvent(rec, 'l1', success(), day(d))
    }
    expect(rec.srsStage).toBe(4)
  })

  it('地板：清关后连续失败回缩到 0 后不再下降', () => {
    let rec = applyProgressEvent(null, 'l1', success(), day(0))
    for (let d = 1; d < 4; d++) rec = applyProgressEvent(rec, 'l1', success(), day(d))
    expect(rec.srsStage).toBe(3)
    for (let i = 0; i < 10; i++) rec = applyProgressEvent(rec, 'l1', failure, day(10))
    expect(rec.srsStage).toBe(0)
  })

  it('失败回缩：每次失败 −1，成功与失败都刷新 lastPlayedAt', () => {
    let rec = applyProgressEvent(null, 'l1', success(), day(0))
    for (let d = 1; d < 3; d++) rec = applyProgressEvent(rec, 'l1', success(), day(d))
    expect(rec.srsStage).toBe(2)
    rec = applyProgressEvent(rec, 'l1', failure, day(10))
    expect(rec.srsStage).toBe(1)
    expect(rec.lastPlayedAt).toBe(day(10))
    expect(rec.streak).toBe(0)
    rec = applyProgressEvent(rec, 'l1', failure, day(11))
    expect(rec.srsStage).toBe(0)
  })

  it('同日多次清关只扩展一次', () => {
    let rec: LevelRecord | null = null
    rec = applyProgressEvent(rec, 'l1', success(), day(0)) // 首次清关 → 0
    rec = applyProgressEvent(rec, 'l1', success(), day(0) + 3_600_000) // 同日 → 不扩展
    rec = applyProgressEvent(rec, 'l1', success(), day(0) + 7_200_000)
    expect(rec.srsStage).toBe(0)
    rec = applyProgressEvent(rec, 'l1', success(), day(1)) // 跨日 → +1
    rec = applyProgressEvent(rec, 'l1', success(), day(1) + 3_600_000) // 又同日
    expect(rec.srsStage).toBe(1)
    rec = applyProgressEvent(rec, 'l1', success(), day(2))
    expect(rec.srsStage).toBe(2)
  })

  it('rep 成功未达 requiredStreak 不动 srs，但记 attempts/streak/best', () => {
    let rec: LevelRecord | null = null
    rec = applyProgressEvent(rec, 'l1', success(2, 9, 2), day(0))
    expect(rec.streak).toBe(1)
    expect(rec.bestStars).toBe(2)
    expect(rec.bestKeys).toBe(9)
    expect(rec.cleared).toBe(false)
    expect(retentionOf(rec, day(9)).due).toBe(false)
    rec = applyProgressEvent(rec, 'l1', success(3, 6, 2), day(0))
    expect(rec.streak).toBe(2)
    expect(rec.cleared).toBe(true)
    expect(rec.srsStage).toBe(0) // 首次清关当天，定档 0
    expect(rec.bestStars).toBe(3)
    expect(rec.bestKeys).toBe(6)
    expect(rec.attempts).toBe(2)
  })

  it('清关→失败→隔日再清关：是后续清关（+1），不是首次清关', () => {
    let rec: LevelRecord | null = null
    rec = applyProgressEvent(rec, 'l1', success(), day(0)) // 首次清关 → 0
    rec = applyProgressEvent(rec, 'l1', success(), day(1)) // → 1
    rec = applyProgressEvent(rec, 'l1', failure, day(2)) // 回缩 → 0，streak 清零
    expect(rec.streak).toBe(0)
    rec = applyProgressEvent(rec, 'l1', success(), day(3)) // 复原清关（热身场景）→ 1
    expect(rec.srsStage).toBe(1)
    expect(rec.cleared).toBe(true) // 失败不回收清关标志
  })

  it('毕业考批量 clear：刷新 lastPlayedAt、跨日 +1、同日不扩展、不计 attempts', () => {
    let rec: LevelRecord | null = null
    rec = applyProgressEvent(rec, 'l1', success(), day(0))
    rec = applyProgressEvent(rec, 'l1', { kind: 'clear' }, day(5))
    expect(rec.srsStage).toBe(1)
    expect(rec.lastPlayedAt).toBe(day(5))
    expect(rec.attempts).toBe(1)
    rec = applyProgressEvent(rec, 'l1', { kind: 'clear' }, day(5) + 3_600_000)
    expect(rec.srsStage).toBe(1)
  })
})

describe('纯度与健壮性', () => {
  it('硬条款：篡改 Date.now 抛错后，game 层时间函数照常运行', () => {
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('Date.now() called')
    })
    try {
      const rec = clearedRec(2, day(0))
      expect(retentionOf(rec, day(40)).due).toBe(true)
      applyProgressEvent(rec, 'l1', failure, day(1))
      applyProgressEvent(null, 'l1', { kind: 'clear' }, day(1))
      expect(sameDay(day(0), day(0) + 3_600_000)).toBe(true)
      expect(sameDay(day(0), day(1))).toBe(false)
    } finally {
      spy.mockRestore()
    }
  })

  it('不修改入参（返回新对象）', () => {
    const rec = clearedRec(1, day(0))
    const snapshot = { ...rec }
    applyProgressEvent(rec, 'l1', failure, day(1))
    expect(rec).toEqual(snapshot)
  })

  it('srsStage 越界输入被收敛', () => {
    const rec = { ...clearedRec(9, day(0)) }
    // retentionOf 只读：越界档位按 clamp 后的 4 档计算
    expect(retentionOf(rec, day(0) + 31 * DAY_MS).due).toBe(true)
    expect(retentionOf(rec, day(0) + 30 * DAY_MS).due).toBe(false)
  })

  it('随机事件流不变量：stage ∈ [0,4]、attempts 等于 rep 事件数、lastPlayedAt 单调不减', () => {
    let seed = 20261004
    const rnd = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 2 ** 32
    }
    let rec: LevelRecord | null = null
    let reps = 0
    let t = day(0)
    for (let i = 0; i < 500; i++) {
      t += Math.floor(rnd() * 2.5 * DAY_MS)
      const roll = rnd()
      rec = applyProgressEvent(
        rec,
        'l1',
        roll < 0.4 ? failure : roll < 0.8 ? success(roll < 0.6 ? 3 : 1, 4, 1) : { kind: 'clear' },
        t,
      )
      if (roll < 0.8) reps++
      expect(rec.srsStage).toBeGreaterThanOrEqual(0)
      expect(rec.srsStage).toBeLessThanOrEqual(4)
      expect(rec.attempts).toBe(reps)
      expect(rec.lastPlayedAt).toBe(t)
    }
  })
})
