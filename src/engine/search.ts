import type { Cursor } from './types'

export interface SearchHit {
  line: number
  /** 匹配起始列 */
  col: number
}

export function findNext(
  lines: string[],
  from: Cursor,
  pattern: RegExp,
  forward: boolean,
  wrap = true,
): SearchHit | null {
  if (lines.length === 0) return null
  const total = lines.length
  if (forward) {
    // 当前行：从 from.col + 1 起找
    const first = lines[from.line].slice(from.col + 1).match(pattern)
    if (first) return { line: from.line, col: from.col + 1 + first.index! }
    for (let i = 1; i <= total; i++) {
      const l = (from.line + i) % total
      if (l === from.line && !wrap) break
      const m = lines[l].match(pattern)
      if (m) return { line: l, col: m.index! }
    }
    return null
  }
  // 反向
  const before = lines[from.line].slice(0, from.col)
  let last: RegExpMatchArray | null = null
  for (const m of before.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'))) {
    last = m
  }
  if (last) return { line: from.line, col: last.index! }
  for (let i = 1; i <= total; i++) {
    const l = (from.line - i + total) % total
    if (l === from.line && !wrap) break
    let hit: RegExpMatchArray | null = null
    for (const m of lines[l].matchAll(new RegExp(pattern.source, 'g'))) hit = m
    if (hit) return { line: l, col: hit.index! }
  }
  return null
}

/** 从光标所在词构造整词搜索 pattern（用于 * 与 #） */
export function wordUnderCursorPattern(lines: string[], cur: Cursor): { pattern: string; word: string } | null {
  const line = lines[cur.line] ?? ''
  if (cur.col >= line.length) return null
  const isWord = (ch: string) => /[A-Za-z0-9_]/.test(ch)
  if (!isWord(line[cur.col])) return null
  let s = cur.col
  let e = cur.col
  while (s > 0 && isWord(line[s - 1])) s--
  while (e < line.length - 1 && isWord(line[e + 1])) e++
  const word = line.slice(s, e + 1)
  return { pattern: `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, word }
}

/** 最小 vim-magic 兼容：\( \) 分组、\< \> 词边界。其余按 JS regex 处理（教学子集够用） */
export function vimPatternToJs(pat: string): string {
  return pat.replace(/\\\(|\\\)|\\<|\\>/g, (m) => (m === '\\<' || m === '\\>' ? '\\b' : m[1]))
}

export const compilePattern = (pat: string): RegExp | null => {
  try {
    return new RegExp(vimPatternToJs(pat))
  } catch {
    return null
  }
}
