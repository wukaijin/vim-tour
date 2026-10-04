import { describe, expect, it } from 'vitest'
import { VimEngine } from '../engine'
import { TEXT, run } from './helpers'

describe(' motions：光标移动', () => {
  it('h l 左右移动', () => {
    expect(run(TEXT, 'l').cursor).toEqual({ line: 0, col: 1 })
    expect(run(TEXT, 'lll').cursor).toEqual({ line: 0, col: 3 })
    expect(run(TEXT, 'h', { line: 0, col: 3 }).cursor).toEqual({ line: 0, col: 2 })
    expect(run(TEXT, '3l').cursor).toEqual({ line: 0, col: 3 })
  })

  it('j k 上下移动并 clamp 到行尾', () => {
    expect(run(TEXT, 'j').cursor).toEqual({ line: 1, col: 0 })
    expect(run(TEXT, 'j', { line: 1, col: 0 }).cursor).toEqual({ line: 2, col: 0 })
    expect(run(TEXT, 'k', { line: 2, col: 0 }).cursor).toEqual({ line: 1, col: 0 })
    expect(run(TEXT, '9j').cursor.line).toBe(2)
    expect(run(TEXT, '9k').cursor.line).toBe(0)
  })

  it('j 保留期望列（短行回弹）', () => {
    const e = new VimEngine({ lines: ['abcdef', 'x', 'abcdef'], cursor: { line: 0, col: 5 } })
    e.pressAll('jj')
    expect(e.cursor).toEqual({ line: 2, col: 5 })
  })

  it('w b e 词移动', () => {
    expect(run(TEXT, 'w').cursor).toEqual({ line: 0, col: 4 })
    expect(run(TEXT, '2w').cursor).toEqual({ line: 0, col: 8 })
    expect(run(TEXT, 'w', { line: 0, col: 8 }).cursor).toEqual({ line: 1, col: 0 })
    expect(run(TEXT, 'e').cursor).toEqual({ line: 0, col: 2 })
    expect(run(TEXT, 'e', { line: 0, col: 2 }).cursor).toEqual({ line: 0, col: 6 })
    expect(run(TEXT, 'b', { line: 0, col: 8 }).cursor).toEqual({ line: 0, col: 4 })
    expect(run(TEXT, '2b', { line: 0, col: 8 }).cursor).toEqual({ line: 0, col: 0 })
    expect(run(TEXT, 'b', { line: 1, col: 0 }).cursor).toEqual({ line: 0, col: 8 })
  })

  it('0 ^ $ 行首行尾', () => {
    expect(run(TEXT, '0', { line: 0, col: 5 }).cursor).toEqual({ line: 0, col: 0 })
    expect(run(TEXT, '$').cursor).toEqual({ line: 0, col: 10 })
    expect(run(TEXT, '^', { line: 0, col: 5 }).cursor).toEqual({ line: 0, col: 0 })
    expect(run(['  indented', 'x'], '^').cursor).toEqual({ line: 0, col: 2 })
  })

  it('gg G 跳行', () => {
    expect(run(TEXT, 'G').cursor).toEqual({ line: 2, col: 0 })
    expect(run(TEXT, '2G').cursor).toEqual({ line: 1, col: 0 })
    expect(run(TEXT, 'gg', { line: 2, col: 5 }).cursor).toEqual({ line: 0, col: 0 })
    expect(run(TEXT, '3gg').cursor).toEqual({ line: 2, col: 0 })
    expect(run(TEXT, '99G').cursor.line).toBe(2)
  })

  it('f F t T 行内查找与 ; ,', () => {
    expect(run(TEXT, 'fb').cursor).toEqual({ line: 0, col: 4 })
    expect(run(TEXT, '2fb').cursor).toEqual({ line: 0, col: 8 })
    expect(run(TEXT, 'Fb', { line: 0, col: 10 }).cursor).toEqual({ line: 0, col: 8 })
    expect(run(TEXT, 'tb', { line: 0, col: 0 }).cursor).toEqual({ line: 0, col: 3 })
    expect(run(TEXT, 'fb;').cursor).toEqual({ line: 0, col: 8 })
    expect(run(TEXT, 'fb,'.split('').join(''), { line: 0, col: 0 }).cursor).toEqual({ line: 0, col: 4 })
    expect(run(TEXT, 'fq').cursor).toEqual({ line: 0, col: 0 })
  })
})
