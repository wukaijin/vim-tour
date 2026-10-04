import { describe, expect, it } from 'vitest'
import { LevelSession, defaultRequiredStreak } from '../session'
import { createProgressRepository } from '../../storage/progress'
import type { StorageLike } from '../../storage/progress'
import { variantForDate } from '../variant'
import type { Level, LevelText } from '../types'

const day = (n: number): number => new Date(2026, 0, 1 + n, 12, 0, 0, 0).getTime()

const text = (over?: Partial<LevelText>): LevelText => ({
  start: ['cat'],
  target: ['car'],
  cursor: { line: 0, col: 2 },
  parKeys: 'xar<Esc>',
  ...over,
})

/** 两变体用不同起始词区分，行数/前导空白/光标行满足 §9.2 规约 */
const variantA = text({ start: ['cat'], target: ['car'] })
const variantB = text({ start: ['dog'], target: ['dot'] })

const level = (over?: Partial<Level>): Level => ({
  id: 'l1',
  chapter: 1,
  title: '改词尾',
  brief: '把 cat 改成 car',
  hints: ['先删掉错字，再进插入模式补上', 'x a r <Esc>'],
  allowedKeys: ['h', 'l', 'x', 'i', 'a', '<Esc>'],
  texts: [variantA],
  ...over,
})

type Outcome = ReturnType<LevelSession['feed']>

/** 按 par 解法通关一次 rep（变体无关：起始词长 3、光标都在词尾），返回终局事件 */
function solvePar(s: LevelSession): Extract<Outcome, { kind: 'rep-success' }> {
  let last: Outcome = { kind: 'accepted', handled: true }
  for (const k of ['x', 'a', 'r', '<Esc>']) last = s.feed(k)
  if (last.kind !== 'rep-success') throw new Error(`expected rep-success, got ${last.kind}`)
  return last
}

describe('defaultRequiredStreak', () => {
  it('ch1=1，ch2–3=2，ch4 起=3（PLAN §2.1）', () => {
    expect(defaultRequiredStreak(1)).toBe(1)
    expect(defaultRequiredStreak(2)).toBe(2)
    expect(defaultRequiredStreak(3)).toBe(2)
    expect(defaultRequiredStreak(4)).toBe(3)
    expect(defaultRequiredStreak(7)).toBe(3)
  })
})

function memStorage(): StorageLike {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  }
}

