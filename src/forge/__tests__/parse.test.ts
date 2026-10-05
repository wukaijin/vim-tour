import { describe, expect, it } from 'vitest'
import { extractJson, parseDraft } from '../parse'

const LIMITS = { maxLines: 4, maxCols: 40 }

const draft = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  title: '改端口',
  brief: '把写死的端口改掉。',
  start: ['port = 3000;'],
  target: ['port = 8080;'],
  cursor: { line: 0, col: 0 },
  commands: ['f', 'cw', '<Esc>'],
  parKeys: 'f3cw8080<Esc>',
  ...over,
})

describe('extractJson', () => {
  it('裸 JSON / 代码围栏 / 前后废话都能抠出来', () => {
    const raw = JSON.stringify(draft())
    expect(extractJson(raw)).toMatchObject({ title: '改端口' })
    expect(extractJson('```json\n' + raw + '\n```')).toMatchObject({ title: '改端口' })
    expect(extractJson('好的，这是关卡：\n' + raw + '\n希望满意！')).toMatchObject({ title: '改端口' })
  })

  it('解析不出返回 null', () => {
    expect(extractJson('完全不是 JSON')).toBeNull()
    expect(extractJson('{"title": "缺尾巴"')).toBeNull()
  })
})

describe('parseDraft（闸门第一关）', () => {
  it('合法候选通过，并给出 grid', () => {
    const r = parseDraft(draft(), LIMITS)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.grid).toBe(true)
      expect(r.draft.start).toEqual(['port = 3000;'])
      expect(r.draft.commands).toEqual(['f', 'cw', '<Esc>'])
    }
  })

  it('行尾空白统一裁剪（防尾随空格陷阱题）', () => {
    const r = parseDraft(draft({ start: ['port = 3000;   '], target: ['port = 8080;\t'] }), LIMITS)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.draft.start).toEqual(['port = 3000;'])
      expect(r.draft.target).toEqual(['port = 8080;'])
    }
  })

  it('含 CJK 自动 grid:false（PLAN §9.3① 同款规则）', () => {
    const r = parseDraft(draft({ start: ['端口 = 3000;'], target: ['端口 = 8080;'] }), LIMITS)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.grid).toBe(false)
  })

  it('失败原因具体、可回喂', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ title: '' }, 'title'],
      [{ brief: 'x'.repeat(201) }, 'brief'],
      [{ start: '不是数组' }, 'start'],
      [{ start: [] }, 'start'],
      [{ start: Array(5).fill('a') }, '1–4 行'],
      [{ start: ['x'.repeat(41)] }, '超过上限 40'],
      [{ start: ['a\u0001b'] }, '控制字符'],
      [{ target: ['port = 3000;'] }, '完全相同'],
      [{ start: [''] }, '空行'],
      [{ commands: 'f' }, 'commands 必须是字符串数组'],
      [{ commands: [] }, 'commands 需要 1–12 项'],
      [{ commands: ['f', 'c w'] }, 'commands 含非法项'],
      [{ commands: Array.from({ length: 13 }, (_, i) => `k${i}`) }, 'commands 需要 1–12 项'],
      [{ parKeys: '' }, 'parKeys 缺失'],
    ]
    for (const [over, needle] of cases) {
      const r = parseDraft(draft(over), LIMITS)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toContain(needle)
    }
  })

  it('光标越界收敛到合法值，不判失败', () => {
    const r = parseDraft(draft({ cursor: { line: 9, col: 99 } }), LIMITS)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.draft.cursor).toEqual({ line: 0, col: 11 }) // 'port = 3000;' 长 12，col 上限 11
  })

  it('顶层不是对象 → 拒绝', () => {
    expect(parseDraft([], LIMITS).ok).toBe(false)
    expect(parseDraft('字符串', LIMITS).ok).toBe(false)
  })
})
