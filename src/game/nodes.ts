import type { Level, LevelRecord } from './types'
import { retentionOf } from './retention'

/** 章节地图节点四态（PLAN §8.4） */
export type NodeState = 'locked' | 'current' | 'done' | 'due-review'

export interface NodeInfo {
  level: Level
  state: NodeState
}

function isChapterUnlocked(chapter: number, levels: readonly Level[], records: RecordGetter): boolean {
  if (chapter <= 1) return true
  const prevGrad = levels.find((l) => l.chapter === chapter - 1 && l.graduation)
  if (!prevGrad) return true // 数据缺失时不锁死
  return records(prevGrad.id)?.cleared === true
}

interface RecordGetter {
  (levelId: string): LevelRecord | null
}

/**
 * 一章的节点状态序列：顺序解锁（前关 cleared 才开下一关），
 * 已清关节点再按 retentionOf 分流 done / due-review。now 注入。
 */
export function chapterNodes(
  chapter: number,
  levels: readonly Level[],
  records: RecordGetter,
  now: number,
): NodeInfo[] {
  const mine = levels.filter((l) => l.chapter === chapter)
  const unlocked = isChapterUnlocked(chapter, levels, records)
  let seenUncleared = false
  const out: NodeInfo[] = []
  for (let i = 0; i < mine.length; i++) {
    const level = mine[i]!
    const prev = i === 0 ? null : mine[i - 1]!
    const levelUnlocked = unlocked && (prev === null || records(prev.id)?.cleared === true)
    let state: NodeState
    if (!levelUnlocked || seenUncleared) {
      state = 'locked'
    } else {
      const rec = records(level.id)
      if (rec?.cleared) {
        state = retentionOf(rec, now).due ? 'due-review' : 'done'
      } else {
        state = 'current'
        seenUncleared = true
      }
    }
    out.push({ level, state })
  }
  return out
}

/** 全局下一个该玩的关卡（首个 current） */
export function nextLevelId(levels: readonly Level[], records: RecordGetter, now: number): string | null {
  for (const ch of new Set(levels.map((l) => l.chapter))) {
    const node = chapterNodes(ch, levels, records, now).find((n) => n.state === 'current')
    if (node) return node.level.id
  }
  return null
}
