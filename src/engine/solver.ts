import { VimEngine } from './engine'
import { KeyFilter } from './whitelist'
import { parseKeys } from './types'
import type { Cursor, Key } from './types'

export interface SolveInput {
  start: string[]
  cursor: Cursor
  target: string[]
  /** 白名单命令序列（语义同 Level.allowedKeys；沙盒恒非空） */
  allowedKeys: string[]
}

export interface SolveOptions {
  /** 去重后访问状态的预算（默认 60k，实测校准，PLAN §13） */
  maxStates?: number
  /** 解长上限（按键数，默认 20） */
  maxKeys?: number
  /** 调试钩子：每层结束回调（标定/诊断用） */
  onDepth?: (info: { depth: number; frontier: number; seen: number }) => void
}

export type SolveResult =
  | { ok: true; keys: Key[] }
  | { ok: false; reason: 'budget' | 'unsolvable'; explored: number }

/** 实测包线（PLAN §13 标定）：9 键题在 30 万状态内可证最优（~0.5s）；再深会指数爆炸 */
const DEFAULT_MAX_STATES = 300_000
const DEFAULT_MAX_KEYS = 20

/** 撤销键排除（PLAN §14.3：3 星本就禁用撤销，最优解不含撤销） */
const UNDO_KEYS = new Set<Key>(['u', '<C-r>'])
const FIND_KEYS = new Set<Key>(['f', 'F', 't', 'T'])

/** find 家族的参数字符：任意可打印字符 */
const ANY_CHAR: Key[] = (() => {
  const out: Key[] = []
  for (let c = 0x20; c <= 0x7e; c++) out.push(String.fromCharCode(c))
  return out
})()

/** cmdline 语法字符（在题面字符之外仍可能需要，如 :s/…/…/g 的 s g 斜杠） */
const CMDLINE_EXTRA = 'sgivn%.,$[](){}|^*-?/&0123456789'

/**
 * 最短解搜索（PLAN §14.3）：在真引擎状态空间上按键数做 BFS，首个到达的成功态即最短解。
 * - 字母表按模式建模白名单，与 LevelRun.passesFilter 同语义（insert/cmdline 是文本输入态，不走白名单）；
 * - 去重键 = 完整行为态（VimEngine.stateKey）；首次访问即最短路径，故可全局去重；
 * - 预算耗尽返回 budget（上层闸门据此回喂重试），**不产出「未证明最优」的解**。
 */
export function solve(input: SolveInput, opts: SolveOptions = {}): SolveResult {
  const maxStates = opts.maxStates ?? DEFAULT_MAX_STATES
  const maxKeys = opts.maxKeys ?? DEFAULT_MAX_KEYS
  const target = input.target

  const rootEngine = new VimEngine({ lines: input.start, cursor: input.cursor })
  if (done(rootEngine, target)) return { ok: true, keys: [] }

  const chars = new Set([...input.start.join('\n'), ...target.join('\n'), ' '])
  const textChars = [...chars]
  const normalAlphabet = [...new Set(input.allowedKeys.flatMap((s) => parseKeys(s)))].filter((k) => !UNDO_KEYS.has(k))
  // 搜索空间剪枝（只影响「不必要地绕远」的题；小用例由无剪枝暴力 BFS 比对把关）：
  // ① 行长不超过 start/target 的最大行长——临时超长的行迟早要删，最优解不会绕；
  // ② 行数不超过 start/target 的最大行数——同理，多开的行迟早要删；
  // ③ find 参数字符限定在题面出现过的字符内。
  const maxLineLen = Math.max(1, ...input.start.map((l) => l.length), ...target.map((l) => l.length))
  const maxLines = Math.max(input.start.length, target.length)
  const findChars = ANY_CHAR.filter((c) => chars.has(c))

  const rootFp = rootEngine.stateKey()
  /** 状态 → 父状态与所按的键；路径按需回放（前沿不持有引擎，内存随状态数线性） */
  const parents = new Map<string, { p: string | null; k: Key }>([[rootFp, { p: null, k: '' }]])
  let frontier: string[] = [rootFp]
  const start = input.start
  const cursor = input.cursor

  const pathOf = (fp: string): Key[] => {
    const out: Key[] = []
    let cur: string | null = fp
    while (cur !== null) {
      const par = parents.get(cur)
      if (!par || par.p === null) break
      out.push(par.k)
      cur = par.p
    }
    return out.reverse()
  }

  const rebuild = (fp: string): { engine: VimEngine; filter: KeyFilter } => {
    const engine = new VimEngine({ lines: start, cursor })
    const filter = new KeyFilter(input.allowedKeys)
    const path = pathOf(fp)
    for (const k of path) {
      filter.feed(k)
      engine.press(k)
    }
    return { engine, filter }
  }

  let explored = 1
  for (let depth = 0; depth < maxKeys; depth++) {
    const next: string[] = []
    for (const fp of frontier) {
      const { engine, filter } = rebuild(fp)
      for (const key of candidates(engine, filter, normalAlphabet, textChars, target, {
        maxLineLen,
        maxLines,
        findChars,
      })) {
        const child = engine.clone()
        const childFilter = filter.clone()
        childFilter.feed(key) // 与 LevelRun 一致：先过白名单，再进引擎
        child.press(key)
        const fp2 = child.stateKey()
        if (parents.has(fp2)) continue
        if (parents.size >= maxStates) return { ok: false, reason: 'budget', explored }
        parents.set(fp2, { p: fp, k: key })
        explored += 1
        if (done(child, target)) return { ok: true, keys: pathOf(fp2) }
        next.push(fp2)
      }
    }
    if (next.length === 0) return { ok: false, reason: 'unsolvable', explored }
    frontier = next
    opts.onDepth?.({ depth: depth + 1, frontier: frontier.length, seen: parents.size })
  }
  return { ok: false, reason: 'budget', explored }
}

