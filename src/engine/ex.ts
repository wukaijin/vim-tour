/**
 * :s[ubstitute] 简化实现。
 * 支持范围：缺省（当前行）与 %；分隔符 /；flags：g、i。
 * 替换串支持 \0-\9 与 &（整个匹配），\/ 转义字面斜杠。
 */

import { vimPatternToJs } from './search'

export interface SubstituteCmd {
  wholeFile: boolean
  pattern: string
  replacement: string
  global: boolean
  ignoreCase: boolean
}

/** 把 :s 的 vim 风格替换串转成 JS replace 串 */
export function vimReplToJs(repl: string): string {
  let out = ''
  for (let i = 0; i < repl.length; i++) {
    const ch = repl[i]
    if (ch === '\\' && i + 1 < repl.length) {
      const next = repl[i + 1]
      if (next >= '0' && next <= '9') out += '$' + next
      else if (next === '/') out += '/'
      else if (next === '\\') out += '\\'
      else out += '\\' + next
      i++
    } else if (ch === '&') {
      out += '$&'
    } else if (ch === '$') {
      out += '$$'
    } else {
      out += ch
    }
  }
  return out
}

export function parseSubstitute(text: string): SubstituteCmd | null {
  // 去掉范围前缀：仅支持 '%' 或空
  let wholeFile = false
  let rest = text
  if (rest.startsWith('%')) {
    wholeFile = true
    rest = rest.slice(1)
  }
  if (!/^s/.test(rest)) return null
  rest = rest.replace(/^s/, '')
  const sep = rest[0]
  if (sep === undefined) return { wholeFile, pattern: '', replacement: '', global: false, ignoreCase: false }
  // 按未转义分隔符切三段
  const parts: string[] = []
  let cur = ''
  for (let i = 1; i < rest.length; i++) {
    const ch = rest[i]
    if (ch === '\\' && i + 1 < rest.length) {
      cur += ch + rest[i + 1]
      i++
      continue
    }
    if (ch === sep) {
      parts.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  parts.push(cur)
  const [pattern = '', replacement = '', flags = ''] = parts
  return {
    wholeFile,
    pattern,
    replacement,
    global: flags.includes('g'),
    ignoreCase: flags.includes('i'),
  }
}

export interface SubResult {
  /** 完成的替换次数 */
  count: number
  /** 最后一个被替换的行（-1 表示无替换） */
  lastLine: number
}

/** 对单行执行替换，返回新行文本与替换次数 */
export function substituteLine(line: string, cmd: SubstituteCmd): { line: string; n: number } {
  if (cmd.pattern === '') return { line, n: 0 }
  const flags = cmd.ignoreCase ? (cmd.global ? 'gi' : 'i') : cmd.global ? 'g' : ''
  const re = new RegExp(vimPatternToJs(cmd.pattern), flags)
  const jsRepl = vimReplToJs(cmd.replacement)
  return { line: manualReplace(line, re, jsRepl, cmd.global), n: countMatches(line, re, cmd.global) }
}

function countMatches(line: string, re: RegExp, global: boolean): number {
  if (global) {
    const m = line.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))
    return m ? m.length : 0
  }
  return re.test(line) ? 1 : 0
}

function manualReplace(line: string, re: RegExp, jsRepl: string, global: boolean): string {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  let replaced = false
  while ((m = g.exec(line)) !== null) {
    out += line.slice(last, m.index)
    out += expandRepl(jsRepl, m)
    last = m.index + (m[0].length === 0 ? 1 : m[0].length)
    replaced = true
    if (!global) break
    if (m[0].length === 0) g.lastIndex++
  }
  if (!replaced) return line
  out += line.slice(last)
  return out
}

function expandRepl(jsRepl: string, m: RegExpExecArray): string {
  return jsRepl.replace(/\$(\d|&)/g, (_, d: string) => (d === '&' ? m[0] : m[Number(d)] ?? ''))
}
