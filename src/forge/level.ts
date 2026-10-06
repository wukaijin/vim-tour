import { commandsUpTo, isTaughtSeq, keysOf, seqsOf } from '../content/commands'
import { VimEngine, parseKeys } from '../engine'
import type { Key } from '../engine'
import { LevelRun } from '../game/runtime'
import type { Level, LevelText, Stars } from '../game/types'
import { emptyStats, PAR_RANGE, toParKeys } from './types'
import type { CandidateDraft, ForgeParams, ForgeTier, ParSource, SandboxLevel, SandboxStats } from './types'

/** 求解器接口（结构类型；生产用 engine/solver.ts 的 solve，测试可注入桩） */
export interface SolverInput {
  start: string[]
  cursor: { line: number; col: number }
  target: string[]
  allowedKeys: string[]
}

export type SolverOutcome = { ok: true; keys: Key[] } | { ok: false; reason: 'budget' | 'unsolvable' }

export type Solver = (input: SolverInput) => SolverOutcome

/**
 * 计数形态样本（tier≥3 即 count 已教）：每个形态一条样本锚定 trie 路径，
 * 数字段本身由 KeyFilter 通配为任意 [1-9][0-9]*（2dd 同时放行 3dd/10dd）。
 */
const COUNT_SEQS = ['2dd', '2w', '2b', '2e', '2j', '2k', '2yy', '2dw', '2cw', '2x']

/**
 * 命令档 → 玩家白名单（PLAN §14.1）：该档全部已教命令。
 * 玩家在沙盒里能按「截至本章学过的一切」（选第 5 章就能按 j），与正篇 ch5+ 放开的姿态一致。
 */
export function taughtKeysFor(tier: ForgeTier): string[] {
  const base = keysOf(commandsUpTo(tier).map((c) => c.id))
  const extra = tier >= 3 ? COUNT_SEQS : []
  return [...new Set([...base, ...extra])].filter((seq) => isTaughtSeq(seq, tier))
}

/**
 * 模型声明的解法命令 → 双白名单（PLAN §14.1 解耦）：
 * - playKeys   —— 玩家在本题能按的键 = 该档全部已教命令（⊇ 声明集），符合「选第几章就能用学到的一切」；
 * - solverKeys —— 求解器搜索字母表 = 模型声明的窄集合：par 的可信层要在它上面才搜得动。
 * 声明集必须 ⊆ 该档已教集（闸门）。
 */
export function keysFromDeclared(
  tier: ForgeTier,
  declared: string[],
): { ok: true; playKeys: string[]; solverKeys: string[] } | { ok: false; reason: string } {
  const untaught = declared.filter((k) => !isTaughtSeq(k, tier))
  if (untaught.length > 0) {
    return { ok: false, reason: `命令 ${untaught.map((k) => `"${k}"`).join(' ')} 不属于第 ${tier} 章已教范围` }
  }
  const solverKeys = [...new Set([...declared, '<Esc>'])] // Esc 是打字收尾必备
  const playKeys = [...new Set([...taughtKeysFor(tier), ...solverKeys])]
  return { ok: true, playKeys, solverKeys }
}

/**
 * 解法验证（PLAN §14.2 闸门）：逐键回放，必须零 untaught 且收敛到 target——
 * 与正篇 52 关 parKeys 的验收口径完全一致（§9.3⑤）：不比对按键序列，只要求真引擎走通。
 */
export function verifySolution(
  text: { start: string[]; cursor: { line: number; col: number }; target: string[] },
  allowedKeys: string[],
  parKeys: string,
): { ok: true; keys: Key[] } | { ok: false; reason: string } {
  const keys = parseKeys(parKeys)
  if (keys.length === 0) return { ok: false, reason: 'parKeys 为空' }
  if (keys.length > 80) return { ok: false, reason: `parKeys 过长（${keys.length} 键）` }
  const run = new LevelRun({ ...text, parKeys }, allowedKeys)
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!
    const out = run.feed(key)
    if (out.kind === 'untaught') {
      return { ok: false, reason: `parKeys 第 ${i + 1} 键 ${JSON.stringify(key)} 不在本关命令集里` }
    }
    if (out.kind === 'rep-success') return { ok: true, keys: keys.slice(0, i + 1) }
  }
  return {
    ok: false,
    reason: `parKeys 走完没有到达 target（终局 ${JSON.stringify(run.lines)}，目标 ${JSON.stringify(text.target)}）`,
  }
}

/**
 * 定 par（PLAN §14.3）：求解器在预算内找到的解更短就用它（proven）；
 * 否则用引擎验证通过的模型解（verified，与正篇 parKeys 同口径：可行但未必全局最优）。
 */
export function pickPar(
  text: { start: string[]; cursor: { line: number; col: number }; target: string[] },
  allowedKeys: string[],
  verified: Key[],
  solve: Solver,
): { keys: Key[]; source: ParSource } {
  const solved = solve({ start: text.start, cursor: text.cursor, target: text.target, allowedKeys })
  if (solved.ok && solved.keys.length <= verified.length) return { keys: solved.keys, source: 'proven' }
  return { keys: verified, source: 'verified' }
}

export function makeSandboxLevel(args: {
  id: string
  draft: CandidateDraft
  grid: boolean
  allowedKeys: string[]
  solverKeys: string[]
  parKeys: string
  parSource: ParSource
  params: ForgeParams
  model: string
  createdAt: number
}): SandboxLevel {
  return {
    id: args.id,
    title: args.draft.title,
    brief: args.draft.brief,
    grid: args.grid,
    allowedKeys: args.allowedKeys,
    solverKeys: args.solverKeys,
    text: {
      start: args.draft.start,
      target: args.draft.target,
      cursor: args.draft.cursor,
      parKeys: args.parKeys,
    },
    provenance: {
      tier: args.params.tier,
      difficulty: args.params.difficulty,
      model: args.model,
      createdAt: args.createdAt,
      parSource: args.parSource,
    },
    stats: emptyStats(),
  }
}

