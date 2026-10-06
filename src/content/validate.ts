import { parseKeys } from '../engine'
import { LevelRun, sameLines } from '../game/runtime'
import type { Level } from '../game/types'
import { COMMANDS, commandById, isTaughtSeq, seqsOf } from './commands'

/** PLAN §9.3①：栅格关禁 CJK 的码位区间 */
const CJK_RE = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/

const KNOWN_IDS = new Set(COMMANDS.map((c) => c.id))

export type ValidationRule =
  | 'cjk-grid'
  | 'variant-shape'
  | 'variant-cursor'
  | 'allowed-keys'
  | 'par-converge'
  | 'variant-count'
  | 'shape'

export interface ValidationIssue {
  levelId: string
  rule: ValidationRule
  message: string
  /** 关卡数据在源文件中的行号（测试装配时解析） */
  line?: number
}

function leadingWhitespace(line: string): string {
  const m = line.match(/^[ \t]*/)
  return m ? m[0] : ''
}

/**
 * 内容校验器（PLAN §9.3，构建期五断言）。规约会被忘，门禁不会。
 * 全部纯函数，测试里对全部关卡跑一遍并 fail 于首个 issue。
 */
export function validateLevels(levels: Level[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const seenIds = new Set<string>()
  /** 教学累积（含往章与本章此前各关的 teaches；入参须为教学顺序，即 loadAllLevels 的排序） */
  const taught = new Set<string>()

  for (const level of levels) {
    const push = (rule: ValidationRule, message: string) =>
      issues.push({ levelId: level.id, rule, message })

    if (seenIds.has(level.id)) push('shape', '关卡 id 重复')
    seenIds.add(level.id)

    if (level.texts.length < 1 || level.texts.length > 2) {
      push('shape', `texts 变体数应为 1–2（MVP 上限 ×2），实际 ${level.texts.length}`)
    }
    if (level.chapter >= 2 && level.texts.length !== 2) {
      push('variant-count', `ch${level.chapter} 关卡必须全量配 2 个变体（PLAN §11.2/§2.4B）`)
    }
    if (!level.hints[0] || !level.hints[1]) {
      push('shape', 'hints 需要两级非空文案')
    }
    if (level.graduation && level.teaches && level.teaches.length > 0) {
      push('shape', '毕业考不教新命令（teaches 应为空）')
    }

    // §2.5：ch1–4 白名单必配（只放已教键），ch5+ 必须省略（完全放开）
    if (level.chapter <= 4) {
      if (!level.allowedKeys || level.allowedKeys.length === 0) {
        push('allowed-keys', 'ch1–4 关卡必须显式配置非空白名单（PLAN §2.5）')
      }
    } else if (level.allowedKeys) {
      push('allowed-keys', `第 ${level.chapter} 章起白名单完全放开，不得配置 allowedKeys（PLAN §2.5）`)
    }

    // teaches 的命令 id 必须在 COMMANDS 表中（否则下方累积展开无法进行）
    const unknownIds = (level.teaches ?? []).filter((id) => !KNOWN_IDS.has(id))
    if (unknownIds.length > 0) {
      push('shape', `teaches 含未知命令 id：${unknownIds.map((id) => JSON.stringify(id)).join(' ')}`)
    }

    // ④b 教学累积 ⊆ 白名单（§2.5 的另一半）：④ 只拦「超前教」，这里拦「教完漏给」——
    // 教过的键在后续关卡按不出，等于把学会的收走（渐进解锁的口径是累积，不是每关重置）
    if (level.chapter <= 4 && level.allowedKeys) {
      const cumulative = [...taught].filter((id) => KNOWN_IDS.has(id))
      const expected = new Set(cumulative.flatMap((id) => seqsOf(commandById(id))))
      const missing = [...expected].filter((k) => !level.allowedKeys!.includes(k))
      if (missing.length > 0) {
        push('allowed-keys', `白名单漏了已教序列：${missing.map((k) => JSON.stringify(k)).join(' ')}（此前各关教学累积，教过的键不许收走）`)
      }
    }
    for (const id of level.teaches ?? []) taught.add(id)

    for (let v = 0; v < level.texts.length; v++) {
      const t = level.texts[v]!

      // ① grid 关禁 CJK
      if (level.grid !== false) {
        for (const [what, lines] of [['start', t.start], ['target', t.target]] as const) {
          const hit = lines.findIndex((l) => CJK_RE.test(l))
          if (hit !== -1) {
            push('cjk-grid', `变体${v + 1} ${what} 第 ${hit + 1} 行含 CJK：${JSON.stringify(lines[hit])}（含 CJK 请置 grid:false）`)
          }
        }
      }

      if (parseKeys(t.parKeys).length === 0) push('shape', `变体${v + 1} parKeys 为空`)

      // ④ allowedKeys ⊆ 已教集 ∪ 往章（ch5+ 无白名单，自然跳过）
      const untaught = (level.allowedKeys ?? []).filter((k) => !isTaughtSeq(k, level.chapter))
      if (untaught.length > 0) {
        push('allowed-keys', `白名单含未教序列：${untaught.map((k) => JSON.stringify(k)).join(' ')}（截至第 ${level.chapter} 章）`)
      }

      // ⑤ parKeys 跑真引擎（连同白名单接线）收敛到 target
      const par = parRun(level, v)
      if (par !== null) push('par-converge', `变体${v + 1} parKeys 走真引擎未收敛：${par}`)
    }

    // ②③ 变体骨架：行数、逐行前导空白、光标行
    const [a, b] = level.texts
    if (a && b) {
      if (a.start.length !== b.start.length || a.target.length !== b.target.length) {
        push('variant-shape', `变体行数不一致：start ${a.start.length}/${b.start.length}，target ${a.target.length}/${b.target.length}`)
      } else {
        for (let i = 0; i < a.start.length; i++) {
          if (leadingWhitespace(a.start[i] ?? '') !== leadingWhitespace(b.start[i] ?? '')) {
            push('variant-shape', `start 第 ${i + 1} 行前导空白不一致：${JSON.stringify(leadingWhitespace(a.start[i] ?? ''))} vs ${JSON.stringify(leadingWhitespace(b.start[i] ?? ''))}`)
          }
        }
      }
      if (a.cursor.line !== b.cursor.line) {
        push('variant-cursor', `变体 cursor.line 不同：${a.cursor.line} vs ${b.cursor.line}（列可不同，行必须相同）`)
      }
    }
  }
  return issues
}

/** ⑤：返回失败描述，收敛则 null */
function parRun(level: Level, variantIndex: number): string | null {
  const t = level.texts[variantIndex]!
  const run = new LevelRun(t, level.allowedKeys)
  for (const key of parseKeys(t.parKeys)) {
    const r = run.feed(key)
    if (r.kind === 'untaught') return `第 ${run.keys + 1} 键 ${JSON.stringify(key)} 不在本关白名单`
    if (r.kind === 'rep-success') return null
  }
  const got = run.lines.map((l) => JSON.stringify(l)).join(' ')
  const want = t.target.map((l) => JSON.stringify(l)).join(' ')
  if (run.status !== 'success') {
    return run.mode === 'normal'
      ? `终局缓冲区 [${got}] ≠ target [${want}]`
      : `终局停留在 ${run.mode} 模式（par 应以 normal 模式收敛）：[${got}]`
  }
  return sameLines(run.lines, t.target) ? null : `收敛结果与 target 不符：[${got}] vs [${want}]`
}
