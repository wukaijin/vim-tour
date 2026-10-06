import { parseKeys, type Key } from './types'

export type FeedVerdict = 'match' | 'prefix' | 'reject'

/** 这些键之后 vim 会等待一个任意字符（find / r 家族）；白名单放行该字符本身 */
const AWAIT_CHAR_KEYS = new Set<Key>(['f', 'F', 't', 'T', 'r'])

/** count 通配边：序列里的 [1-9][0-9]* 数字段折叠成一条边，任意计数都能走（'2gg' 解锁 7gg、'd2w' 解锁 d4w） */
const COUNT = '$count'
const COUNT_START = /^[1-9]$/
const COUNT_DIGIT = /^[0-9]$/

/** 键流 → trie 边流：极大数字段折叠为 COUNT。'0' 是行首 motion 不是计数，保留字面 */
function foldCounts(keys: readonly Key[]): string[] {
  const out: string[] = []
  let i = 0
  while (i < keys.length) {
    if (COUNT_START.test(keys[i]!)) {
      while (i < keys.length && COUNT_DIGIT.test(keys[i]!)) i++
      out.push(COUNT)
    } else {
      out.push(keys[i]!)
      i++
    }
  }
  return out
}

/**
 * 按键序列白名单过滤器。
 * 输入是一组「命令序列」（如 'h'、'dd'、'gg'、'dw'），内部建 trie；
 * feed 逐键判定：仍在某序列前缀上 → prefix，完整命中 → match，否则 reject。
 * Esc / 未映射键会重置缓冲。
 *
 * 序列中的数字段是通配而非字面（与 commands.ts 各 pattern 的计数口径对齐）：
 * 白名单列入 '2dd' 后 3dd/10dd 同样放行——count 是 ch3 教的机制，
 * 数字的值不该被样本枚举锁死。命令本身（dw 之于 d2w）仍按教学粒度拦。
 *
 * find 家族特殊处理：'f' 等键即使作为完整序列命中也保持 prefix（挂起），
 * 随后任意单个可打印字符完成该命令——教学子集里 f{char} 的 char 是纯文本，
 * 不该被「还没教到」拦截。
 */
export class KeyFilter {
  private root: Record<string, unknown> = {}
  private buf: Key[] = []

  constructor(sequences: string[]) {
    for (const seq of sequences) {
      let node = this.root
      for (const k of foldCounts(parseKeys(seq))) {
        node[k] = (node[k] ?? {}) as Record<string, unknown>
        node = node[k] as Record<string, unknown>
      }
      node['$end'] = true
    }
  }

  reset(): void {
    this.buf = []
  }

  /** 复制过滤器状态（求解器搜索用；trie 结构共享，仅复制缓冲） */
  clone(): KeyFilter {
    const f = new KeyFilter([])
    f.root = this.root
    f.buf = [...this.buf]
    return f
  }

  /** 当前挂起缓冲（只读快照）：求解器据此判断 f/F/t/T 是否在等参数字符 */
  pending(): readonly Key[] {
    return this.buf
  }

  feed(key: Key): FeedVerdict {
    if (key === '<Esc>') {
      this.reset()
      return 'match'
    }
    const next = [...this.buf, key]
    let node: Record<string, unknown> | undefined = this.root
    let inCount = false
    for (const k of next) {
      if (node[k] !== undefined) {
        // 字面分支优先（'d0' 的 0 motion 不被 count 吸收）
        node = node[k] as Record<string, unknown>
        inCount = false
      } else if (COUNT_DIGIT.test(k) && (inCount || (COUNT_START.test(k) && node[COUNT] !== undefined))) {
        // count 数字段：[1-9] 开启，段中 0-9 自环停留
        if (!inCount) {
          node = node[COUNT] as Record<string, unknown>
          inCount = true
        }
      } else {
        node = undefined
        break
      }
    }
    if (!node) {
      // 挂起的 f/F/t/T 等待任意单字符
      if (key.length === 1 && this.buf.length > 0 && AWAIT_CHAR_KEYS.has(this.buf[this.buf.length - 1]!)) {
        this.reset()
        return 'match'
      }
      this.reset()
      return 'reject'
    }
    this.buf = next
    if (node['$end']) {
      // find 键命中后不立即结算：下一键（任意字符）才是命令的一部分
      if (AWAIT_CHAR_KEYS.has(key)) return 'prefix'
      this.reset()
      return 'match'
    }
    return 'prefix'
  }
}
