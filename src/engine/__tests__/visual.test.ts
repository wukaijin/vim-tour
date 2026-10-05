import { describe, expect, it } from 'vitest'
import { TEXT, run } from './helpers'

describe('ch5 visual 模式', () => {
  it('v 字符选择后删除', () => {
    expect(run(TEXT, 'vlld').lines[0]).toBe(' bar baz')
    expect(run(TEXT, 'ved').lines[0]).toBe(' bar baz')
    expect(run(TEXT, 'viwd', { line: 0, col: 4 }).lines[0]).toBe('foo  baz')
  })

  it('v 向后选择再 o 反向也正确', () => {
    const r = run(TEXT, 'vllod')
    expect(r.lines[0]).toBe(' bar baz')
  })

  it('V 行选择：删除 / 复制 / 缩进', () => {
    expect(run(TEXT, 'Vd').lines).toEqual(['qux quux corge', 'grault garply waldo'])
    expect(run(TEXT, 'Vyjp').lines).toEqual(['foo bar baz', 'qux quux corge', 'foo bar baz', 'grault garply waldo'])
    expect(run(TEXT, 'Vj>').lines).toEqual(['  foo bar baz', '  qux quux corge', 'grault garply waldo'])
  })

  it('V c 修改整块行', () => {
    expect(run(TEXT, 'Vcnew<Esc>').lines).toEqual(['new', 'qux quux corge', 'grault garply waldo'])
  })

  it('Esc / 再按 v 退出选择', () => {
    const e = run(TEXT, 'vl<Esc>').engine
    expect(e.mode).toBe('normal')
    expect(e.lines[0]).toBe('foo bar baz')
    const e2 = run(TEXT, 'vlv').engine
    expect(e2.mode).toBe('normal')
  })

  it('visual J 合并', () => {
    expect(run(TEXT, 'VjJ').lines).toEqual(['foo bar baz qux quux corge', 'grault garply waldo'])
  })

  it('visual p 用寄存器替换选择', () => {
    expect(run(TEXT, 'yiwwviwp', { line: 0, col: 4 }).lines[0]).toBe('foo bar bar')
  })
})

describe('visual block（C-v）', () => {
  const COLS = ['abc', 'defg', 'hi']

  it('块删除', () => {
    expect(run(COLS, '<C-v>jjld').lines).toEqual(['c', 'fg', ''])
  })

  it('块 yank 后块粘贴', () => {
    const e = run(COLS, '<C-v>jjly').engine
    expect(e.getRegister('"')?.text).toEqual(['ab', 'de', 'hi'])
    e.pressAll('$p')
    expect(e.lines).toEqual(['ababc', 'dedefg', 'hihi'])
  })

  it('块 A 追加（插在块右缘之后）', () => {
    expect(run(COLS, '<C-v>jjlA!<Esc>').lines).toEqual(['ab!c', 'de!fg', 'hi!'])
  })

  it('块 I 前插', () => {
    expect(run(COLS, '<C-v>jjlI-<Esc>').lines).toEqual(['-abc', '-defg', '-hi'])
  })

  it('块 c 修改', () => {
    expect(run(COLS, '<C-v>jjlcX<Esc>').lines).toEqual(['Xc', 'Xfg', ''])
  })

  it('块缩进', () => {
    expect(run(COLS, '<C-v>jj>').lines).toEqual(['  abc', '  defg', '  hi'])
  })

  it('A 跳过太短的行', () => {
    expect(run(['abc', 'c'], '<C-v>ljA!<Esc>').lines).toEqual(['ab!c', 'c'])
  })

  it('块插入虚显：pending 期间暴露其余行应叠加的已键文本', () => {
    const e = run(COLS, '<C-v>jjI# ').engine
    expect(e.blockInsertPending()).toEqual([
      { line: 1, col: 0, text: '# ' },
      { line: 2, col: 0, text: '# ' },
    ])
    e.pressAll('<Esc>')
    expect(e.blockInsertPending()).toBeNull()
    expect(e.lines).toEqual(['# abc', '# defg', '# hi'])
  })

  it('块插入虚显：刚进入尚未键入时 text 为空串（供多行虚显光标定位）', () => {
    expect(run(COLS, '<C-v>jjI').engine.blockInsertPending()).toEqual([
      { line: 1, col: 0, text: '' },
      { line: 2, col: 0, text: '' },
    ])
  })

  it('块插入虚显：行不满足套用条件则不虚显（与 Esc 套用判定一致）', () => {
    expect(run(['abc', 'c'], '<C-v>ljA!').engine.blockInsertPending()).toEqual([])
    expect(run(COLS, '<C-v>jjlcX').engine.blockInsertPending()).toEqual([{ line: 1, col: 0, text: 'X' }])
  })
})
