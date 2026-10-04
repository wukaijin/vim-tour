import { describe, expect, it } from 'vitest'
import { run } from './helpers'

describe('ch4 文本对象', () => {
  it('diw / daw', () => {
    expect(run(['foo bar baz'], 'diw').lines[0]).toBe(' bar baz')
    expect(run(['foo bar baz'], 'diw', { line: 0, col: 4 }).lines[0]).toBe('foo  baz')
    expect(run(['foo bar baz'], 'daw').lines[0]).toBe('bar baz')
    expect(run(['foo bar baz'], 'daw', { line: 0, col: 4 }).lines[0]).toBe('foo baz')
  })

  it('ciw 修改词', () => {
    expect(run(['foo bar baz'], 'ciwX<Esc>', { line: 0, col: 4 }).lines[0]).toBe('foo X baz')
  })

  it('di( / da( / ci(', () => {
    expect(run(['fn(a, b)'], 'di(', { line: 0, col: 3 }).lines[0]).toBe('fn()')
    expect(run(['fn(a, b)'], 'da(', { line: 0, col: 3 }).lines[0]).toBe('fn')
    expect(run(['fn(a, b)'], 'ci(X<Esc>', { line: 0, col: 3 }).lines[0]).toBe('fn(X)')
    // 光标在开括号/闭括号上同样生效
    expect(run(['fn(a, b)'], 'di(', { line: 0, col: 2 }).lines[0]).toBe('fn()')
    expect(run(['fn(a, b)'], 'di)', { line: 0, col: 7 }).lines[0]).toBe('fn()')
  })

  it('di{ 跨行删除块内内容', () => {
    const lines = ['fn(a, b) {', '  return a + b;', '}']
    expect(run(lines, 'di{', { line: 1, col: 2 }).lines).toEqual(['fn(a, b) {', '}'])
  })

  it('嵌套括号取最内层', () => {
    expect(run(['f(g(x))'], 'di(', { line: 0, col: 3 }).lines[0]).toBe('f(g())')
    expect(run(['f(g(x))'], 'di(', { line: 0, col: 5 }).lines[0]).toBe('f(g())')
    expect(run(['f(g(x))'], 'di(', { line: 0, col: 2 }).lines[0]).toBe('f()')
  })

  it('di" / da" / ci"', () => {
    expect(run(['say("hello")'], 'di"', { line: 0, col: 6 }).lines[0]).toBe('say("")')
    expect(run(['say("hello")'], 'da"', { line: 0, col: 6 }).lines[0]).toBe('say()')
    expect(run(['say("hello")'], 'ci"X<Esc>', { line: 0, col: 6 }).lines[0]).toBe('say("X")')
    // 光标在引号上
    expect(run(['say("hello")'], 'di"', { line: 0, col: 5 }).lines[0]).toBe('say("")')
  })

  it('dit 取最内层标签', () => {
    const lines = ['<div>', '  <p>hi</p>', '</div>']
    expect(run(lines, 'dit', { line: 1, col: 5 }).lines).toEqual(['<div>', '  <p></p>', '</div>'])
    expect(run(lines, 'dit', { line: 0, col: 1 }).lines).toEqual(['<div>', '</div>'])
    expect(run(['<p>hi</p>'], 'dit', { line: 0, col: 4 }).lines[0]).toBe('<p></p>')
  })

  it('dip / dap 段落', () => {
    const lines = ['a', 'b', '', 'c', '']
    expect(run(lines, 'dip', { line: 0, col: 0 }).lines).toEqual(['', 'c', ''])
    expect(run(lines, 'dap', { line: 0, col: 0 }).lines).toEqual(['c', ''])
  })

  it('yiw 复制词', () => {
    const r = run(['foo bar'], 'yiw', { line: 0, col: 4 })
    r.engine.pressAll('p')
    expect(r.engine.lines[0]).toBe('foo bbarar')
  })
})
