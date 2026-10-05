import { describe, expect, it } from 'vitest'
import { keysOf } from '../../content/commands'
import { LevelRun } from '../../game/runtime'
import type { LevelText } from '../../game/types'
import { VimEngine } from '../engine'
import { KeyFilter } from '../whitelist'
import { parseKeys } from '../types'
import type { Key } from '../types'
import { solve } from '../solver'

/** 把解喂给真 LevelRun：必须零 untaught 且 rep-success */
function converges(t: LevelText, allowedKeys: string[], keys: Key[]): boolean {
  const run = new LevelRun(t, allowedKeys)
  for (const k of keys) {
    const out = run.feed(k)
    if (out.kind === 'untaught') return false
    if (out.kind === 'rep-success') return true
  }
  return false
}

/** 不去重的暴力 BFS：限深最小长度，用于验证去重无损 */
function bruteMin(
  input: { start: string[]; cursor: { line: number; col: number }; target: string[]; allowedKeys: string[] },
  maxDepth: number,
): number | null {
  type Node = { engine: VimEngine; filter: KeyFilter; keys: Key[] }
  const root: Node = {
    engine: new VimEngine({ lines: input.start, cursor: input.cursor }),
    filter: new KeyFilter(input.allowedKeys),
    keys: [],
  }
  const done = (n: Node): boolean =>
    n.engine.mode === 'normal' &&
    n.engine.lines.length === input.target.length &&
    n.engine.lines.every((l, i) => l === input.target[i])
  let level: Node[] = [root]
  for (let d = 0; d < maxDepth; d++) {
    const next: Node[] = []
    for (const n of level) {
      const alphabet = [...new Set(input.allowedKeys.flatMap((s) => parseKeys(s)))].filter((k) => k !== 'u' && k !== '<C-r>')
      for (const key of ['<Esc>', ...alphabet]) {
        const filter = n.filter.clone()
        if (filter.feed(key) === 'reject') continue
        const engine = n.engine.clone()
        engine.press(key)
        const child: Node = { engine, filter, keys: [...n.keys, key] }
        if (done(child)) return d + 1
        next.push(child)
      }
    }
    level = next
    if (level.length > 200_000) throw new Error('brute force 爆炸：用例太大')
  }
  return null
}

describe('solve（最短解搜索）', () => {
  it('ch1-01：找到 3 键最优解，且解过真 LevelRun 收敛', () => {
    const allowedKeys = keysOf(['esc', 'i'])
    const t: LevelText = {
      start: ['vim is uick'],
      target: ['vim is quick'],
      cursor: { line: 0, col: 7 },
      parKeys: 'iq<Esc>',
    }
    const r = solve({ start: t.start, cursor: t.cursor, target: t.target, allowedKeys })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.keys).toHaveLength(3)
      expect(converges(t, allowedKeys, r.keys)).toBe(true)
    }
  })

  it('起始态即目标 → 0 键（上层闸门会拒绝这种题）', () => {
    const r = solve({ start: ['same'], cursor: { line: 0, col: 0 }, target: ['same'], allowedKeys: keysOf(['esc']) })
    expect(r).toEqual({ ok: true, keys: [] })
  })

  it('与不去重暴力 BFS 比对（去重必须无损）', () => {
    const cases = [
      { start: ['ab'], cursor: { line: 0, col: 0 }, target: ['b'], allowedKeys: ['x'] },
      { start: ['abc'], cursor: { line: 0, col: 0 }, target: ['axc'], allowedKeys: ['l', 'x', 'i', 'y', '<Esc>'] },
      // 需要 `;`（lastFind 状态）才能到最后一个点：去重若吞掉 lastFind 会解出更长或解不出
      { start: ['x.x.x'], cursor: { line: 0, col: 0 }, target: ['x.x.'], allowedKeys: ['f', ';', 'x'] },
    ]
    for (const c of cases) {
      const brute = bruteMin(c, 5)
      const r = solve(c)
      expect(r.ok, JSON.stringify(c)).toBe(true)
      if (r.ok && brute !== null) expect(r.keys.length).toBe(brute)
    }
  })

  it('寄存器态不被去重吞掉：yy + p 的最短解是 3 键', () => {
    const allowedKeys = keysOf(['yy', 'p'])
    const t: LevelText = { start: ['aaa'], target: ['aaa', 'aaa'], cursor: { line: 0, col: 0 }, parKeys: 'yyp' }
    const r = solve({ start: t.start, cursor: t.cursor, target: t.target, allowedKeys })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.keys.length).toBe(3)
      expect(converges(t, allowedKeys, r.keys)).toBe(true)
    }
  })

  it('预算耗尽返回 budget，无解返回 unsolvable', () => {
    const tight = solve(
      { start: ['abcdef'], cursor: { line: 0, col: 0 }, target: ['zyxwvu'], allowedKeys: ['h', 'l', 'x'] },
      { maxKeys: 2 },
    )
    expect(tight.ok).toBe(false)
    if (!tight.ok) expect(['budget', 'unsolvable']).toContain(tight.reason)

    const unreachable = solve(
      { start: ['abc'], cursor: { line: 0, col: 0 }, target: ['xyz'], allowedKeys: ['h', 'l'] },
      { maxStates: 5000, maxKeys: 4 },
    )
    expect(unreachable.ok).toBe(false)
    if (!unreachable.ok) expect(unreachable.reason).toBe('unsolvable')
  })
})
