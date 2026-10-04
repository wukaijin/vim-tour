import { describe, expect, it } from 'vitest'
import { VimEngine } from '../engine'
import { TEXT, run } from './helpers'

describe('ch1 生存：i a o O x dd yy p u', () => {
  it('i 进入插入模式，Esc 退出并左移一格', () => {
    const r = run(TEXT, 'iXY<Esc>')
    expect(r.lines[0]).toBe('XYfoo bar baz')
    expect(r.cursor).toEqual({ line: 0, col: 1 })
    expect(r.mode).toBe('normal')
  })

  it('a 在光标后插入', () => {
    expect(run(TEXT, 'a!').lines[0]).toBe('f!oo bar baz')
  })

  it('A 行尾追加 / I 行首插入', () => {
    expect(run(TEXT, 'A;').lines[0]).toBe('foo bar baz;')
    expect(run(['  ind', 'x'], 'I-<Esc>').lines[0]).toBe('  -ind')
  })

  it('o O 开新行', () => {
    const r = run(TEXT, 'onew<Esc>')
    expect(r.lines).toEqual(['foo bar baz', 'new', 'qux quux corge', 'grault garply waldo'])
    const r2 = run(TEXT, 'Otop<Esc>')
    expect(r2.lines[0]).toBe('top')
  })

  it('x 删除字符（含 count）', () => {
    expect(run(TEXT, 'x').lines[0]).toBe('oo bar baz')
    expect(run(TEXT, '3x').lines[0]).toBe(' bar baz')
    expect(run(TEXT, '4x').lines[0]).toBe('bar baz')
  })

  it('dd 删除行（含 count）', () => {
    expect(run(TEXT, 'dd').lines).toEqual(['qux quux corge', 'grault garply waldo'])
    expect(run(TEXT, '2dd').lines).toEqual(['grault garply waldo'])
  })

  it('yy p 复制粘贴行', () => {
    const r = run(TEXT, 'yyp')
    expect(r.lines).toEqual(['foo bar baz', 'foo bar baz', 'qux quux corge', 'grault garply waldo'])
    expect(r.cursor).toEqual({ line: 1, col: 0 })
    const r2 = run(TEXT, 'yy2p')
    expect(r2.lines).toHaveLength(5)
  })

  it('u 撤销 / C-r 重做', () => {
    const e = new VimEngine({ lines: TEXT })
    e.pressAll('x')
    expect(e.lines[0]).toBe('oo bar baz')
    e.press('u')
    expect(e.lines[0]).toBe('foo bar baz')
    e.press('<C-r>')
    expect(e.lines[0]).toBe('oo bar baz')
    e.pressAll('ddu')
    expect(e.lines).toHaveLength(3)
  })

  it('插入会话作为一次撤销单元', () => {
    const e = new VimEngine({ lines: TEXT })
    e.pressAll('iAB CD<Esc>')
    expect(e.lines[0]).toBe('AB CDfoo bar baz')
    e.press('u')
    expect(e.lines[0]).toBe('foo bar baz')
  })
})

