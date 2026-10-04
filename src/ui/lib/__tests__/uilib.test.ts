import { describe, expect, it } from 'vitest'
import { diffLines } from '../diff'
import { eventToKey } from '../keys'

describe('diffLines', () => {
  it('完全一致时全是 same', () => {
    expect(diffLines(['a', 'b'], ['a', 'b'])).toEqual([
      { type: 'same', text: 'a' },
      { type: 'same', text: 'b' },
    ])
  })

  it('增删行混合时按 LCS 对齐', () => {
    const rows = diffLines(['alpha', 'beta', 'gamma'], ['alpha', 'delta', 'gamma'])
    expect(rows).toEqual([
      { type: 'same', text: 'alpha' },
      { type: 'del', text: 'beta' },
      { type: 'add', text: 'delta' },
      { type: 'same', text: 'gamma' },
    ])
  })

  it('缓冲区收敛后 diff 消失（成功判定的镜像）', () => {
    expect(diffLines(['x'], ['x']).every((r) => r.type === 'same')).toBe(true)
  })
})

describe('eventToKey', () => {
  const ev = (key: string, extra: Partial<Parameters<typeof eventToKey>[0]> = {}) => ({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    ...extra,
  })

  it('可打印字符直通', () => {
    expect(eventToKey(ev('x'))).toBe('x')
    expect(eventToKey(ev(' '))).toBe(' ')
    expect(eventToKey(ev(':'))).toBe(':')
  })

  it('命名键映射为尖括号 token', () => {
    expect(eventToKey(ev('Enter'))).toBe('<CR>')
    expect(eventToKey(ev('Backspace'))).toBe('<BS>')
    expect(eventToKey(ev('Tab'))).toBe('<Tab>')
    expect(eventToKey(ev('Escape'))).toBe('<Esc>')
  })

  it('Ctrl+R 映射为 redo；其他组合键与方向键忽略', () => {
    expect(eventToKey(ev('r', { ctrlKey: true }))).toBe('<C-r>')
    expect(eventToKey(ev('r', { metaKey: true }))).toBe('<C-r>')
    expect(eventToKey(ev('c', { ctrlKey: true }))).toBeNull()
    expect(eventToKey(ev('ArrowLeft'))).toBeNull()
  })

  it('IME 组合期间不产生按键', () => {
    expect(eventToKey(ev('a', { isComposing: true }))).toBeNull()
  })
})
