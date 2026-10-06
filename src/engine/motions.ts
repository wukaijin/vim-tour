import type { Cursor } from './types'

export type MotionKind = 'exclusive' | 'inclusive' | 'linewise'
export interface MotionResult {
  target: Cursor
  kind: MotionKind
}

const WORD_RE = /[A-Za-z0-9_]/

export const isWordChar = (ch: string) => WORD_RE.test(ch)

type Cls = 'word' | 'punct' | 'space' | 'eol'

/** 光标位置分类：col >= 行长视为 'eol'（空行的 col 0 也是） */
export function classOf(lines: string[], p: Cursor): Cls {
  const s = lines[p.line]
  if (p.col >= s.length) return 'eol'
  const ch = s[p.col]
  if (ch === ' ' || ch === '\t') return 'space'
  return isWordChar(ch) ? 'word' : 'punct'
}

/** 下一个字符位置（col == len 表示行尾） */
export function nextPos(lines: string[], p: Cursor): Cursor | null {
  if (p.col < lines[p.line].length) return { line: p.line, col: p.col + 1 }
  if (p.line + 1 < lines.length) return { line: p.line + 1, col: 0 }
  return null
}

/** 上一个实际字符位置（col <= len-1；空行则是 (l,0)） */
export function prevChar(lines: string[], p: Cursor): Cursor | null {
  if (p.col > 0) return { line: p.line, col: p.col - 1 }
  if (p.line > 0) {
    const pl = p.line - 1
    return { line: pl, col: Math.max(0, lines[pl].length - 1) }
  }
  return null
}

export const clampCursor = (lines: string[], p: Cursor): Cursor => ({
  line: Math.min(Math.max(p.line, 0), lines.length - 1),
  col: Math.min(Math.max(p.col, 0), Math.max(0, lines[p.line]?.length ? lines[p.line].length - 1 : 0)),
})

export const firstNonBlank = (line: string): number => {
  const m = line.match(/\S/)
  return m?.index ?? 0
}

/** 行首（col 0） */
export const lineStart = (_lines: string[], cur: Cursor): MotionResult => ({
  target: { line: cur.line, col: 0 },
  kind: 'exclusive',
})

/** 首个非空白字符 */
export const firstNonBlankMotion = (lines: string[], cur: Cursor): MotionResult => ({
  target: { line: cur.line, col: firstNonBlank(lines[cur.line]) },
  kind: 'exclusive',
})

/** 行尾（停在最后一个字符上） */
export const lineEnd = (lines: string[], cur: Cursor, count: number): MotionResult => {
  const line = Math.min(cur.line + count - 1, lines.length - 1)
  return { target: { line, col: Math.max(0, lines[line].length - 1) }, kind: 'inclusive' }
}

export function charLeft(_lines: string[], cur: Cursor, count: number): MotionResult {
  const col = Math.max(0, cur.col - count)
  return { target: { line: cur.line, col }, kind: 'exclusive' }
}

export function charRight(lines: string[], cur: Cursor, count: number): MotionResult {
  const max = Math.max(0, lines[cur.line].length - 1)
  return { target: { line: cur.line, col: Math.min(max, cur.col + count) }, kind: 'exclusive' }
}

export function lineDown(lines: string[], cur: Cursor, count: number, desiredCol: number | null): MotionResult {
  const line = Math.min(cur.line + count, lines.length - 1)
  const max = Math.max(0, lines[line].length - 1)
  const col = Math.min(desiredCol ?? cur.col, max)
  return { target: { line, col }, kind: 'linewise' }
}

export function lineUp(lines: string[], cur: Cursor, count: number, desiredCol: number | null): MotionResult {
  const line = Math.max(0, cur.line - count)
  const max = Math.max(0, lines[line].length - 1)
  const col = Math.min(desiredCol ?? cur.col, max)
  return { target: { line, col }, kind: 'linewise' }
}

