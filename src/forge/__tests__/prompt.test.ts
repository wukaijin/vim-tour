import { describe, expect, it } from 'vitest'
import { commandsUpTo } from '../../content/commands'
import { appendRepair, buildDraftMessages, THEME_POOL } from '../prompt'
import { DEFAULT_FORGE_PARAMS } from '../types'

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
