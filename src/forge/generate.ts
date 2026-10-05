import { appendRepair, buildDraftMessages } from './prompt'
import { extractJson, parseDraft } from './parse'
import { keysFromDeclared, makeSandboxLevel, parRangeOf, pickPar, verifySolution } from './level'
import type { Solver } from './level'
import { toParKeys } from './types'
import type { ForgeParams, SandboxLevel } from './types'
import type { ForgeProvider } from './providers/types'

export interface GenerateOptions {
  provider: ForgeProvider
  model: string
  params: ForgeParams
  /** 求解器（生产 = engine/solver.ts 的 solve；测试注入桩） */
  solve: Solver
  /** id 与时间都注入：forge 层不直接取全局时间 */
  makeId: () => string
  now: () => number
  /** 回喂重试上限（PLAN §14.7，默认 3） */
  maxAttempts?: number
  signal?: AbortSignal
  onAttempt?: (attempt: number, maxAttempts: number) => void
}

export type GenerateOutcome =
  | { ok: true; level: SandboxLevel; attempts: number }
  | { ok: false; kind: 'exhausted'; reason: string; attempts: number }
  | { ok: false; kind: 'provider'; error: unknown; attempts: number }

/**
 * 生成编排（PLAN §14.2）：请求 → 解析 → 结构校验 → 求解器 → 闸门；
 * 任一环不过就把具体原因回喂模型重试，仍不过则明确失败（不产出近似 par、不降级放行）。
 */
export async function generateSandboxLevel(opts: GenerateOptions): Promise<GenerateOutcome> {
  const maxAttempts = opts.maxAttempts ?? 3
  const range = parRangeOf(opts.params)
  let messages = buildDraftMessages(opts.params)
  let lastReason = '未生成'
  let attempts = 0

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt
    opts.onAttempt?.(attempt, maxAttempts)

    let text: string
    try {
      text = (await opts.provider.chat(messages, { signal: opts.signal })).text
    } catch (error) {
      // provider 层失败（网络/鉴权/限流/超时/取消）不当作「题目不合格」重试：如实上报
      return { ok: false, kind: 'provider', error, attempts }
    }

    const raw = extractJson(text)
    if (raw === null) {
      lastReason = '响应不是合法 JSON'
      messages = appendRepair(messages, text, lastReason)
      continue
    }
    const parsed = parseDraft(raw, { maxLines: opts.params.maxLines, maxCols: opts.params.maxCols })
    if (!parsed.ok) {
      lastReason = parsed.reason
      messages = appendRepair(messages, text, lastReason)
      continue
    }

    const keys = keysFromDeclared(opts.params.tier, parsed.draft.commands)
    if (!keys.ok) {
      lastReason = keys.reason
      messages = appendRepair(messages, text, lastReason)
      continue
    }

    // 闸门：模型解必须能被真引擎逐键走通（与正篇 parKeys 同口径；在白名单的窄集合上验）
    const verified = verifySolution(parsed.draft, keys.solverKeys, parsed.draft.parKeys)
    if (!verified.ok) {
      lastReason = verified.reason
      messages = appendRepair(messages, text, lastReason)
      continue
    }

    // 求解器在预算内更短就用它（proven），否则用已验证解（verified）
    const picked = pickPar(parsed.draft, keys.solverKeys, verified.keys, opts.solve)
    const par = picked.keys.length
    if (par < range.min || par > range.max) {
      const which = par < range.min ? '太简单' : '太难'
      lastReason = `解法需要 ${par} 次按键（模型解 ${verified.keys.length} 键），不在要求的 ${range.min}–${range.max} 区间（${which}）`
      messages = appendRepair(messages, text, lastReason)
      continue
    }

    const level = makeSandboxLevel({
      id: opts.makeId(),
      draft: parsed.draft,
      grid: parsed.grid,
      allowedKeys: keys.playKeys,
      solverKeys: keys.solverKeys,
      parKeys: toParKeys(picked.keys),
      parSource: picked.source,
      params: opts.params,
      model: opts.model,
      createdAt: opts.now(),
    })
    return { ok: true, level, attempts }
  }

  return { ok: false, kind: 'exhausted', reason: lastReason, attempts }
}
