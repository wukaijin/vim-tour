import { describe, expect, it } from 'vitest'
import { loadAllLevels } from '../../content'
import { parseKeys } from '../../engine'
import type { LevelText } from '../types'
import { comboOf } from '../combo'

const t = (parKeys: string, start: string[]): LevelText => ({
  parKeys,
  start,
  target: [...start],
  cursor: { line: 0, col: 0 },
})

describe('comboOf：连招组块切分（PLAN §2.4D）', () => {
  it('连续同键合并为 count 形态（jjj → 3×j）', () => {
    expect(comboOf(t('Vj>jjjVj<', ['a', 'b', 'c', 'd', 'e']))).toEqual([
      { kind: 'tap', key: 'V', count: 1 },
      { kind: 'tap', key: 'j', count: 1 },
      { kind: 'tap', key: '>', count: 1 },
      { kind: 'tap', key: 'j', count: 3 },
      { kind: 'tap', key: 'V', count: 1 },
      { kind: 'tap', key: 'j', count: 1 },
      { kind: 'tap', key: '<', count: 1 },
    ])
  })

  it('insert 输入聚合为一个文本块，不逐键拆碎（打字是内容不是连招）', () => {
    expect(comboOf(t('Vjcfresh<Esc>', ['old1', 'old2']))).toEqual([
      { kind: 'tap', key: 'V', count: 1 },
      { kind: 'tap', key: 'j', count: 1 },
      { kind: 'tap', key: 'c', count: 1 },
      { kind: 'type', text: 'fresh' },
      { kind: 'tap', key: '<Esc>', count: 1 },
    ])
  })

  it('insert 文本含空格原样保留（I# <Esc>）', () => {
    expect(comboOf(t('<C-v>jjI# <Esc>', ['ab', 'ab', 'ab']))).toEqual([
      { kind: 'tap', key: '<C-v>', count: 1 },
      { kind: 'tap', key: 'j', count: 2 },
      { kind: 'tap', key: 'I', count: 1 },
      { kind: 'type', text: '# ' },
      { kind: 'tap', key: '<Esc>', count: 1 },
    ])
  })

  it('cmdline 正文聚合为文本块，引导键与 <CR> 保持命令键', () => {
    expect(comboOf(t(':s/cat/ox/<CR>', ['a cat b']))).toEqual([
      { kind: 'tap', key: ':', count: 1 },
      { kind: 'type', text: 's/cat/ox/' },
      { kind: 'tap', key: '<CR>', count: 1 },
    ])
    expect(comboOf(t('/todo<CR>dd', ['alpha', 'todo here', 'beta']))).toEqual([
      { kind: 'tap', key: '/', count: 1 },
      { kind: 'type', text: 'todo' },
      { kind: 'tap', key: '<CR>', count: 1 },
      { kind: 'tap', key: 'd', count: 2 },
    ])
  })

  it('全书所有关卡：组块键数与 parseKeys 守恒，且文本块只含单字符', async () => {
    const levels = await loadAllLevels()
    for (const level of levels) {
      for (const variant of level.texts) {
        const chunks = comboOf(variant)
        expect(chunks.length, level.id).toBeGreaterThan(0)
        let n = 0
        for (const c of chunks) {
          if (c.kind === 'tap') n += c.count
          else {
            n += c.text.length
            for (const ch of c.text) expect(ch.length, level.id).toBe(1)
          }
        }
        expect(n, level.id).toBe(parseKeys(variant.parKeys).length)
      }
    }
  })
})