/** 成功判定与 LevelRun 同语义：normal 模式下缓冲区与目标逐行一致 */
function done(engine: VimEngine, target: readonly string[]): boolean {
  if (engine.mode !== 'normal') return false
  const lines = engine.lines
  return lines.length === target.length && lines.every((l, i) => l === target[i])
}

interface Bounds {
  maxLineLen: number
  maxLines: number
  findChars: Key[]
}

function candidates(
  engine: VimEngine,
  filter: KeyFilter,
  normalAlphabet: Key[],
  textChars: Key[],
  target: readonly string[],
  bounds: Bounds,
): Key[] {
  const mode = engine.mode
  if (mode === 'insert') {
    const col = engine.cursor.col
    const line = engine.lines[engine.cursor.line] ?? ''
    const tgt = target[engine.cursor.line]
    const out: Key[] = ['<Esc>']
    if (line.length > 0) out.push('<BS>')
    if (engine.lines.length < bounds.maxLines) out.push('<CR>')
    if (line.length + 2 <= bounds.maxLineLen) out.push('<Tab>')
    if (line.length + 1 <= bounds.maxLineLen) {
      // 插入打字剪枝（插入模式的排列组合是状态空间的主爆点）：
      // 行前缀与目标行同列对齐时，只允许打「目标在该列要的字符」——打错的字符迟早要删，最优解不会打。
      // 未对齐（整体位移的行）时不剪，避免误伤可解路径。
      if (tgt !== undefined && line.slice(0, col) === tgt.slice(0, col)) {
        const want = tgt[col]
        if (want !== undefined) out.push(want)
      } else {
        out.push(...textChars)
      }
    }
    return out
  }
  if (mode === 'cmdline') return ['<Esc>', '<BS>', '<CR>', ...new Set([...textChars, ...CMDLINE_EXTRA])]

  // normal / visual-*：走白名单 trie；<Esc> 永远可用（过滤器视作重置）
  const out: Key[] = ['<Esc>']
  for (const k of normalAlphabet) {
    // 开新行的命令受行数上界约束（剪枝②）
    if ((k === 'o' || k === 'O') && engine.lines.length >= bounds.maxLines) continue
    if (filter.clone().feed(k) !== 'reject') out.push(k)
  }
  const pending = filter.pending()
  const last = pending[pending.length - 1]
  if (last !== undefined && FIND_KEYS.has(last)) out.push(...bounds.findChars)
  return out
}

/** 搜索字母表的可见性辅助（测试/调试用）：某状态下的候选键 */
export function candidatesAt(input: SolveInput, keys: Key[]): Key[] {
  const engine = new VimEngine({ lines: input.start, cursor: input.cursor })
  const filter = new KeyFilter(input.allowedKeys)
  for (const k of keys) {
    filter.feed(k)
    engine.press(k)
  }
  const chars = new Set([...input.start.join('\n'), ...input.target.join('\n'), ' '])
  const normalAlphabet = [...new Set(input.allowedKeys.flatMap((s) => parseKeys(s)))].filter((k) => !UNDO_KEYS.has(k))
  return candidates(engine, filter, normalAlphabet, [...chars], input.target, {
    maxLineLen: Math.max(1, ...input.start.map((l) => l.length), ...input.target.map((l) => l.length)),
    maxLines: Math.max(input.start.length, input.target.length),
    findChars: ANY_CHAR.filter((c) => chars.has(c)),
  })
}