/**
 * 从解自动推导两级提示（PLAN §14.1 分工硬条款）：永远与引擎一致，模型无权写提示。
 * 用真引擎回放解，按模式区分命令键与文本输入，再把命令键流贪心匹配回已教序列。
 */
export function sandboxHints(text: LevelText, tier: ForgeTier): [string, string] {
  const keys = parseKeys(text.parKeys)
  const { seqs, typed } = solutionSummary(text, tier)
  const parts = [...seqs]
  if (typed > 0) parts.push(`${typed} 个字符输入`)
  const core = parts.length > 0 ? parts.join('、') : '最小修改'
  return [`本关核心：${core}（最优 ${keys.length} 键）。`, `完整解：${keys.join(' ')}`]
}

export function solutionSummary(text: LevelText, tier: ForgeTier): { seqs: string[]; typed: number } {
  const engine = new VimEngine({ lines: text.start, cursor: text.cursor })
  const normalKeys: Key[] = []
  let typed = 0
  for (const k of parseKeys(text.parKeys)) {
    const mode = engine.mode
    if (mode === 'insert' || mode === 'cmdline') {
      if (k.length === 1) typed += 1
    } else {
      normalKeys.push(k)
    }
    engine.press(k)
  }

  const seqSet = new Set<string>()
  for (const cmd of commandsUpTo(tier)) for (const s of seqsOf(cmd)) seqSet.add(s)

  const seqs: string[] = []
  let i = 0
  while (i < normalKeys.length) {
    let hit: string | null = null
    let used = 0
    for (let len = Math.min(4, normalKeys.length - i); len >= 1; len--) {
      const cand = normalKeys.slice(i, i + len).join('')
      if (seqSet.has(cand)) {
        hit = cand
        used = len
        break
      }
    }
    if (hit === null) {
      i += 1
      continue
    }
    // find 家族：后续一键是它的参数字符，并入同一命令展示
    if ((hit === 'f' || hit === 'F' || hit === 't' || hit === 'T') && i + used < normalKeys.length) {
      const nextKey = normalKeys[i + used]!
      if (nextKey.length === 1) {
        hit += nextKey
        used += 1
      }
    }
    seqs.push(hit)
    i += used
  }
  return { seqs: [...new Set(seqs)], typed }
}

/**
 * 导入即不可信（PLAN §14.4）：白名单必须属于声明命令档的已教集；
 * 解法逐键回放验证；par 由求解器复算，更短则覆盖文件值，否则沿用已验证解。
 */
export function verifySandboxLevel(
  level: SandboxLevel,
  solve: Solver,
): { ok: true; level: SandboxLevel } | { ok: false; reason: string } {
  // 旧数据/文件可能没有 solverKeys：回退到 allowedKeys（窄集合），再兜底补 Esc
  const solverKeys = [...new Set([...(level.solverKeys?.length ? level.solverKeys : level.allowedKeys), '<Esc>'])]
  const untaught = [...new Set([...level.allowedKeys, ...solverKeys])].filter(
    (k) => !isTaughtSeq(k, level.provenance.tier),
  )
  if (untaught.length > 0) {
    return { ok: false, reason: `白名单含第 ${level.provenance.tier} 章未教的序列：${untaught.slice(0, 5).join(' ')}` }
  }
  const verified = verifySolution(level.text, solverKeys, level.text.parKeys)
  if (!verified.ok) return { ok: false, reason: verified.reason }
  const picked = pickPar(level.text, solverKeys, verified.keys, solve)
  if (picked.keys.length < 1) return { ok: false, reason: '解为空' }
  return {
    ok: true,
    level: {
      ...level,
      solverKeys,
      text: { ...level.text, parKeys: toParKeys(picked.keys) },
      provenance: { ...level.provenance, parSource: picked.source },
    },
  }
}

/** 难度区间校验（生成闸门用） */
export function parRangeOf(params: ForgeParams): { min: number; max: number } {
  return PAR_RANGE[params.difficulty]
}

/** 沙盒关的 Level 形状视图（PlayScreen 复用）：提示由解推导、单变体、无教学卡 */
export function sandboxLevelView(level: SandboxLevel): Level {
  return {
    id: level.id,
    chapter: level.provenance.tier,
    title: level.title,
    brief: level.brief,
    hints: sandboxHints(level.text, level.provenance.tier),
    allowedKeys: level.allowedKeys,
    grid: level.grid,
    teaches: [],
    texts: [level.text],
  }
}

/** 单关成绩累计（只写沙盒库条目，与正篇 LevelRecord 无关） */
export function applySandboxResult(stats: SandboxStats, out: { stars: Stars; keys: number }): SandboxStats {
  const bestStars = Math.max(stats.bestStars, out.stars) as SandboxStats['bestStars']
  const bestKeys = stats.bestKeys === 0 ? out.keys : Math.min(stats.bestKeys, out.keys)
  return { bestStars, bestKeys, attempts: stats.attempts + 1 }
}

/** 放弃本轮（有操作才计 attempt）；不改最好成绩 */
export function applySandboxConcede(stats: SandboxStats): SandboxStats {
  return { ...stats, attempts: stats.attempts + 1 }
}
