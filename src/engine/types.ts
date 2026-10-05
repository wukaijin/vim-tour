/** 按键统一用 token 字符串：可打印字符即单字符，特殊键用 <Esc> 等尖括号形式 */
export type Key = string

export interface Cursor {
  line: number
  col: number
}

export type Mode =
  | 'normal'
  | 'insert'
  | 'visual-char'
  | 'visual-line'
  | 'visual-block'
  | 'cmdline'

export type OperatorKind = 'd' | 'c' | 'y' | '>' | '<'

export interface Cmdline {
  kind: 'ex' | 'search-fwd' | 'search-bwd'
  text: string
}

export interface RegisterContent {
  text: string[]
  linewise: boolean
  blockwise: boolean
}

export interface Snapshot {
  lines: string[]
  cursor: Cursor
}

export interface PressResult {
  /** 该键是否被当前状态接受（未映射键返回 false，供游戏层反馈） */
  handled: boolean
  /** 本次按键是否改变了缓冲区（用于变更记录） */
  changed?: boolean
  /** 引擎产生的消息（如 "Pattern not found"），供 UI 显示 */
  message?: string
}

export const isDigit = (k: Key) => k >= '1' && k <= '9'
export const isDigit0 = (k: Key) => k >= '0' && k <= '9'

/** 已知命名键；其余 `<`（如搜索 pattern 里的 `\<`）按普通字符处理 */
const NAMED_KEY = /^<(?:Esc|CR|BS|C-[a-z])>$/

/** 把 "2d3w<Esc>" 这类序列切成 Key[] */
export function parseKeys(seq: string): Key[] {
  const out: Key[] = []
  let i = 0
  while (i < seq.length) {
    if (seq[i] === '<') {
      const close = seq.indexOf('>', i)
      if (close !== -1 && NAMED_KEY.test(seq.slice(i, close + 1))) {
        out.push(seq.slice(i, close + 1))
        i = close + 1
        continue
      }
    }
    out.push(seq[i])
    i++
  }
  return out
}