describe('LevelSession：游戏循环', () => {
  it('N=1：单次成功即清关，record 落全字段，之后键被忽略', () => {
    const s = new LevelSession({ level: level(), record: null, clock: () => day(0) })
    expect(s.feed('x').kind).toBe('accepted')
    s.feed('a')
    s.feed('r')
    const out = s.feed('<Esc>')
    expect(out).toMatchObject({ kind: 'rep-success', stars: 3, keys: 4, streak: 1, levelCleared: true })
    if (out.kind === 'rep-success') {
      expect(out.record).toMatchObject({
        levelId: 'l1',
        cleared: true,
        streak: 1,
        bestStars: 3,
        bestKeys: 4,
        attempts: 1,
        lastPlayedAt: day(0),
        srsStage: 0,
        schemaVersion: 1,
      })
    }
    expect(s.done).toBe(true)
    expect(s.feed('x')).toEqual({ kind: 'ignored' })
    expect(s.restart()).toEqual({ kind: 'ignored' })
  })

  it('N=2：第一次成功开新 rep（引擎重置回起始），第二次清关', () => {
    const lv = level({ chapter: 2 })
    const s = new LevelSession({ level: lv, record: null, clock: () => day(0) })
    const first = solvePar(s)
    expect(first).toMatchObject({ kind: 'rep-success', streak: 1, levelCleared: false })
    expect(s.done).toBe(false)
    expect(s.run.keys).toBe(0) // 新 rep
    expect(s.run.lines).toEqual(['cat']) // 回到起始文本
    const second = solvePar(s)
    expect(second).toMatchObject({ kind: 'rep-success', levelCleared: true, streak: 2 })
    if (second.kind === 'rep-success') {
      expect(second.record.srsStage).toBe(0)
      expect(second.record.attempts).toBe(2)
    }
  })

  it('中途失败清零连续计数，重做两次后再清关；bestStars 保留历史最优', () => {
    const lv = level({ chapter: 2 })
    const s = new LevelSession({ level: lv, record: null, clock: () => day(0) })
    solvePar(s) // streak 1（3 星）
    s.feed('x') // 搞砸，放弃
    const fail = s.restart()
    expect(fail).toMatchObject({ kind: 'rep-failure' })
    if (fail.kind === 'rep-failure') expect(fail.record).toMatchObject({ streak: 0, attempts: 2 })
    expect(s.streak).toBe(0)
    // 重做：光标往返游走超预算（1 星），停回词尾后按 par 解法完成
    s.feed('h')
    s.feed('l')
    s.feed('h')
    s.feed('l')
    const redo = solvePar(s)
    expect(redo.stars).toBe(1)
    expect(s.streak).toBe(1)
    const last = solvePar(s)
    expect(last.levelCleared).toBe(true)
    expect(last.record.bestStars).toBe(3) // 历史最优保留
  })

  it('未按键的重开是零代价侦察，不算失败', () => {
    const s = new LevelSession({ level: level({ chapter: 2 }), record: null, clock: () => day(0) })
    solvePar(s)
    expect(s.restart()).toEqual({ kind: 'restart' }) // 新 rep 未触碰
    expect(s.streak).toBe(1)
    expect(s.record.attempts).toBe(1)
  })

  it('变体按日期种子固定：同日重试不换，隔日换（防重投短变体）', () => {
    const lv = level({ texts: [variantA, variantB] })
    let now = day(0)
    const expected = variantForDate(lv.texts, now)
    const other = lv.texts.find((t) => t !== expected)!
    const s = new LevelSession({ level: lv, record: null, clock: () => now })
    expect(s.variant).toBe(expected)
    s.feed('x')
    s.restart() // 同日失败重开
    expect(s.variant).toBe(expected)
    expect(s.run.lines).toEqual([expected.start[0]])
    now = day(1)
    const s2 = new LevelSession({ level: lv, record: null, clock: () => now })
    expect(s2.variant).toBe(other)
  })

  it('useHint 返回两级文案并封顶 1 星', () => {
    const s = new LevelSession({ level: level(), record: null, clock: () => day(0) })
    expect(s.useHint(1)).toBe('先删掉错字，再进插入模式补上')
    const out = solvePar(s)
    expect(out).toMatchObject({ kind: 'rep-success', stars: 1 })
    expect(s.useHint(2)).toBe('x a r <Esc>') // 已终局仍可读提示文案
  })

  it('时钟注入：跨日第二次清关 srsStage +1（同日则不扩展）', () => {
    let now = day(0)
    const s = new LevelSession({ level: level(), record: null, clock: () => now })
    solvePar(s)
    expect(s.record.srsStage).toBe(0)
    const again = new LevelSession({ level: level(), record: s.record, clock: () => now })
    solvePar(again)
    expect(again.record.srsStage).toBe(0) // 同日
    now = day(3)
    const third = new LevelSession({ level: level(), record: again.record, clock: () => now })
    solvePar(third)
    expect(third.record.srsStage).toBe(1)
  })

  it('进度经 ProgressRepository 持久化后可续玩（streak 跨会话）', () => {
    const storage = memStorage()
    const repo = createProgressRepository(storage)
    let now = day(0)
    const s = new LevelSession({ level: level({ chapter: 2 }), record: repo.get('l1'), clock: () => now })
    solvePar(s)
    repo.put(s.record)
    expect(repo.get('l1')?.streak).toBe(1)

    const s2 = new LevelSession({ level: level({ chapter: 2 }), record: repo.get('l1'), clock: () => now })
    expect(s2.streak).toBe(1)
    solvePar(s2)
    repo.put(s2.record)
    expect(repo.get('l1')).toMatchObject({ streak: 2, bestStars: 3, attempts: 2 })
    // 重建仓库走一遍加载/迁移路径
    const repo2 = createProgressRepository(storage)
    expect(repo2.get('l1')).toEqual(repo.get('l1'))
  })
})
