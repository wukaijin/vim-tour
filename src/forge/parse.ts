import type { CandidateDraft } from './types'

/** PLAN §9.3① 同款 CJK 区间；含 CJK 的沙盒关自动 grid:false */
const CJK_RE = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/
const CONTROL_RE = /[\u0000-\u001f\u007f]/

export interface DraftLimits {
  maxLines: number
  maxCols: number
}

export type ParseDraftResult =
  | { ok: true; draft: CandidateDraft; grid: boolean }
  | { ok: false; reason: string }

/**
 * 从模型回答里抠出 JSON（容忍代码围栏与前后废话）。解析不出返回 null。
 * 纯函数，可单测；坏输入的具体原因由 parseDraft 负责。
 */
export function extractJson(text: string): unknown | null {
  const trimmed = text.trim()
  const candidates: string[] = [trimmed]
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const fenced = fence?.[1]
  if (fenced) candidates.push(fenced.trim())
  const balanced = sliceBalancedObject(trimmed)
  if (balanced) candidates.push(balanced)
  for (const c of candidates) {
    try {
      return JSON.parse(c) as unknown
    } catch {
      // 试下一个候选
    }
  }
  return null
}

/** 取第一个 '{' 到与之配对的 '}'（字符串与转义感知） */
function sliceBalancedObject(s: string): string | null {
  const start = s.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

/**
 * 候选题材的结构校验（闸门第一关，PLAN §14.2）。
 * 失败原因会被回喂给模型，所以每条都必须具体、可执行。
 * 行尾空白统一裁剪：模型爱在不该有的地方留尾随空格，会让「目标完全一致」的判定变成陷阱题。
 */
export function parseDraft(raw: unknown, limits: DraftLimits): ParseDraftResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: '顶层不是 JSON 对象' }
  }
  const r = raw as Record<string, unknown>

  const title = typeof r.title === 'string' ? r.title.trim() : ''
  if (!title || title.length > 40) return { ok: false, reason: 'title 缺失或超过 40 字' }
  const brief = typeof r.brief === 'string' ? r.brief.trim() : ''
  if (!brief || brief.length > 200) return { ok: false, reason: 'brief 缺失或超过 200 字' }

  const start = readLines(r.start, limits, 'start')
  if (typeof start === 'string') return { ok: false, reason: start }
  const target = readLines(r.target, limits, 'target')
  if (typeof target === 'string') return { ok: false, reason: target }

  if (start.every((l) => l === '')) return { ok: false, reason: 'start 全是空行' }
  if (target.every((l) => l === '')) return { ok: false, reason: 'target 全是空行' }
  if (start.join('\n') === target.join('\n')) {
    return { ok: false, reason: 'target 与 start 完全相同：题目必须要有修改' }
  }

  const cursor = readCursor(r.cursor, start)
  const commands = readCommands(r.commands)
  if (typeof commands === 'string') return { ok: false, reason: commands }
  const parKeys = typeof r.parKeys === 'string' ? r.parKeys.trim() : ''
  if (!parKeys || parKeys.length > 120) return { ok: false, reason: 'parKeys 缺失或超过 120 字符' }
  const grid = ![...start, ...target].some((l) => CJK_RE.test(l))
  return { ok: true, draft: { title, brief, start, target, cursor, commands, parKeys }, grid }
}

/** 本关命令集：1–12 项、每项是可用命令里的序列（是否已教由闸门按命令档再验） */
function readCommands(v: unknown): string[] | string {
  if (!Array.isArray(v)) return 'commands 必须是字符串数组（本题要用的命令，如 ["f","cw","<Esc>"]）'
  const out: string[] = []
  for (const c of v) {
    if (typeof c !== 'string' || c.length === 0 || c.length > 8 || /\s/.test(c)) {
      return `commands 含非法项 ${JSON.stringify(c)}`
    }
    if (!out.includes(c)) out.push(c)
  }
  if (out.length === 0 || out.length > 12) return `commands 需要 1–12 项，实际 ${out.length}`
  return out
}

/** 返回 string 表示失败原因；返回 string[] 表示通过（行尾空白已裁剪） */
function readLines(v: unknown, limits: DraftLimits, name: 'start' | 'target'): string[] | string {
  if (!Array.isArray(v)) return `${name} 必须是字符串数组`
  if (v.length < 1 || v.length > limits.maxLines) {
    return `${name} 需要 1–${limits.maxLines} 行，实际 ${v.length} 行`
  }
  const out: string[] = []
  for (let i = 0; i < v.length; i++) {
    const line = v[i]
    if (typeof line !== 'string') return `${name} 第 ${i + 1} 行不是字符串`
    const trimmed = line.replace(/\s+$/, '')
    if (trimmed.length > limits.maxCols) {
      return `${name} 第 ${i + 1} 行 ${trimmed.length} 字符，超过上限 ${limits.maxCols}`
    }
    if (CONTROL_RE.test(trimmed)) return `${name} 第 ${i + 1} 行含控制字符`
    out.push(trimmed)
  }
  return out
}

/** 光标越界不判失败，收敛到合法值（模型给 0,0 也能用；PLAN 不比对光标） */
function readCursor(v: unknown, start: string[]): { line: number; col: number } {
  const c = (v ?? {}) as Record<string, unknown>
  const line = clampInt(c.line, 0, start.length - 1)
  const len = (start[line] ?? '').length
  const col = clampInt(c.col, 0, Math.max(0, len - 1))
  return { line, col }
}

function clampInt(v: unknown, lo: number, hi: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : lo
  return Math.min(hi, Math.max(lo, n))
}
