import { describe, expect, it } from 'vitest'
import { KeyFilter } from '../whitelist'

describe('KeyFilter', () => {
  it('完整命中后重置，可继续下一条命令', () => {
    const f = new KeyFilter(['h', 'dd'])
    expect(f.feed('d')).toBe('prefix')
    expect(f.feed('d')).toBe('match')
    expect(f.feed('h')).toBe('match')
  })

  it('未教序列被拒绝并重置', () => {
    const f = new KeyFilter(['h'])
    expect(f.feed('d')).toBe('reject')
    expect(f.feed('h')).toBe('match')
  })

  it('Esc 总是放行并清空挂起序列', () => {
    const f = new KeyFilter(['dd'])
    expect(f.feed('d')).toBe('prefix')
    expect(f.feed('<Esc>')).toBe('match')
    const g = new KeyFilter(['h'])
    expect(g.feed('d')).toBe('reject')
  })

  it('find 键命中后保持挂起，任意单字符完成命令', () => {
    const f = new KeyFilter(['f', 't', ';'])
    expect(f.feed('f')).toBe('prefix')
    expect(f.feed('z')).toBe('match') // f{char} 的 char 不受白名单限制
    expect(f.feed('t')).toBe('prefix')
    expect(f.feed(',')).toBe('match')
    expect(f.feed(';')).toBe('match')
  })

  it('未教 find 键整体被拒绝', () => {
    const f = new KeyFilter(['h', 'x'])
    expect(f.feed('f')).toBe('reject')
  })

  it('计数形态需要显式列入序列', () => {
    const f = new KeyFilter(['gg', '3gg'])
    expect(f.feed('g')).toBe('prefix')
    expect(f.feed('g')).toBe('match')
    expect(f.feed('3')).toBe('prefix')
    expect(f.feed('g')).toBe('prefix')
    expect(f.feed('g')).toBe('match')
    expect(f.feed('7')).toBe('reject')
  })
})
