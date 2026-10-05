import { describe, expect, it } from 'vitest'
import { isTaughtSeq } from '../../content/commands'
import { LevelRun } from '../../game/runtime'
import { parseKeys } from '../../engine'
import { solve } from '../../engine/solver'
import { createDemoProvider, DEMO_DRAFT } from '../providers/demo'
import { ForgeError } from '../providers/types'
import type { ChatMessage, ForgeProvider } from '../providers/types'
import { generateSandboxLevel } from '../generate'
import { makeSandboxLevel, sandboxHints, solutionSummary, taughtKeysFor, verifySandboxLevel } from '../level'
import type { Solver } from '../level'
import { DEFAULT_FORGE_PARAMS, toParKeys } from '../types'
import type { SandboxLevel } from '../types'

const solverWith = (n: number): Solver => () => ({ ok: true, keys: Array.from({ length: n }, () => 'x') })
const solverFail = (reason: 'budget' | 'unsolvable'): Solver => () => ({ ok: false, reason })

const params = (over: Partial<typeof DEFAULT_FORGE_PARAMS> = {}) => ({
  ...DEFAULT_FORGE_PARAMS,
  tier: 3 as const,
  difficulty: 'standard' as const,
  maxLines: 8,
  maxCols: 48,
  ...over,
})

/** 记录 provider 收到的消息，再委托给演示 provider */
function recording(inner: ForgeProvider): { provider: ForgeProvider; calls: ChatMessage[][] } {
  const calls: ChatMessage[][] = []
  return {
    calls,
    provider: {
      id: inner.id,
      label: inner.label,
      async chat(messages, opts) {
        calls.push(messages)
        return inner.chat(messages, opts)
      },
    },
  }
}

describe('taughtKeysFor（命令档 → 玩家白名单）', () => {
  it('按命令档取已教集，全部通过 isTaughtSeq 门禁', () => {
    for (const tier of [1, 3, 7] as const) {
      const wl = taughtKeysFor(tier)
      expect(wl.length).toBeGreaterThan(0)
      for (const seq of wl) expect(isTaughtSeq(seq, tier)).toBe(true)
    }
  })

  it('档位递进：ch2 有 w 无 dw，ch3 起有 dw/cw 与计数形态', () => {
    expect(taughtKeysFor(2)).toContain('j')
    expect(taughtKeysFor(2)).toContain('w')
    expect(taughtKeysFor(2)).not.toContain('dw')
    expect(taughtKeysFor(3)).toContain('dw')
    expect(taughtKeysFor(3)).toContain('cw')
    expect(taughtKeysFor(3)).toContain('2dd')
    expect(taughtKeysFor(2)).not.toContain('2dd')
    expect(taughtKeysFor(5)).toContain('V')
    expect(taughtKeysFor(2)).not.toContain('V')
  })
})

