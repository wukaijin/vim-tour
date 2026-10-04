import type { Cursor } from './types'
import { classOf, nextPos, prevChar } from './motions'

export interface TObjectResult {
  /** 字符级闭区间；linewise 时表示行的闭区间 */
  start: Cursor
  end: Cursor
  linewise?: boolean
}

const pairs: Record<string, { open: string; close: string }> = {
  '(': { open: '(', close: ')' },
  ')': { open: '(', close: ')' },
  '[': { open: '[', close: ']' },
  ']': { open: '[', close: ']' },
  '{': { open: '{', close: '}' },
  '}': { open: '{', close: '}' },
  'b': { open: '(', close: ')' },
  'B': { open: '{', close: '}' },
}

/** iw / aw */
function wordObject(lines: string[], cur: Cursor, outer: boolean): TObjectResult | null {
  const cls = classOf(lines, cur)
  if (cls === 'eol') return null
  let s = { ...cur }
  let e = { ...cur }
  while (s.col > 0 && classOf(lines, { line: s.line, col: s.col - 1 }) === cls) s.col--
  while (classOf(lines, { line: e.line, col: e.col + 1 }) === cls) e.col++
  if (!outer || cls === 'space') return { start: s, end: e }
  // aw：优先吃尾部空白，否则吃头部空白
  const e2 = { ...e }
  while (classOf(lines, { line: e2.line, col: e2.col + 1 }) === 'space') e2.col++
  if (e2.col > e.col) return { start: s, end: e2 }
  const s2 = { ...s }
  while (s2.col > 0 && classOf(lines, { line: s2.line, col: s2.col - 1 }) === 'space') s2.col--
  return { start: s2, end: e }
}

function findEnclosingPair(
  lines: string[],
  cur: Cursor,
  open: string,
  close: string,
): { openPos: Cursor; closePos: Cursor } | null {
  const onChar = (p: Cursor) => (p.col < lines[p.line].length ? lines[p.line][p.col] : '')
  // 光标在开括号上：直接向后找配对
  if (onChar(cur) === open) {
    let depth = 0
    let p: Cursor | null = cur
    while (p) {
      const ch = onChar(p)
      if (ch === open) depth++
      else if (ch === close && --depth === 0) return { openPos: cur, closePos: p }
      p = nextPos(lines, p)
    }
    return null
  }
  // 光标在闭括号上：直接向前找配对
  if (onChar(cur) === close) {
    let depth = 0
    let p: Cursor | null = cur
    while (p) {
      const ch = onChar(p)
      if (ch === close) depth++
      else if (ch === open && --depth === 0) return { openPos: p, closePos: cur }
      p = prevChar(lines, p)
    }
    return null
  }
  // 一般情形：向前找最近的未配对 open，再向后找其 close
  let depth = 0
  let p: Cursor | null = prevChar(lines, cur)
  let openPos: Cursor | null = null
  while (p) {
    const ch = onChar(p)
    if (ch === close) depth++
    else if (ch === open) {
      if (depth === 0) {
        openPos = p
        break
      }
      depth--
    }
    p = prevChar(lines, p)
  }
  if (!openPos) return null
  depth = 0
  let q: Cursor | null = openPos
  while (q) {
    const ch = onChar(q)
    if (ch === open) depth++
    else if (ch === close && --depth === 0) return { openPos, closePos: q }
    q = nextPos(lines, q)
  }
  return null
}

/** i( a( i[ a[ i{ a{（含闭括号形式与 b/B 别名） */
function bracketObject(lines: string[], cur: Cursor, open: string, close: string, outer: boolean): TObjectResult | null {
  const pair = findEnclosingPair(lines, cur, open, close)
  if (!pair) return null
  if (outer) return { start: pair.openPos, end: pair.closePos }
  const start = nextPos(lines, pair.openPos)
  const beforeClose = prevChar(lines, pair.closePos)
  if (!start || !beforeClose) return null
  let end = cursorLess(start, beforeClose) ? beforeClose : { ...start }
  // 剔除紧邻闭括号的纯空白尾巴（vim 的 i( 语义）
  while (cursorLess(start, end)) {
    const c = classOf(lines, end)
    if (c === 'space' || c === 'eol') {
      const pv = prevChar(lines, end)
      if (pv && cursorLessEq(start, pv)) end = pv
      else break
    } else break
  }
  return { start, end }
}

function cursorLess(a: Cursor, b: Cursor): boolean {
  return a.line < b.line || (a.line === b.line && a.col < b.col)
}

function cursorLessEq(a: Cursor, b: Cursor): boolean {
  return a.line < b.line || (a.line === b.line && a.col <= b.col)
}

