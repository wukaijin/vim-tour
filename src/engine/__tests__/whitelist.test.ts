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

  it('count 数字段通配：教了 2gg 就能按 7gg / 10gg', () => {
    const f = new KeyFilter(['gg', '2gg'])
    expect(f.feed('g')).toBe('prefix')
    expect(f.feed('g')).toBe('match')
    expect(f.feed('7')).toBe('prefix')
    expect(f.feed('g')).toBe('prefix')
    expect(f.feed('g')).toBe('match')
    const g = new KeyFilter(['gg', '2gg'])
    expect(g.feed('1')).toBe('prefix')
    expect(g.feed('0')).toBe('prefix') // 段中 0 是计数的十位
    expect(g.feed('g')).toBe('prefix')
    expect(g.feed('g')).toBe('match')
  })

  it('count 中缀通配：教了 d2w 就能按 d4w / d12w', () => {
    const f = new KeyFilter(['dw', 'd2w'])
    expect(f.feed('d')).toBe('prefix')
    expect(f.feed('4')).toBe('prefix')
    expect(f.feed('w')).toBe('match')
    const g = new KeyFilter(['dw', 'd2w'])
    expect(g.feed('d')).toBe('prefix')
    expect(g.feed('1')).toBe('prefix')
    expect(g.feed('2')).toBe('prefix')
    expect(g.feed('w')).toBe('match')
  })

  it('通配只解放数字的值，不解放命令形态：d2w 不放行 d4e', () => {
    const f = new KeyFilter(['dw', 'de', 'd2w'])
    expect(f.feed('d')).toBe('prefix')
    expect(f.feed('4')).toBe('prefix')
    expect(f.feed('e')).toBe('reject')
    expect(f.feed('d')).toBe('prefix')
    expect(f.feed('e')).toBe('match')
  })

  it('没教 count（白名单无数字序列）时数字仍被拒', () => {
    const f = new KeyFilter(['h', 'w'])
    expect(f.feed('3')).toBe('reject')
    expect(f.feed('w')).toBe('match')
  })

  it("'0' 是行首 motion 不是计数：d0 字面放行，d 开头的数字段才通配", () => {
    const f = new KeyFilter(['d0', 'd2w'])
    expect(f.feed('d')).toBe('prefix')
    expect(f.feed('0')).toBe('match') // 0 走字面分支，不被 count 吸收
    const g = new KeyFilter(['d0', 'd2w'])
    expect(g.feed('d')).toBe('prefix')
    expect(g.feed('0')).toBe('match') // d0 命中即 reset
    expect(g.feed('w')).toBe('reject') // w 不在白名单（dw 没教）
    const h = new KeyFilter(['d0', 'd2w'])
    expect(h.feed('d')).toBe('prefix')
    expect(h.feed('0')).toBe('match')
    expect(h.feed('0')).toBe('reject') // 单独的 0（zero motion）没教
  })

  it('find 挂起时数字作为参数字符放行', () => {
    const f = new KeyFilter(['f'])
    expect(f.feed('f')).toBe('prefix')
    expect(f.feed('3')).toBe('match') // f3 = 在本行找字符 '3'
  })
})