describe('generateSandboxLevel（闸门 + 回喂）', () => {
  it('成功：演示 fixture + 9 键解（标准档 7–12）→ 入库形态完整', async () => {
    const out = await generateSandboxLevel({
      provider: createDemoProvider(),
      model: 'demo',
      params: params(),
      solve: solverWith(9),
      makeId: () => 'sbx-gen-0001',
      now: () => 1_760_000_000_000,
    })
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.attempts).toBe(1)
      expect(out.level.id).toBe('sbx-gen-0001')
      expect(out.level.provenance).toEqual({
        tier: 3,
        difficulty: 'standard',
        model: 'demo',
        createdAt: 1_760_000_000_000,
        parSource: 'proven',
      })
      // 解耦（PLAN §14.1）：玩家白名单 = 命令档已教集（含 w/j 等），求解器字母表 = 模型声明的窄集合
      expect(out.level.solverKeys).toEqual(['f', 'cw', '<Esc>'])
      expect(out.level.allowedKeys).toContain('w')
      expect(out.level.allowedKeys).toContain('j')
      expect(out.level.allowedKeys).not.toContain('V')
      expect(out.level.text.parKeys).toBe('xxxxxxxxx')
      expect(out.level.stats).toEqual({ bestStars: 0, bestKeys: 0, attempts: 0 })
    }
  })

  it('解析失败 → 回喂重试，第二次成功（attempts=2，回喂带具体原因）', async () => {
    const rec = recording(createDemoProvider({ failFirst: true }))
    const out = await generateSandboxLevel({
      provider: rec.provider,
      model: 'demo',
      params: params(),
      solve: solverWith(9),
      makeId: () => 'sbx-gen-0002',
      now: () => 0,
    })
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.attempts).toBe(2)
    expect(rec.calls).toHaveLength(2)
    expect(rec.calls[1]).toHaveLength(4) // 原两条 + assistant 原文 + user 失败原因
    expect(rec.calls[1]![3]!.content).toContain('start')
  })

  it('par 不在区间 → 三次回喂后明确失败，不降级放行', async () => {
    const rec = recording(createDemoProvider())
    const out = await generateSandboxLevel({
      provider: rec.provider,
      model: 'demo',
      params: params(),
      solve: solverWith(3), // 标准档要求 7–12
      makeId: () => 'sbx-gen-0003',
      now: () => 0,
    })
    expect(out.ok).toBe(false)
    if (!out.ok && out.kind === 'exhausted') {
      expect(out.attempts).toBe(3)
      expect(out.reason).toContain('3 次按键')
      expect(out.reason).toContain('7–12')
    }
    expect(rec.calls).toHaveLength(3)
  })

  it('求解器预算耗尽 / 无解 → 回落到已验证的模型解（parSource=verified）', async () => {
    for (const reason of ['budget', 'unsolvable'] as const) {
      const out = await generateSandboxLevel({
        provider: createDemoProvider(),
        model: 'demo',
        params: params(),
        solve: solverFail(reason),
        makeId: () => 'sbx-gen-0004',
        now: () => 0,
      })
      expect(out.ok).toBe(true)
      if (out.ok) {
        expect(out.level.provenance.parSource).toBe('verified')
        expect(parseKeys(out.level.text.parKeys)).toHaveLength(9)
      }
    }
  })

  it('模型解在真引擎上走不通 → 回喂拒绝', async () => {
    const provider: ForgeProvider = {
      id: 'x',
      label: 'x',
      async chat() {
        return { text: JSON.stringify({ ...DEMO_DRAFT, parKeys: 'f9cw0000<Esc>' }) }
      },
    }
    const out = await generateSandboxLevel({
      provider,
      model: 'm',
      params: params(),
      solve: solverWith(9),
      makeId: () => 'sbx-gen-0008',
      now: () => 0,
      maxAttempts: 1,
    })
    expect(out.ok).toBe(false)
    if (!out.ok && out.kind === 'exhausted') expect(out.reason).toContain('parKeys')
  })

  it('provider 失败（如鉴权）不当作题目不合格重试：如实上报', async () => {
    let calls = 0
    const provider: ForgeProvider = {
      id: 'x',
      label: 'x',
      async chat() {
        calls += 1
        throw new ForgeError('auth', 'bad key', 401)
      },
    }
    const out = await generateSandboxLevel({
      provider,
      model: 'm',
      params: params(),
      solve: solverWith(9),
      makeId: () => 'sbx-gen-0005',
      now: () => 0,
    })
    expect(out).toMatchObject({ ok: false, kind: 'provider', attempts: 1 })
    expect(calls).toBe(1)
  })

  it('onAttempt 逐步上报（可见「第 n 次尝试」）', async () => {
    const seen: number[] = []
    await generateSandboxLevel({
      provider: createDemoProvider({ failFirst: true }),
      model: 'demo',
      params: params(),
      solve: solverWith(9),
      makeId: () => 'sbx-gen-0006',
      now: () => 0,
      onAttempt: (n) => seen.push(n),
    })
    expect(seen).toEqual([1, 2])
  })

  it('声明的命令不属于该章已教集 → 回喂拒绝', async () => {
    const provider: ForgeProvider = {
      id: 'x',
      label: 'x',
      async chat() {
        return {
          text: JSON.stringify({
            title: '越界',
            brief: '用了没教的命令。',
            start: ['a'],
            target: ['b'],
            cursor: { line: 0, col: 0 },
            commands: ['ciao'], // 不是第 3 章已教序列
            parKeys: 'ciao',
          }),
        }
      },
    }
    const out = await generateSandboxLevel({
      provider,
      model: 'm',
      params: params(),
      solve: solverWith(9),
      makeId: () => 'sbx-gen-0007',
      now: () => 0,
      maxAttempts: 1,
    })
    expect(out.ok).toBe(false)
    if (!out.ok && out.kind === 'exhausted') expect(out.reason).toContain('已教范围')
  })

  it('端到端（真求解器 + 演示 provider + 窄命令集）：9 键最优解落在标准档', async () => {
    const out = await generateSandboxLevel({
      provider: createDemoProvider(),
      model: 'demo',
      params: params(),
      solve,
      makeId: () => 'sbx-gen-e2e',
      now: () => 0,
    })
    expect(out.ok).toBe(true)
    if (out.ok) {
      // 解耦（PLAN §14.1）：玩家白名单 = 命令档已教集（含 w/j 等），求解器字母表 = 模型声明的窄集合
      expect(out.level.solverKeys).toEqual(['f', 'cw', '<Esc>'])
      expect(out.level.allowedKeys).toContain('w')
      expect(out.level.allowedKeys).toContain('j')
      expect(out.level.allowedKeys).not.toContain('V')
      expect(out.level.provenance.parSource).toBe('proven')
      const keys = parseKeys(out.level.text.parKeys)
      expect(keys).toHaveLength(9)
      const run = new LevelRun(out.level.text, out.level.allowedKeys)
      let last: ReturnType<typeof run.feed> | null = null
      for (const k of keys) last = run.feed(k)
      expect(last?.kind).toBe('rep-success')
    }
  }, 30_000)
})