/** i" a" ' ` —— 当前行内找包裹引号对 */
function quoteObject(lines: string[], cur: Cursor, quote: string, outer: boolean): TObjectResult | null {
  const line = lines[cur.line]
  let openIdx = -1
  let closeIdx = -1
  if (line[cur.col] === quote) {
    // 判断是开还是闭：数前面的引号个数
    let before = 0
    for (let i = 0; i < cur.col; i++) if (line[i] === quote) before++
    if (before % 2 === 0) {
      openIdx = cur.col
      closeIdx = line.indexOf(quote, cur.col + 1)
    } else {
      closeIdx = cur.col
      openIdx = line.lastIndexOf(quote, cur.col - 1)
    }
  } else {
    // 光标在两个引号之间：向前找未闭合的开引号
    let depth = 0
    openIdx = -1
    for (let i = cur.col - 1; i >= 0; i--) {
      if (line[i] === quote) {
        if (depth === 0) {
          openIdx = i
          break
        }
        depth--
      }
    }
    if (openIdx >= 0) closeIdx = line.indexOf(quote, openIdx + 1)
  }
  if (openIdx < 0 || closeIdx < 0) return null
  if (outer) return { start: { line: cur.line, col: openIdx }, end: { line: cur.line, col: closeIdx } }
  if (closeIdx === openIdx + 1) return null
  return { start: { line: cur.line, col: openIdx + 1 }, end: { line: cur.line, col: closeIdx - 1 } }
}

/** it：最内层包裹光标的同名标签对 */
function tagObject(lines: string[], cur: Cursor, outer: boolean): TObjectResult | null {
  interface Ev { pos: Cursor; name: string; open: boolean; matchEnd: number }
  const evs: Ev[] = []
  const tagRe = /<(\/?)([A-Za-z][\w-]*)(?:\s[^>]*)?>/g
  for (let l = 0; l < lines.length; l++) {
    for (const m of lines[l].matchAll(tagRe)) {
      if (m[0].endsWith('/>')) continue
      evs.push({
        pos: { line: l, col: m.index! },
        name: m[2],
        open: m[1] !== '/',
        matchEnd: m.index! + m[0].length,
      })
    }
  }
  // 配对栈：每当闭合一个标签，得到一个区间 [openStart, closeEnd]，闭区间含标签本体
  const stack: Ev[] = []
  const ranges: { openEv: Ev; closeEv: Ev }[] = []
  for (const ev of evs) {
    if (ev.open) stack.push(ev)
    else {
      let i = stack.length - 1
      while (i >= 0 && stack[i].name !== ev.name) i--
      if (i < 0) continue
      ranges.push({ openEv: stack[i], closeEv: ev })
      stack.length = i
    }
  }
  // 取包含光标的最内层区间（区间最小者）
  let best: { openEv: Ev; closeEv: Ev } | null = null
  for (const r of ranges) {
    const o = r.openEv.pos
    const cEnd = { line: r.closeEv.pos.line, col: r.closeEv.matchEnd - 1 }
    const contains = cursorLessEq(o, cur) && cursorLessEq(cur, cEnd)
    if (!contains) continue
    if (!best) {
      best = r
      continue
    }
    const bo = best.openEv.pos
    const bcEnd = { line: best.closeEv.pos.line, col: best.closeEv.matchEnd - 1 }
    if (cursorLessEq(bo, o) && cursorLessEq(cEnd, bcEnd)) best = r
  }
  if (!best) return null
  if (outer) {
    return { start: best.openEv.pos, end: { line: best.closeEv.pos.line, col: best.closeEv.matchEnd - 1 } }
  }
  // inner：开标签 '>' 之后 到 闭标签 '<' 之前
  const start = { line: best.openEv.pos.line, col: best.openEv.matchEnd }
  const end = prevChar(lines, best.closeEv.pos)
  if (!end || cursorLess(end, start)) return null
  return { start, end }
}

/** ip / ap：段落为连续非空行 */
function paragraphObject(lines: string[], cur: Cursor, outer: boolean): TObjectResult | null {
  const blank = (l: number) => lines[l].trim().length === 0
  let s = cur.line
  let e = cur.line
  while (s > 0 && !blank(s - 1)) s--
  while (e < lines.length - 1 && !blank(e + 1)) e++
  if (outer) {
    if (e < lines.length - 1 && blank(e + 1)) e++
    else if (s > 0 && blank(s - 1)) s--
  }
  return { start: { line: s, col: 0 }, end: { line: e, col: 0 }, linewise: true }
}

/**
 * 解析文本对象。inner=true 为 i 前缀。
 * 支持：w、( ) b、[ ]、{ } B、" ' `、t、p
 */
export function textObject(inner: boolean, obj: string, lines: string[], cur: Cursor): TObjectResult | null {
  if (obj === 'w') return wordObject(lines, cur, !inner)
  if (pairs[obj]) {
    const { open, close } = pairs[obj]
    return bracketObject(lines, cur, open, close, !inner)
  }
  if (obj === '"' || obj === "'" || obj === '`') return quoteObject(lines, cur, obj, !inner)
  if (obj === 't') return tagObject(lines, cur, !inner)
  if (obj === 'p') return paragraphObject(lines, cur, !inner)
  return null
}
