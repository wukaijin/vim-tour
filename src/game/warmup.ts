import type { StorageLike } from '../storage/progress'
import { sameDay } from './retention'

export interface WarmupCandidate {
  levelId: string
  due: boolean
  bestStars: number
  lastPlayedAt: number
}

/**
 * 热身选题器（PLAN §2.4C）：due 优先 → bestStars 最低 → lastPlayedAt 最旧，
 * 弱势优先，全部来自现有字段。纯函数。
 */
export function selectWarmup(candidates: readonly WarmupCandidate[], max = 3): string[] {
  return candidates
    .filter((c) => c.due)
    .sort(
      (a, b) =>
        Number(b.due) - Number(a.due) ||
        a.bestStars - b.bestStars ||
        a.lastPlayedAt - b.lastPlayedAt,
    )
    .slice(0, max)
    .map((c) => c.levelId)
}

const WARMUP_DISMISS_KEY = 'vim-tour:warmup-dismissed-at'

/** 当日是否已收起热身卡（跳过零代价，但当日不再出现） */
export function isWarmupDismissed(storage: StorageLike, now: number): boolean {
  let raw: string | null = null
  try {
    raw = storage.getItem(WARMUP_DISMISS_KEY)
  } catch {
    return false
  }
  const at = Number(raw)
  return Number.isFinite(at) && sameDay(at, now)
}

export function dismissWarmupToday(storage: StorageLike, now: number): void {
  try {
    storage.setItem(WARMUP_DISMISS_KEY, String(now))
  } catch {
    // 存储不可用：会话内收起即可
  }
}