describe('提示自动推导（模型无权写提示）', () => {
  it('从解提取命令序列与文本输入量，find 家族并入参数字符', () => {
    const text = { ...DEMO_DRAFT, cursor: { line: 0, col: 0 }, parKeys: 'f3cw8080<Esc>' }
    const s = solutionSummary(text, 3)
    expect(s.seqs).toEqual(['f3', 'cw'])
    expect(s.typed).toBe(4) // 8080，不含 <Esc>
    const [h1, h2] = sandboxHints(text, 3)
    expect(h1).toContain('f3')
    expect(h1).toContain('cw')
    expect(h1).toContain('4 个字符输入')
    expect(h1).toContain('最优 9 键')
    expect(h2).toBe('完整解：f 3 c w 8 0 8 0 <Esc>')
  })

  it('纯命令解不出现多余文本输入描述', () => {
    const text = { start: ['red'], target: ['red'], cursor: { line: 0, col: 0 }, parKeys: 'x' }
    const [, h2] = sandboxHints(text, 1)
    expect(h2).toBe('完整解：x')
  })
})

describe('verifySandboxLevel（导入即不可信）', () => {
  const base = (over: Partial<SandboxLevel> = {}): SandboxLevel => ({
    ...makeSandboxLevel({
      id: 'sbx-imp-0001',
      draft: { ...DEMO_DRAFT },
      grid: true,
      allowedKeys: taughtKeysFor(3),
      solverKeys: ['f', 'cw', '<Esc>'],
      parKeys: 'f3cw8080<Esc>',
      parSource: 'verified',
      params: params(),
      model: 'someone-else',
      createdAt: 0,
    }),
    ...over,
  })

  it('导入复算：求解器更短 → 覆盖为 proven；否则沿用已验证解', () => {
    const shorter = verifySandboxLevel(base(), solverWith(8))
    expect(shorter.ok).toBe(true)
    if (shorter.ok) {
      expect(shorter.level.text.parKeys).toBe('xxxxxxxx')
      expect(shorter.level.provenance.parSource).toBe('proven')
    }
    const longer = verifySandboxLevel(base(), solverWith(12))
    expect(longer.ok).toBe(true)
    if (longer.ok) {
      expect(longer.level.text.parKeys).toBe('f3cw8080<Esc>')
      expect(longer.level.provenance.parSource).toBe('verified')
    }
  })

  it('文件里的解法走不通 → 拒绝（不信文件）', () => {
    const r = verifySandboxLevel(base({ text: { ...base().text, parKeys: 'f9x<Esc>' } }), solverWith(8))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('parKeys')
  })

  it('白名单含该档未教序列 → 拒绝', () => {
    const r = verifySandboxLevel(base({ allowedKeys: [':%s/foo/bar/g'] }), solverWith(8))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('未教')
  })

  it('求解超预算 / 无解 → 不拒绝，落到 verified', () => {
    for (const reason of ['budget', 'unsolvable'] as const) {
      const r = verifySandboxLevel(base(), solverFail(reason))
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.level.provenance.parSource).toBe('verified')
    }
  })

  it('toParKeys 与 parseKeys 可逆', () => {
    expect(toParKeys(['f', '3', 'c', 'w', '<Esc>'])).toBe('f3cw<Esc>')
  })
})
