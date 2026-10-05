import { describe, expect, it } from 'vitest'
import { LevelRun, sameLines } from '../runtime'
import type { LevelText } from '../types'

const variant = (over?: Partial<LevelText>): LevelText => ({
  start: ['cat'],
  target: ['car'],
  cursor: { line: 0, col: 2 },
  parKeys: 'xar<Esc>',
  ...over,
})

const CH1 = ['h', 'l', 'x', 'i', 'a', 'u', '<Esc>']

describe('sameLines：成功判定口径', () => {
  it('逐行严格一致', () => {
    expect(sameLines(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(sameLines(['a'], ['a', ''])).toBe(false)
    expect(sameLines(['a '], ['a'])).toBe(false)
    expect(sameLines([], [''])).toBe(false)
  })
})

describe('LevelRun：diff 制任务运行时', () => {
  it('par 解法 → rep 成功且 3 星', () => {
    const run = new LevelRun(variant(), CH1)
    expect(run.par).toBe(4)
    for (const k of ['x', 'a', 'r', '<Esc>']) {
      const r = run.feed(k)
      if (k === '<Esc>') {
        expect(r).toMatchObject({ kind: 'rep-success', stars: 3, keys: 4 })
      } else {
        expect(r.kind).toBe('accepted')
      }
    }
    expect(run.status).toBe('success')
    expect(run.lines).toEqual(['car'])
  })

  it('等价解法被接受（不比对按键序列）', () => {
    // 从行首走过去再 xar：路线不同、键数超预算，但照样过关
    const run = new LevelRun(variant({ cursor: { line: 0, col: 0 } }), CH1)
    for (const k of ['h', 'l', 'l', 'l', 'x', 'a', 'r', '<Esc>']) run.feed(k)
    expect(run.status).toBe('success')
    expect(run.stars()).toBe(1)
  })

  it('白名单拒绝：未教键不进引擎、不计击键、缓冲区不变', () => {
    const run = new LevelRun(variant(), CH1)
    expect(run.feed('d')).toEqual({ kind: 'untaught' })
    expect(run.keys).toBe(0)
    expect(run.lines).toEqual(['cat'])
    for (const k of ['x', 'a', 'r', '<Esc>']) run.feed(k)
    expect(run.status).toBe('success')
    expect(run.keys).toBe(4) // untaught 键不计
    expect(run.stars()).toBe(3)
  })

  it('ch5 起白名单完全放开：未配置时任意命令键放行（PLAN §2.5）', () => {
    const run = new LevelRun(
      variant({ start: ['foo bar'], target: ['bar'], cursor: { line: 0, col: 0 }, parKeys: 'dw' }),
    )
    expect(run.feed('<C-v>').kind).toBe('accepted') // ch1–4 从未教的键
    run.feed('<Esc>')
    run.feed('d')
    const r = run.feed('w')
    expect(r).toMatchObject({ kind: 'rep-success' })
    expect(run.keys).toBe(4) // 放开档位下每个键都计击键
  })

  it('insert 模式下任意可打印字符放行（白名单只管命令层）', () => {
    const run = new LevelRun(variant({ start: ['bc'], target: ['bZc'], cursor: { line: 0, col: 1 } }), [
      'i',
      '<Esc>',
    ])
    expect(run.feed('i').kind).toBe('accepted')
    expect(run.feed('Z').kind).toBe('accepted')
    expect(run.lines).toEqual(['bZc'])
    const r = run.feed('<Esc>')
    expect(r).toMatchObject({ kind: 'rep-success', stars: 3 })
  })

  it('cmdline 模式下命令文本放行（:s 换词）', () => {
    const run = new LevelRun(
      variant({ start: ['foo bar'], target: ['foo baz'], cursor: { line: 0, col: 0 }, parKeys: ':s/bar/baz/<CR>' }),
      [':'],
    )
    for (const ch of ':s/bar/baz/') run.feed(ch)
    const r = run.feed('<CR>')
    expect(r).toMatchObject({ kind: 'rep-success', stars: 3 })
    expect(run.status).toBe('success')
    expect(run.par).toBe(12)
  })

  it('insert 会话中缓冲区达标不判定，Esc 到 normal 才判定（Esc 计入击键）', () => {
    const run = new LevelRun(variant({ start: ['ab'], target: ['abc'], cursor: { line: 0, col: 1 } }), ['a', '<Esc>'])
    run.feed('a')
    run.feed('c')
    expect(run.lines).toEqual(['abc'])
    expect(run.status).toBe('playing') // 尚未 Esc，不算完成
    const r = run.feed('<Esc>')
    expect(r).toMatchObject({ kind: 'rep-success', keys: 3, stars: 3 }) // par = 'ac<Esc>' = 3
  })

  it('撤销挡 3 星：keys ≤ par 但用过 u → 2 星', () => {
    const run = new LevelRun(variant(), CH1)
    for (const k of ['x', 'u', 'x', 'a', 'r', '<Esc>']) run.feed(k)
    expect(run.lines).toEqual(['car'])
    expect(run.status).toBe('success')
    expect(run.keys).toBe(6)
    expect(run.stars()).toBe(2) // 6 > par 4 拿不到 3 星；6 ≤ 1.5×4 = 6 → 2 星
  })

  it('看提示封顶 1 星', () => {
    const run = new LevelRun(variant(), CH1)
    run.markHint(1)
    for (const k of ['x', 'a', 'r', '<Esc>']) run.feed(k)
    expect(run.status).toBe('success')
    expect(run.stars()).toBe(1)
  })

  it('超 1.5×par → 1 星', () => {
    const run = new LevelRun(variant({ cursor: { line: 0, col: 0 } }), CH1)
    for (const k of ['h', 'l', 'l', 'x', 'a', 'r', '<Esc>']) run.feed(k)
    expect(run.stars()).toBe(1)
  })

  it('concede：未按键不算失败；按过键计失败；终局后 feed 被忽略', () => {
    const untouched = new LevelRun(variant(), CH1)
    expect(untouched.concede()).toBe(false)
    expect(untouched.status).toBe('playing')

    const run = new LevelRun(variant(), CH1)
    run.feed('x')
    expect(run.concede()).toBe(true)
    expect(run.status).toBe('failed')
    expect(run.feed('a')).toEqual({ kind: 'ignored' })
    expect(run.concede()).toBe(false)
  })

  it('成功后继续 feed 被忽略', () => {
    const run = new LevelRun(variant(), CH1)
    for (const k of ['x', 'a', 'r', '<Esc>']) run.feed(k)
    expect(run.feed('x')).toEqual({ kind: 'ignored' })
  })

  it('pendingEcho 透传引擎回显', () => {
    const run = new LevelRun(variant(), CH1)
    run.feed('x')
    expect(run.pendingEcho()).toBe('')
    run.feed('a')
    expect(run.mode).toBe('insert')
  })
})
