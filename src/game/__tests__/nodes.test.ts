import { describe, expect, it } from 'vitest'
import { DAY_MS, applyProgressEvent, freshRecord } from '../retention'
import { graduationClears } from '../graduation'
import { chapterNodes, levelLocked, nextLevelId } from '../nodes'
import type { Level, LevelRecord } from '../types'

const NOW = Date.UTC(2026, 9, 4)

function lvl(id: string, chapter: number, graduation = false): Level {
  return {
    id,
    chapter,
    title: id,
    brief: '',
    hints: ['a', 'b'],
    allowedKeys: ['h'],
    teaches: [],
    graduation,
    texts: [
      { start: ['x'], target: ['y'], cursor: { line: 0, col: 0 }, parKeys: 'x' },
    ],
  }
}

const levels = [
  lvl('c1-1', 1),
  lvl('c1-2', 1),
  lvl('c1-g', 1, true),
  lvl('c2-1', 2),
]

function cleared(id: string, stageOffsetDays = 0): LevelRecord {
  return applyProgressEvent(freshRecord(id), id, { kind: 'clear' }, NOW - stageOffsetDays * DAY_MS)
}

describe('chapterNodes（节点四态）', () => {
  it('无进度：每章首关 current，其后 locked；ch2 整章锁', () => {
    const none = ((): LevelRecord | null => null)
    const n1 = chapterNodes(1, levels, none, NOW)
    expect(n1.map((x) => x.state)).toEqual(['current', 'locked', 'locked'])
    const n2 = chapterNodes(2, levels, none, NOW)
    expect(n2.map((x) => x.state)).toEqual(['locked'])
  })

  it('清了前两关：毕业考 current；ch1 毕业考过了后 ch2 解锁', () => {
    const recs: Record<string, LevelRecord> = { 'c1-1': cleared('c1-1'), 'c1-2': cleared('c1-2') }
    const get = (id: string): LevelRecord | null => recs[id] ?? null
    expect(chapterNodes(1, levels, get, NOW).map((x) => x.state)).toEqual([
      'done',
      'done',
      'current',
    ])
    expect(chapterNodes(2, levels, get, NOW).map((x) => x.state)).toEqual(['locked'])
    recs['c1-g'] = cleared('c1-g')
    expect(chapterNodes(2, levels, get, NOW).map((x) => x.state)).toEqual(['current'])
  })

  it('清关节点超期未复习 → due-review（颜色不变，仅形态区分）', () => {
    // stage 0 间隔 1 天：4 天前清关 → due
    const recs: Record<string, LevelRecord> = {
      'c1-1': applyProgressEvent(cleared('c1-1'), 'c1-1', { kind: 'clear' }, NOW - 4 * DAY_MS),
      'c1-2': cleared('c1-2'),
    }
    const get = (id: string): LevelRecord | null => recs[id] ?? null
    const states = chapterNodes(1, levels, get, NOW).map((x) => x.state)
    expect(states[0]).toBe('due-review')
    expect(states[1]).toBe('done')
  })
})

describe('nextLevelId', () => {
  it('返回首个 current', () => {
    const none = (): LevelRecord | null => null
    expect(nextLevelId(levels, none, NOW)).toBe('c1-1')
  })
})

describe('graduationClears（毕业考批量清关）', () => {
  it('对本章既往关卡各执行一次 clear（srsStage +1、lastPlayedAt 刷新）', () => {
    const recs: Record<string, LevelRecord> = {
      'c1-1': cleared('c1-1', 3), // 3 天前清关，stage 1
      'c1-2': cleared('c1-2', 3),
    }
    const get = (id: string): LevelRecord | null => recs[id] ?? null
    const updated = graduationClears(levels[2]!, levels, get, NOW)
    expect(updated.map((r) => r.levelId)).toEqual(['c1-1', 'c1-2'])
    for (const r of updated) {
      expect(r.srsStage).toBe(recs[r.levelId]!.srsStage + 1)
      expect(r.lastPlayedAt).toBe(NOW)
    }
  })

  it('无 record 的关卡跳过（不凭空造进度）', () => {
    const none = (): LevelRecord | null => null
    expect(graduationClears(levels[2]!, levels, none, NOW)).toEqual([])
  })
})

describe('levelLocked（直链解锁守卫）', () => {
  it('无进度：ch2 关卡锁定、ch1-01 可进、不存在的 id 视为锁定', () => {
    const none = (): LevelRecord | null => null
    expect(levelLocked('c2-1', levels, none, NOW)).toBe(true)
    expect(levelLocked('c1-1', levels, none, NOW)).toBe(false)
    expect(levelLocked('nope', levels, none, NOW)).toBe(true)
  })

  it('毕业考过后次章解锁', () => {
    const recs: Record<string, LevelRecord> = {
      'c1-1': cleared('c1-1'),
      'c1-2': cleared('c1-2'),
      'c1-g': cleared('c1-g'),
    }
    const get = (id: string): LevelRecord | null => recs[id] ?? null
    expect(levelLocked('c2-1', levels, get, NOW)).toBe(false)
  })

  it('已清关的关卡重玩不锁定', () => {
    const recs: Record<string, LevelRecord> = { 'c1-1': cleared('c1-1', 3) }
    const get = (id: string): LevelRecord | null => recs[id] ?? null
    expect(levelLocked('c1-1', levels, get, NOW)).toBe(false)
  })
})