export function gotoLine(lines: string[], count: number | null): MotionResult {
  const line = count == null ? lines.length - 1 : Math.min(Math.max(count - 1, 0), lines.length - 1)
  return { target: { line, col: firstNonBlank(lines[line]) }, kind: 'linewise' }
}

/** 一个 `w` 步：下一个词首。空行视作一个词（vim 语义）。 */
function wordStartFwdOnce(lines: string[], cur: Cursor): Cursor | null {
  const startCls = classOf(lines, cur)
  let p: Cursor = { ...cur }
  if (startCls !== 'space' && startCls !== 'eol') {
    // 跳过当前同类 run
    let q = nextPos(lines, p)
    while (q && classOf(lines, q) === startCls) {
      p = q
      q = nextPos(lines, p)
    }
    if (!q) return null
    p = q
  }
  // 跳过空白与行尾；空行本身是一个词，停在其 col 0
  while (p.line < lines.length) {
    const c = classOf(lines, p)
    if (c === 'space') {
      const q = nextPos(lines, p)
      if (!q) return null
      p = q
      continue
    }
    if (c === 'eol') {
      const nl = p.line + 1
      if (nl >= lines.length) return null
      if (lines[nl].length === 0) return { line: nl, col: 0 }
      p = { line: nl, col: 0 }
      continue
    }
    return p
  }
  return null
}

function wordStartFwd(lines: string[], cur: Cursor, count: number): MotionResult {
  let p: Cursor | null = { ...cur }
  for (let i = 0; i < count; i++) {
    const q = wordStartFwdOnce(lines, p)
    if (!q) {
      // 没有下一个词可跳（最后一行）：vim 的 w 前进到行尾，
      // 让 operator 按「到行尾」结算——落在原地会让 dw/yw 落空
      return { target: { line: p.line, col: lines[p.line].length }, kind: 'exclusive' }
    }
    p = q
  }
  return { target: p, kind: 'exclusive' }
}

function wordStartBwdOnce(lines: string[], cur: Cursor): Cursor | null {
  let p = prevChar(lines, cur)
  while (p) {
    const c = classOf(lines, p)
    if (c === 'space') {
      p = prevChar(lines, p)
      continue
    }
    if (c === 'eol') return p // 空行 = 词
    let q = prevChar(lines, p)
    while (q && classOf(lines, q) === c) {
      p = q
      q = prevChar(lines, p)
    }
    return p
  }
  return null
}

function wordStartBwd(lines: string[], cur: Cursor, count: number): MotionResult {
  let p: Cursor | null = { ...cur }
  for (let i = 0; i < count; i++) {
    const q = wordStartBwdOnce(lines, p)
    if (!q) return { target: clampCursor(lines, p), kind: 'exclusive' }
    p = q
  }
  return { target: p, kind: 'exclusive' }
}

function wordEndFwdOnce(lines: string[], cur: Cursor): Cursor | null {
  let p = nextPos(lines, cur)
  while (p) {
    const c = classOf(lines, p)
    if (c === 'space' || c === 'eol') {
      p = nextPos(lines, p)
      continue
    }
    let q = nextPos(lines, p)
    while (q && classOf(lines, q) === c) {
      p = q
      q = nextPos(lines, p)
    }
    return p
  }
  return null
}

function wordEndFwd(lines: string[], cur: Cursor, count: number): MotionResult {
  let p: Cursor | null = { ...cur }
  for (let i = 0; i < count; i++) {
    const q = wordEndFwdOnce(lines, p)
    if (!q) return { target: clampCursor(lines, p), kind: 'inclusive' }
    p = q
  }
  return { target: p, kind: 'inclusive' }
}

export function wordMotion(kind: 'w' | 'b' | 'e', lines: string[], cur: Cursor, count: number): MotionResult {
  if (kind === 'w') return wordStartFwd(lines, cur, count)
  if (kind === 'b') return wordStartBwd(lines, cur, count)
  return wordEndFwd(lines, cur, count)
}