describe('ch3 操作符 + 运动', () => {
  it('dw 删到下个词首', () => {
    expect(run(TEXT, 'dw').lines[0]).toBe('bar baz')
    expect(run(TEXT, 'dw', { line: 0, col: 4 }).lines[0]).toBe('foo baz')
  })

  it('dw 在行尾词上不跨行（vim 特例）', () => {
    const r = run(TEXT, 'dw', { line: 0, col: 8 })
    expect(r.lines).toEqual(['foo bar ', 'qux quux corge', 'grault garply waldo'])
  })

  it('d2w / d$ / d0 / de / db', () => {
    expect(run(TEXT, 'd2w').lines[0]).toBe('baz')
    expect(run(TEXT, 'd$', { line: 0, col: 4 }).lines[0]).toBe('foo ')
    expect(run(TEXT, 'd0', { line: 0, col: 8 }).lines[0]).toBe('baz')
    expect(run(TEXT, 'de').lines[0]).toBe(' bar baz')
    expect(run(TEXT, 'db', { line: 0, col: 4 }).lines[0]).toBe('bar baz')
  })

  it('dj dk dgg dG 行级删除', () => {
    expect(run(TEXT, 'dj').lines).toEqual(['grault garply waldo'])
    expect(run(TEXT, 'dk', { line: 1, col: 0 }).lines).toEqual(['grault garply waldo'])
    expect(run(TEXT, 'dgg', { line: 2, col: 0 }).lines).toEqual([''])
    expect(run(TEXT, 'dG', { line: 0, col: 0 }).lines).toEqual([''])
  })

  it('cw 特例：相当于 ce', () => {
    const r = run(TEXT, 'cwX<Esc>', { line: 0, col: 4 })
    expect(r.lines[0]).toBe('foo X baz')
  })

  it('c$ C 修改到行尾', () => {
    expect(run(TEXT, 'c$X<Esc>').lines[0]).toBe('X')
    expect(run(TEXT, 'CX<Esc>').lines[0]).toBe('X')
  })

  it('cc S 清空行', () => {
    expect(run(TEXT, 'ccnew<Esc>').lines).toEqual(['new', 'qux quux corge', 'grault garply waldo'])
    expect(run(TEXT, '2ccnew<Esc>').lines).toEqual(['new', 'grault garply waldo'])
  })

  it('s 删字符进插入', () => {
    expect(run(TEXT, '2sX<Esc>').lines[0]).toBe('Xo bar baz')
  })

  it('y 复制：yw p / yy P', () => {
    const r = run(TEXT, 'ywp')
    expect(r.lines[0]).toBe('ffoo oo bar baz')
    const r2 = run(TEXT, 'yyP')
    expect(r2.lines[0]).toBe('foo bar baz')
    expect(r2.lines[1]).toBe('foo bar baz')
    expect(r2.cursor.line).toBe(0)
  })

  it('计数相乘：2d3w = d6w', () => {
    expect(run(['a b c d e f g h', 'x'], '2d3w').lines[0]).toBe('g h')
  })

  it('J 合并行（智能空格）', () => {
    const r = run(TEXT, 'J')
    expect(r.lines).toEqual(['foo bar baz qux quux corge', 'grault garply waldo'])
    expect(r.cursor.col).toBe(11)
    expect(run(['a  ', '  b'], 'J').lines[0]).toBe('a  b')
    expect(run(['a', ''], 'J').lines[0]).toBe('a')
    expect(run(TEXT, '3J').lines).toEqual(['foo bar baz qux quux corge grault garply waldo'])
  })

  it('>> << 缩进（sw=2 空格）', () => {
    expect(run(TEXT, '>>').lines[0]).toBe('  foo bar baz')
    expect(run(TEXT, '2>>').lines[1]).toBe('  qux quux corge')
    expect(run(['    a'], '<<').lines[0]).toBe('  a')
  })
})

describe('寄存器', () => {
  it('具名寄存器 a 与默认寄存器隔离', () => {
    const e = new VimEngine({ lines: TEXT })
    e.pressAll('"add')
    expect(e.lines).toEqual(['qux quux corge', 'grault garply waldo'])
    e.pressAll('x') // "x" 删除 'q'，unnamed 更新
    expect(e.getRegister('a')?.text).toEqual(['foo bar baz'])
    e.pressAll('"ap')
    expect(e.lines[1]).toBe('foo bar baz')
  })

  it('"0 仅被无具名 yank 更新', () => {
    const e = new VimEngine({ lines: TEXT })
    e.pressAll('yy"byy')
    expect(e.getRegister('0')?.text).toEqual(['foo bar baz'])
    e.pressAll('dd')
    expect(e.getRegister('0')?.text).toEqual(['foo bar baz'])
  })
})

describe('. 重复与 undo 边界', () => {
  it('. 重复 dw', () => {
    const r = run(TEXT, 'dw.')
    expect(r.lines[0]).toBe('baz')
  })

  it('. 重复 x（保留原计数）', () => {
    expect(run(TEXT, '4x.').lines[0]).toBe('baz')
  })

  it('. 新计数覆盖旧计数', () => {
    expect(run(TEXT, '2x3.').lines[0]).toBe('ar baz')
  })

  it('. 重复 A 追加', () => {
    const e = new VimEngine({ lines: TEXT })
    e.pressAll('A!<Esc>')
    expect(e.lines[0]).toBe('foo bar baz!')
    e.press('j')
    e.press('.')
    expect(e.lines[1]).toBe('qux quux corge!')
  })

  it('. 重复插入会话（就地插在当前光标处）', () => {
    expect(run(TEXT, 'i--<Esc>j.').lines).toEqual(['--foo bar baz', 'q--ux quux corge', 'grault garply waldo'])
  })

  it('. 不覆盖自身（连按语义稳定）', () => {
    const e = new VimEngine({ lines: ['ab'] })
    e.pressAll('x..')
    expect(e.lines[0]).toBe('')
  })

  it('Esc 清空 pending 状态', () => {
    const e = new VimEngine({ lines: TEXT })
    e.pressAll('2d<Esc>w')
    expect(e.cursor).toEqual({ line: 0, col: 4 })
    expect(e.pendingEcho()).toBe('')
  })

  it('pendingEcho 显示 pending 序列', () => {
    const e = new VimEngine({ lines: TEXT })
    e.pressAll('2d')
    expect(e.pendingEcho()).toBe('2d')
    e.pressAll('3')
    expect(e.pendingEcho()).toBe('2d3')
  })
})
