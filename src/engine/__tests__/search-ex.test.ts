import { describe, expect, it } from 'vitest'
import { TEXT, run } from './helpers'

describe('ch6 搜索', () => {
  it('/ 正向搜索 + n N', () => {
    expect(run(TEXT, '/baz<CR>').cursor).toEqual({ line: 0, col: 8 })
    expect(run(TEXT, '/quux<CR>').cursor).toEqual({ line: 1, col: 4 })
    const r = run(TEXT, '/a<CR>')
    expect(r.cursor).toEqual({ line: 0, col: 5 })
    r.engine.press('n')
    expect(r.engine.cursor).toEqual({ line: 0, col: 9 })
    r.engine.press('N')
    expect(r.engine.cursor).toEqual({ line: 0, col: 5 })
  })

  it('/ 环绕与失败消息', () => {
    const e = run(TEXT, '/waldo<CR>').engine
    expect(e.cursor).toEqual({ line: 2, col: 14 })
    e.press('n') // 环绕
    expect(e.cursor).toEqual({ line: 2, col: 14 })
    e.pressAll('/nope<CR>')
    expect(e.message).toBe('Pattern not found')
  })

  it('? 反向搜索', () => {
    expect(run(TEXT, '?quux<CR>', { line: 2, col: 0 }).cursor).toEqual({ line: 1, col: 4 })
  })

  it('* # 整词搜索', () => {
    const e = run(['foo bar', 'bar foo'], '*', { line: 0, col: 0 }).engine
    expect(e.cursor).toEqual({ line: 1, col: 4 })
    e.press('#')
    expect(e.cursor).toEqual({ line: 0, col: 0 })
  })

  it('搜索支持正则', () => {
    expect(run(TEXT, '/q.x+<CR>').cursor).toEqual({ line: 1, col: 0 })
  })
})

describe('ch6 :s 替换', () => {
  it(':s 当前行首个匹配', () => {
    expect(run(['foo foo'], ':s/foo/bar/<CR>').lines[0]).toBe('bar foo')
  })

  it(':s///g 全部匹配', () => {
    expect(run(['foo foo'], ':s/foo/bar/g<CR>').lines[0]).toBe('bar bar')
  })

  it(':%s 全文件替换（无 g 时每行首个）', () => {
    expect(run(TEXT, ':%s/a/@/<CR>').lines).toEqual(['foo b@r baz', 'qux quux corge', 'gr@ult garply waldo'])
  })

  it(':%s/g 组合', () => {
    expect(run(TEXT, ':%s/a/@/g<CR>').lines[0]).toBe('foo b@r b@z')
  })

  it('替换串支持 \\1 反向引用与 &', () => {
    expect(run(['foo bar'], ':s/\\(foo\\) \\(bar\\)/\\2 \\1/<CR>').lines[0]).toBe('bar foo')
    expect(run(['ab'], ':s/a/&&/<CR>').lines[0]).toBe('aab')
  })

  it('光标落到最后一个替换行', () => {
    const r = run(TEXT, ':%s/waldo/WALDO/<CR>')
    expect(r.lines[2]).toBe('grault garply WALDO')
    expect(r.cursor.line).toBe(2)
  })

  it(':wq :q 为 no-op，未知命令报消息', () => {
    const r = run(TEXT, ':wq<CR>')
    expect(r.lines).toEqual(TEXT)
    expect(run(TEXT, ':zzz<CR>').engine.message).toContain('Not an editor command')
  })

  it('Esc 取消 cmdline', () => {
    const r = run(TEXT, ':s/foo<Esc>')
    expect(r.lines).toEqual(TEXT)
  })

  it(':s 省略替换串 = 删除匹配', () => {
    expect(run(['foo bar'], ':s/foo/<CR>').lines[0]).toBe(' bar')
  })
})

describe('whitelist 按键白名单', () => {
  it('前缀/命中/拒绝三态', async () => {
    const { KeyFilter } = await import('../whitelist')
    const f = new KeyFilter(['h', 'j', 'dd', 'x'])
    expect(f.feed('d')).toBe('prefix')
    expect(f.feed('d')).toBe('match')
    expect(f.feed('x')).toBe('match')
    f.feed('d')
    expect(f.feed('w')).toBe('reject')
    expect(f.feed('h')).toBe('match')
  })

  it('Esc 重置 pending 缓冲', async () => {
    const { KeyFilter } = await import('../whitelist')
    const f = new KeyFilter(['dd'])
    f.feed('d')
    f.feed('<Esc>')
    expect(f.feed('d')).toBe('prefix')
  })

  it('特殊键 token 作为整体匹配', async () => {
    const { KeyFilter } = await import('../whitelist')
    const f = new KeyFilter(['<C-v>'])
    expect(f.feed('<C-v>')).toBe('match')
    const f2 = new KeyFilter(['gg'])
    expect(f2.feed('g')).toBe('prefix')
    expect(f2.feed('g')).toBe('match')
  })
})
