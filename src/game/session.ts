import type { Key } from '../engine'
import { applyProgressEvent, freshRecord } from './retention'
import { LevelRun } from './runtime'
import type { RunFeedOutcome } from './runtime'
import type { Level, LevelRecord, LevelText, Stars } from './types'
import { variantForDate } from './variant'

/** 章节默认的连续成功次数 N（PLAN §2.1）：ch1=1，ch2–3=2，ch4 起=3 */
export function defaultRequiredStreak(chapter: number): number {
  if (chapter <= 1) return 1
  if (chapter <= 3) return 2
  return 3
}

export type SessionFeedOutcome =
  | Exclude<RunFeedOutcome, { kind: 'rep-success' }>
  | {
      kind: 'rep-success'
      stars: Stars
      keys: number
      /** 更新后的关内连续成功计数 */
      streak: number
      /** 本次成功是否达成 N 次连续、关卡清关 */
      levelCleared: boolean
      record: LevelRecord
    }

export type SessionRestartOutcome =
  | /** 未触碰的 rep，零代价重来 */
  { kind: 'restart' }
  | { kind: 'rep-failure'; streak: 0; record: LevelRecord }
  | { kind: 'ignored' }

/**
 * 关卡会话：管理 rep 轮转、连续成功计数、record 更新。
 * 持久化由调用方负责（事件里的 record 已是终态，直接 repo.put 即可）。
 * 时间读取走注入的 clock（game/ 内禁止 Date.now()）。
 */
export class LevelSession {
  readonly level: Level
  readonly requiredStreak: number
  readonly variant: LevelText
  private readonly clock: () => number
  private _record: LevelRecord
  private _run: LevelRun
  private _done = false

  constructor(opts: { level: Level; record: LevelRecord | null; clock: () => number }) {
    this.level = opts.level
    this.clock = opts.clock
    this.requiredStreak = Math.max(1, opts.level.requiredStreak ?? defaultRequiredStreak(opts.level.chapter))
    // 变体按日期种子固定：同日重开/重试不换变体（防重投短变体刷分，PLAN §2.4B）
    this.variant = variantForDate(opts.level.texts, opts.clock())
    this._record = opts.record ?? freshRecord(opts.level.id)
    this._run = this.newRun()
  }

  get run(): LevelRun {
    return this._run
  }

  /** 截至最近一次事件的进度记录 */
  get record(): LevelRecord {
    return this._record
  }

  get streak(): number {
    return this._record.streak
  }

  /** 本会话已清关（清关后继续按键被忽略；重玩=新会话，星级读数照常更新） */
  get done(): boolean {
    return this._done
  }

  /** 两级提示：返回提示文案并标记当前 rep（封顶 1 星） */
  useHint(stage: 1 | 2): string {
    this._run.markHint(stage)
    return this.level.hints[stage - 1]
  }

  feed(key: Key): SessionFeedOutcome {
    if (this._done) return { kind: 'ignored' }
    const r = this._run.feed(key)
    if (r.kind !== 'rep-success') return r
    this._record = applyProgressEvent(
      this._record,
      this.level.id,
      { kind: 'rep-success', stars: r.stars, keys: r.keys, requiredStreak: this.requiredStreak },
      this.clock(),
    )
    const levelCleared = this._record.streak >= this.requiredStreak
    if (levelCleared) this._done = true
    else this.newRun()
    return {
      kind: 'rep-success',
      stars: r.stars,
      keys: r.keys,
      streak: this._record.streak,
      levelCleared,
      record: this._record,
    }
  }

  restart(): SessionRestartOutcome {
    if (this._done) return { kind: 'ignored' }
    if (!this._run.concede()) return { kind: 'restart' }
    this._record = applyProgressEvent(this._record, this.level.id, { kind: 'rep-failure' }, this.clock())
    this.newRun()
    return { kind: 'rep-failure', streak: 0, record: this._record }
  }

  private newRun(): LevelRun {
    this._run = new LevelRun(this.variant, this.level.allowedKeys)
    return this._run
  }
}