/** f/F/t/T：仅当前行内查找。返回目标列（不 clamp 到行外的语义，由调用方判定） */
export function findChar(
  line: string,
  from: number,
  ch: string,
  count: number,
  dir: 1 | -1,
  till: boolean,
): number | null {
  let idx = from
  for (let n = 0; n < count; n++) {
    idx = dir === 1 ? line.indexOf(ch, idx + 1) : line.lastIndexOf(ch, idx - 1)
    if (idx < 0) return null
  }
  if (till) idx += -dir
  return idx
}

const OPEN = '([{'
const CLOSE = ')]}'
const closeOf = (ch: string) => CLOSE[OPEN.indexOf(ch)]
const openOf = (ch: string) => OPEN[CLOSE.indexOf(ch)]

/**
 * % 括号配对跳转：光标处（或行内向后第一个）括号 → 跨行栈匹配配对位。
 * 找不到或未闭合返回 null（简化：光标不动，不到行尾——与 find 家族 no-op 口径一致）。
 */
export function matchParen(lines: string[], cur: Cursor): MotionResult | null {
  const line = lines[cur.line]
  let start = -1
  for (let c = cur.col; c < line.length; c++) {
    if (OPEN.includes(line[c]!) || CLOSE.includes(line[c]!)) {
      start = c
      break
    }
  }
  if (start < 0) return null
  const ch = line[start]!
  let depth = 0
  if (OPEN.includes(ch)) {
    for (let l = cur.line; l < lines.length; l++) {
      for (let c = l === cur.line ? start : 0; c < lines[l].length; c++) {
        const t = lines[l][c]!
        if (t === ch) depth++
        else if (t === closeOf(ch)) {
          depth--
          if (depth === 0) return { target: { line: l, col: c }, kind: 'inclusive' }
        }
      }
    }
  } else {
    const open = openOf(ch) // 闭括号的开括号
    for (let l = cur.line; l >= 0; l--) {
      const from = l === cur.line ? start : lines[l].length - 1
      for (let c = from; c >= 0; c--) {
        const t = lines[l][c]!
        if (t === ch) depth++
        else if (t === open) {
          depth--
          if (depth === 0) return { target: { line: l, col: c }, kind: 'inclusive' }
        }
      }
    }
  }
  return null
}

/**
 * 段落跳转（段落 = 空行分隔的连续非空行，与 textobjects 的 ip 同一定义）。
 * }：下一段首行行首；无下一段 → 最后一个非空行的行尾字符。
 * {：光标在段中/空行 → 本段首；在段首 → 上一段首；无上段 → 文件首行行首。
 * 两者均为 exclusive（d} 吞掉本段与中间空行）。
 */
export function paraMotion(dir: 1 | -1, lines: string[], cur: Cursor): MotionResult {
  if (dir === 1) {
    let e = cur.line + 1
    while (e < lines.length && lines[e] !== '') e++
    if (e < lines.length) {
      let t = e
      while (t < lines.length && lines[t] === '') t++
      if (t < lines.length) return { target: { line: t, col: 0 }, kind: 'exclusive' }
    }
    let nf = lines.length - 1
    while (nf > 0 && lines[nf] === '') nf--
    return { target: { line: nf, col: Math.max(0, lines[nf].length - 1) }, kind: 'exclusive' }
  }
  const atSegStart = cur.line === 0 || lines[cur.line - 1] === ''
  if (atSegStart) {
    let t = cur.line - 1
    while (t >= 0 && lines[t] === '') t--
    if (t < 0) return { target: { line: 0, col: 0 }, kind: 'exclusive' }
    while (t > 0 && lines[t - 1] !== '') t--
    return { target: { line: t, col: 0 }, kind: 'exclusive' }
  }
  let s = cur.line
  while (s > 0 && lines[s - 1] !== '') s--
  return { target: { line: s, col: 0 }, kind: 'exclusive' }
}
