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

  it('插入模式 <BS>：行首退格与上一行合并，光标落在接缝处', () => {
    // 回归：合并行时 setLines 已把光标 clamp 到第 0 行，旧实现再减一得到 cursor.line = -1
    const r = run(['abc', 'def'], 'ji<BS>')
    expect(r.lines).toEqual(['abcdef'])
    expect(r.cursor).toEqual({ line: 0, col: 3 })
    expect(r.mode).toBe('insert')

    const noop = run(['a', 'b'], 'i<BS>')
    expect(noop.lines).toEqual(['a', 'b'])
    expect(noop.cursor).toEqual({ line: 0, col: 0 })
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

  it('最后一行的行尾词：w 目标为行尾，dw/yw 不落空', () => {
    // vim：没有下一行可跳时 w 前进到行尾，操作符按「删/抄到行尾」结算
    expect(run(['one two'], 'w', { line: 0, col: 4 }).cursor).toEqual({ line: 0, col: 6 })
    expect(run(['one two'], 'dw', { line: 0, col: 4 }).lines).toEqual(['one '])
    expect(run(TEXT, 'dw', { line: 2, col: 14 }).lines[2]).toBe('grault garply ')
    expect(run(['one two'], 'wyw$p', { line: 0, col: 0 }).lines).toEqual(['one twotwo'])
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

describe('ch6 查找替换：/ ? n N # * :s', () => {
  const FIND = ['aa target bb', 'cc target dd', 'ee target ff']

  it('/pat<CR> 跳到匹配首列；不匹配报 Pattern not found 且光标不动', () => {
    const r = run(TEXT, '/bar<CR>')
    expect(r.cursor).toEqual({ line: 0, col: 4 })
    expect(r.mode).toBe('normal')
    const e = new VimEngine({ lines: TEXT })
    e.pressAll('/zzz<CR>')
    expect(e.cursor).toEqual({ line: 0, col: 0 })
    expect(e.message).toBe('Pattern not found')
  })

  it('/ 跨行搜索与环绕回绕（wrap）', () => {
    expect(run(TEXT, '/quux<CR>').cursor).toEqual({ line: 1, col: 4 })
    expect(run(TEXT, 'G$/foo<CR>').cursor).toEqual({ line: 0, col: 0 })
  })

  it('?pat<CR> 反向搜索（取行内最后一处匹配）', () => {
    const r = run(['head alpha mid alpha end', 'plain'], '?alpha<CR>', { line: 0, col: 14 })
    expect(r.cursor).toEqual({ line: 0, col: 5 })
    expect(run(FIND, '?target<CR>', { line: 1, col: 0 }).cursor).toEqual({ line: 0, col: 3 })
  })

  it('n/N 沿历史方向翻转：? 后 n 同向（向后）、N 反向（向前）', () => {
    // 光标 (1,3)→?target→(0,3)；n 同向向后环绕到 (2,3)；N 反向向前回到 (0,3)
    const e = new VimEngine({ lines: FIND, cursor: { line: 1, col: 3 } })
    e.pressAll('?target<CR>')
    expect(e.cursor).toEqual({ line: 0, col: 3 })
    e.press('n')
    expect(e.cursor).toEqual({ line: 2, col: 3 })
    e.press('N')
    expect(e.cursor).toEqual({ line: 0, col: 3 })
  })

  it('/ 后 n 向前、N 向后；n 无历史报错', () => {
    const e = new VimEngine({ lines: FIND })
    e.pressAll('/target<CR>')
    expect(e.cursor).toEqual({ line: 0, col: 3 })
    e.press('n')
    expect(e.cursor).toEqual({ line: 1, col: 3 })
    e.press('N')
    expect(e.cursor).toEqual({ line: 0, col: 3 })
    const e2 = new VimEngine({ lines: FIND })
    e2.press('n')
    expect(e2.message).toBe('No previous search pattern')
  })

  it('/<CR> 空模式复用上次 pattern，方向按本次 /', () => {
    const e = new VimEngine({ lines: FIND, cursor: { line: 1, col: 0 } })
    e.pressAll('?target<CR>')
    e.pressAll('/<CR>')
    expect(e.cursor).toEqual({ line: 1, col: 3 })
  })

  it('/\<word\> 词边界：整词命中，前缀不命中', () => {
    expect(run(TEXT, '/\\<bar\\><CR>').cursor).toEqual({ line: 0, col: 4 })
    const e = new VimEngine({ lines: TEXT })
    e.pressAll('/\\<ba\\><CR>')
    expect(e.message).toBe('Pattern not found')
  })

  it('* 整词向前搜索（词边界，不命中长词）；# 反向', () => {
    const STAR = ['foo bar', 'foobar baz', 'foo qux']
    const e = new VimEngine({ lines: STAR })
    e.press('*')
    expect(e.cursor).toEqual({ line: 2, col: 0 })
    e.press('#')
    expect(e.cursor).toEqual({ line: 0, col: 0 })
  })

  it('* 搜过的词进入历史：n 沿历史方向继续（环绕回首处）；非词字符上 * 报 No word under cursor（简化）', () => {
    const e = new VimEngine({ lines: ['aa bb aa', 'x'] })
    e.press('*')
    expect(e.cursor).toEqual({ line: 0, col: 6 })
    e.press('n')
    expect(e.cursor).toEqual({ line: 0, col: 0 })
    const e2 = new VimEngine({ lines: TEXT, cursor: { line: 0, col: 3 } })
    e2.press('*')
    expect(e2.message).toBe('No word under cursor')
  })

  it('cmdline 编辑：<BS> 退格、删空后再按退出、<Esc> 取消不搜索', () => {
    const e = new VimEngine({ lines: TEXT })
    e.pressAll('/barx<BS><BS><CR>')
    expect(e.cursor).toEqual({ line: 0, col: 4 })
    e.pressAll('/zz<BS><BS><BS>')
    expect(e.mode).toBe('normal')
    const e2 = new VimEngine({ lines: TEXT })
    e2.pressAll('/qux<Esc>')
    expect(e2.mode).toBe('normal')
    expect(e2.cursor).toEqual({ line: 0, col: 0 })
  })

  it(':s/a/b/ 当前行首处替换，光标到行首', () => {
    const r = run(['alpha beta', 'alpha gamma'], ':s/alpha/X/<CR>')
    expect(r.lines).toEqual(['X beta', 'alpha gamma'])
    expect(r.cursor).toEqual({ line: 0, col: 0 })
  })

  it(':s/a/b/g 全行替换；:s/a/b/i 忽略大小写', () => {
    expect(run(['a a a'], ':s/a/B/g<CR>').lines).toEqual(['B B B'])
    expect(run(['Cat fish'], ':s/cat/dog/i<CR>').lines).toEqual(['dog fish'])
  })

  it(':%s 只动命中行，光标到最后替换行行首非空；g 全量', () => {
    const r = run(['  noise', 'a x a', 'zzz', '  a y'], ':%s/a/Z/<CR>')
    expect(r.lines).toEqual(['  noise', 'Z x a', 'zzz', '  Z y'])
    expect(r.cursor).toEqual({ line: 3, col: 2 })
    const r2 = run(['a a', 'nope', 'a'], ':%s/a/B/g<CR>')
    expect(r2.lines).toEqual(['B B', 'nope', 'B'])
    expect(r2.cursor).toEqual({ line: 2, col: 0 })
  })

  it(':s 引用：& 整个匹配、\\1 分组、\\/ 字面斜杠', () => {
    expect(run(['cat dog'], ':s/cat/[&]/<CR>').lines).toEqual(['[cat] dog'])
    expect(run(['cat dog'], ':s/\\(cat\\) \\(dog\\)/\\2 \\1/<CR>').lines).toEqual(['dog cat'])
    expect(run(['a/b'], ':s/a\\/b/X/<CR>').lines).toEqual(['X'])
  })

  it('u 一次撤销整批 :%s；无命中报 Pattern not found', () => {
    const e = new VimEngine({ lines: ['a b', 'a c'] })
    e.pressAll(':%s/a/Z/<CR>')
    expect(e.lines).toEqual(['Z b', 'Z c'])
    e.press('u')
    expect(e.lines).toEqual(['a b', 'a c'])
    e.pressAll(':%s/zz/y/<CR>')
    expect(e.message).toBe('Pattern not found')
    expect(e.lines).toEqual(['a b', 'a c'])
  })

  it('空 pattern 的 :s//x/ 报 No previous substitute pattern（简化：不复用）；未知 ex 命令报错', () => {
    const e = new VimEngine({ lines: TEXT })
    e.pressAll(':s//x/<CR>')
    expect(e.message).toBe('No previous substitute pattern')
    e.pressAll(':xyz<CR>')
    expect(e.message).toBe('Not an editor command: xyz')
  })
})
