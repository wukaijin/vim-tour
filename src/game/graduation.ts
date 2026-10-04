import type { Level, LevelRecord } from './types'
import { applyProgressEvent } from './retention'

/**
 * 毕业考批量清关（PLAN §2.3）：通过后对本章既往关卡各执行一次 clear 更新
 * （刷新 lastPlayedAt、srsStage +1）——复用 applyProgressEvent 循环，零新机制。
 * 只更新已有 record 的关卡（解锁顺序保证它们都清过关，防御性跳过空 record）。
 */
export function graduationClears(
  graduationLevel: Level,
  levels: readonly Level[],
  records: (levelId: string) => LevelRecord | null,
  now: number,
): LevelRecord[] {
  return levels
    .filter((l) => l.chapter === graduationLevel.chapter && l.id !== graduationLevel.id)
    .flatMap((l) => {
      const rec = records(l.id)
      return rec ? [applyProgressEvent(rec, l.id, { kind: 'clear' }, now)] : []
    })
}
