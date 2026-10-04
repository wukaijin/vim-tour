import { KeyFilter, VimEngine, parseKeys } from '../engine'
import type { Key } from '../engine'
import { starsFor } from './stars'
import type { LevelText, Stars } from './types'

export type RunStatus = 'playing' | 'success' | 'failed'

export type RunFeedOutcome =
  | { kind: 'accepted'; handled: boolean; message?: string }
  /** 白名单拒绝：还没教到的键，不进引擎、不计击键 */
  | { kind: 'untaught' }
  /** rep 已终局，键被丢弃 */
  | { kind: 'ignored' }
  | { kind: 'rep-success'; stars: Stars; keys: number }

/** 成功判定 = 缓冲区与目标逐行一致（PLAN §3），不比对按键序列——等价解法天然被接受 */
export function sameLines(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((l, i) => l === b[i])
}

/**
 * 单次 rep 的运行时：白名单接线 + 击键计数 + 提示/撤销标记 + 成功检测。
 * 生命周期：playing →（缓冲区在 normal 模式下与 target 一致）success，或（玩家放弃）failed。
 */
export class LevelRun {
  readonly engine: VimEngine
  readonly target: readonly string[]
  readonly par: number
  keys = 0
  usedHint = false
  usedUndo = false
  status: RunStatus = 'playing'
  private readonly filter: KeyFilter

  constructor(variant: LevelText, allowedKeys: string[]) {
    this.engine = new VimEngine({ lines: variant.start, cursor: variant.cursor })
    this.target = [...variant.target]
    this.filter = new KeyFilter(allowedKeys)
    this.par = Math.max(1, parseKeys(variant.parKeys).length)
  }

  get lines(): string[] {
    return this.engine.lines
  }

  get cursor() {
    return this.engine.cursor
  }

  get mode() {
    return this.engine.mode
  }

  /** 按键回显栏内容（pending 序列 / cmdline 文本） */
  pendingEcho(): string {
    return this.engine.pendingEcho()
  }

  /** 看了提示（1=类别提示，2=完整解法）；任一级都封顶 1 星 */
  markHint(_stage: 1 | 2): void {
    if (this.status === 'playing') this.usedHint = true
  }

  stars(): Stars {
    return starsFor({ keys: this.keys, par: this.par, usedHint: this.usedHint, usedUndo: this.usedUndo })
  }

  feed(key: Key): RunFeedOutcome {
    if (this.status !== 'playing') return { kind: 'ignored' }
    if (!this.passesFilter(key)) return { kind: 'untaught' }
    // 撤销只算 normal 模式下的 u / C-r；insert 里 u 是普通字符
    if (this.engine.mode === 'normal' && (key === 'u' || key === '<C-r>')) this.usedUndo = true
    this.keys += 1
    const r = this.engine.press(key)
    // 只在 normal 模式判定：insert 会话未 Esc 之前缓冲区即使已达标也不算完成
    // （否则会漏掉 Esc 的击键，par 含 Esc 时星级读数失真）
    if (this.engine.mode === 'normal' && sameLines(this.engine.lines, this.target)) {
      this.status = 'success'
      return { kind: 'rep-success', stars: this.stars(), keys: this.keys }
    }
    return { kind: 'accepted', handled: r.handled, message: r.message }
  }

  /**
   * 玩家放弃本次 rep（UI 的「重来」）。返回是否计为失败：
   * 一个键都没按过的 rep 是侦察，零代价；按过键才视为失败（中途失败清零连续计数）。
   */
  concede(): boolean {
    if (this.status !== 'playing') return false
    if (this.keys === 0) return false
    this.status = 'failed'
    return true
  }

  /**
   * 白名单只作用于 normal/visual 命令层（PLAN §2.5——教学进度管的是命令，不是打字）；
   * insert / cmdline 是文本输入态：可打印字符与基本编辑键直接放行。
   */
  private passesFilter(key: Key): boolean {
    const m = this.engine.mode
    if (m === 'insert') {
      return key.length === 1 || key === '<Esc>' || key === '<BS>' || key === '<CR>' || key === '<Tab>'
    }
    if (m === 'cmdline') {
      return key.length === 1 || key === '<Esc>' || key === '<BS>' || key === '<CR>'
    }
    return this.filter.feed(key) !== 'reject'
  }
}
