import { DAY_MS } from './retention'
import type { LevelText } from './types'

function startOfLocalDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * 变体轮换：按本地日历日做种子（PLAN §2.4B）。
 * 会话内稳定、隔天必换，兼作防刷分——重试不会换到短变体。
 * 纯函数，now 注入（game/ 内禁止读真实时钟）。
 */
export function variantForDate(texts: readonly LevelText[], now: number): LevelText {
  if (texts.length === 0) throw new Error('level.texts must not be empty')
  if (texts.length === 1) return texts[0]
  const dayIndex = Math.floor(startOfLocalDay(now) / DAY_MS)
  return texts[dayIndex % texts.length]!
}
