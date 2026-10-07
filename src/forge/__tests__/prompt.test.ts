import { describe, expect, it } from 'vitest'
import { commandsUpTo } from '../../content/commands'
import { appendRepair, buildDraftMessages, DIFFICULTY_BRIEF, PATTERN_POOL, THEME_POOL } from '../prompt'
import { rollTier } from '../types'
import { DEFAULT_FORGE_PARAMS, FORGE_TIERS } from '../types'

describe('buildDraftMessages', () => {
  it('按命令档列出可用命令（条数与 commandsUpTo 一致）', () => {
    for (const tier of [1, 3, 7] as const) {
      const msgs = buildDraftMessages({ ...DEFAULT_FORGE_PARAMS, tier })
      const user = msgs[1]!.content
      const listed = user.split('\n').filter((l) => l.startsWith('- ')).length
      expect(listed).toBe(commandsUpTo(tier).length)
    }
  })

  it('写入难度区间、规模上限与题材', () => {
    const msgs = buildDraftMessages({
      ...DEFAULT_FORGE_PARAMS,
      tier: 3,
      difficulty: 'hardcore',
      maxLines: 5,
      maxCols: 48,
      theme: 'nginx 配置',
    })
    const user = msgs[1]!.content
    expect(user).toContain('13–18')
    expect(user).toContain('最多 5 行')
    expect(user).toContain('48 个字符')
    expect(user).toContain('nginx 配置')
    expect(msgs[0]!.content).toContain('只输出一个 JSON 对象')
  })

  it('题材为空时从题材池抽一个（避免千篇一律的端口题），并注入的 rng 可确定性', () => {
    const msgs = buildDraftMessages({ ...DEFAULT_FORGE_PARAMS, theme: '   ' }, undefined, () => 0)
    expect(msgs[1]!.content).toContain(`题材：${THEME_POOL[0]}`)
    const last = buildDraftMessages({ ...DEFAULT_FORGE_PARAMS, theme: '' }, undefined, () => 0.999999)
    expect(last[1]!.content).toContain(`题材：${THEME_POOL[THEME_POOL.length - 1]}`)
    expect(last[1]!.content).toContain('端口')
  })

  it('玩家填了题材就用它，不被池子覆盖', () => {
    const msgs = buildDraftMessages({ ...DEFAULT_FORGE_PARAMS, theme: 'K8s 清单' }, undefined, () => 0)
    expect(msgs[1]!.content).toContain('题材：K8s 清单')
    expect(msgs[1]!.content).not.toContain(THEME_POOL[0])
  })

  it('system 提示词明确要求题材变化，且示例不再是「找数字改词」', () => {
    const sys = buildDraftMessages(DEFAULT_FORGE_PARAMS)[0]!.content
    expect(sys).toContain('不要每次都出')
    expect(sys).toContain('["w","dw","<Esc>"]')
  })

  it('难度要求按复杂度档分化注入：不再全局压成「一两处编辑」', () => {
    const sys = buildDraftMessages(DEFAULT_FORGE_PARAMS)[0]!.content
    // 旧的「小而明确」全局限制已删——编辑规模交给分档的难度要求
    expect(sys).not.toContain('一到两处编辑')
    for (const difficulty of ['light', 'standard', 'hardcore'] as const) {
      const user = buildDraftMessages({ ...DEFAULT_FORGE_PARAMS, difficulty })[1]!.content
      expect(user).toContain(`难度要求：${DIFFICULTY_BRIEF[difficulty]}`)
    }
    // 硬核档的核心反例：不许用移动键凑按键数（治「长途跋涉改一个词」）
    expect(DIFFICULTY_BRIEF.hardcore).toContain('凑按键数')
    expect(DIFFICULTY_BRIEF.light).toContain('一两处小编辑')
  })

  it('题型方向注入：只从该命令档撑得起的原型里抽（minTier 过滤）', () => {
    const tier1 = buildDraftMessages({ ...DEFAULT_FORGE_PARAMS, tier: 1 }, undefined, () => 0.999999)[1]!.content
    const tier1Pool = PATTERN_POOL.filter((p) => p.minTier <= 1)
    expect(tier1).toContain(`题型方向：${tier1Pool[tier1Pool.length - 1]!.text}`)
    // 第 1 章抽不到高章原型（括号内改写是 ch4 的文本对象、搜索定位是 ch6 的）
    expect(tier1).not.toContain('定界改写')
    expect(tier1).not.toContain('查找定位')

    const tier7 = buildDraftMessages({ ...DEFAULT_FORGE_PARAMS, tier: 7 }, undefined, () => 0)[1]!.content
    expect(tier7).toContain(`题型方向：${PATTERN_POOL[0]!.text}`)
    // 原型只描述结构，不剧透该用哪个命令（提示由引擎从解法推导）
    for (const p of PATTERN_POOL) {
      expect(p.text).not.toMatch(/ciw|:%s|\.\s|<C-v>/)
    }
  })
})

describe('rollTier（「随机」档解析）', () => {
  it('具体档原样返回，不碰 rng', () => {
    for (const t of FORGE_TIERS) expect(rollTier(t, () => 0.999999)).toBe(t)
  })

  it("'random' 落在 1–7 且注入 rng 可确定性", () => {
    expect(rollTier('random', () => 0)).toBe(1)
    expect(rollTier('random', () => 0.999999)).toBe(7)
    for (const r of [0.05, 0.2, 0.4, 0.6, 0.8, 0.99]) {
      const t = rollTier('random', () => r)
      expect(FORGE_TIERS).toContain(t)
    }
  })
})

describe('appendRepair（回喂重试，PLAN §14.2）', () => {
  it('追加 assistant 原文 + 具体失败原因', () => {
    const base = buildDraftMessages(DEFAULT_FORGE_PARAMS)
    const next = appendRepair(base, '{"title":"坏"}', 'start 需要 1–4 行，实际 0 行')
    expect(next).toHaveLength(base.length + 2)
    expect(next[base.length]).toEqual({ role: 'assistant', content: '{"title":"坏"}' })
    expect(next[base.length + 1]!.content).toContain('start 需要 1–4 行，实际 0 行')
    // 原消息不被修改
    expect(base).toHaveLength(2)
  })
})
