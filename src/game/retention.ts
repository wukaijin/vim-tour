import { SCHEMA_VERSION } from './types'
import type { LevelRecord, Stars } from './types'

export const DAY_MS = 86_400_000

/** 锈蚀阶梯（天）：扩展间隔而非等距（PLAN §2.4A，Cepeda et al. 2006） */
export const LADDER = [1, 3, 7, 14, 30] as const

/** 进度事件：rep 成功 / rep 失败 / 无 rep 的清关（毕业考批量，PLAN §2.3） */
export type LevelEvent =
  | { kind: 'rep-success'; stars: Stars; keys: number; requiredStreak: number }
  | { kind: 'rep-failure' }
  | { kind: 'clear' }

export interface RetentionInfo {
  /** 是否已清关（曾达到 N 次连续成功）。锈蚀只对已通关内容生效，永不门禁进度 */
  cleared: boolean
  /** due = now − lastPlayedAt > LADDER[srsStage] 天（未清关恒为 false） */
  due: boolean
}

/** 本地日历日键。时区随宿主；测试用注入的假时钟控制 */
function dayKey(ms: number): number {
  const d = new Date(ms)
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

export function sameDay(a: number, b: number): boolean {
  return dayKey(a) === dayKey(b)
}

function clampStage(s: number): number {
  return Math.min(4, Math.max(0, Math.floor(s)))
}

export function freshRecord(levelId: string): LevelRecord {
  return {
    levelId,
    cleared: false,
    streak: 0,
    bestStars: 0,
    bestKeys: 0,
    attempts: 0,
    lastPlayedAt: 0,
    srsStage: 0,
    schemaVersion: SCHEMA_VERSION,
  }
}

/**
 * 锈蚀判定（PLAN §2.4A）。纯函数。
 * 硬条款：now 一律从参数注入，函数体内禁止 Date.now()——30 天档只能靠假时钟测，不能上线等一个月。
 */
export function retentionOf(record: LevelRecord, now: number): RetentionInfo {
  if (!record.cleared) return { cleared: false, due: false }
  const stage = clampStage(record.srsStage)
  return { cleared: true, due: now - record.lastPlayedAt > LADDER[stage] * DAY_MS }
}

/**
 * 唯一的进度更新函数：会话的每个 rep 终局、毕业考批量清关都走它（PLAN §2.3「复用已有更新函数循环」）。
 * 纯函数：返回新 record，不改入参；now 注入。
 *
 * 转移规则（PLAN §2.4A）：
 * - rep 成功：attempts+1、streak+1、bestStars/bestKeys 更新；streak 达到 requiredStreak 即清关——
 *   首次清关 srsStage=0，此后每次清关 +1（封顶 4）；
 * - rep 失败：attempts+1、streak 清零、srsStage−1（地板 0）；
 * - clear：只刷新 lastPlayedAt 并走清关扩展规则；
 * - 成功与失败都刷新 lastPlayedAt；同日多次清关只扩展一次（按 lastPlayedAt 日历日判断，零新字段——
 *   PLAN 明确接受这个取舍：同日先失败再清关也不会扩展）。
 */
export function applyProgressEvent(
  prev: LevelRecord | null,
  levelId: string,
  event: LevelEvent,
  now: number,
): LevelRecord {
  const r: LevelRecord = prev ? { ...prev, levelId, schemaVersion: SCHEMA_VERSION } : freshRecord(levelId)
  switch (event.kind) {
    case 'rep-success': {
      r.attempts += 1
      r.streak += 1
      r.bestStars = Math.max(r.bestStars, event.stars) as LevelRecord['bestStars']
      r.bestKeys = r.bestKeys === 0 ? event.keys : Math.min(r.bestKeys, event.keys)
      r.lastPlayedAt = now
      if (r.streak >= event.requiredStreak) {
        r.cleared = true
        extendStage(r, prev)
      }
      break
    }
    case 'rep-failure': {
      r.attempts += 1
      r.streak = 0
      r.lastPlayedAt = now
      r.srsStage = Math.max(0, clampStage(r.srsStage) - 1)
      break
    }
    case 'clear': {
      r.lastPlayedAt = now
      r.cleared = true
      extendStage(r, prev)
      break
    }
  }
  return r
}

/** 清关扩展。首次达标定档 0；此后跨日 +1 封顶 4；同日（按更新前的 lastPlayedAt）不扩展 */
function extendStage(r: LevelRecord, prev: LevelRecord | null): void {
  if (prev === null || !prev.cleared) {
    r.srsStage = 0
    return
  }
  if (sameDay(prev.lastPlayedAt, r.lastPlayedAt)) return
  r.srsStage = Math.min(4, clampStage(r.srsStage) + 1)
}
