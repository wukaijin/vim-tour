import { parseKeys, type Key } from './types'

export type FeedVerdict = 'match' | 'prefix' | 'reject'

/** 这些键之后 vim 会等待一个任意字符（find 家族）；白名单放行该字符本身 */
const AWAIT_CHAR_KEYS = new Set<Key>(['f', 'F', 't', 'T'])

/**
 * 按键序列白名单过滤器。
 * 输入是一组「命令序列」（如 'h'、'dd'、'gg'、'dw'），内部建 trie；
 * feed 逐键判定：仍在某序列前缀上 → prefix，完整命中 → match，否则 reject。
 * Esc / 未映射键会重置缓冲。
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
      for (const k of parseKeys(seq)) {
        node[k] = (node[k] ?? {}) as Record<string, unknown>
        node = node[k] as Record<string, unknown>
      }
      node['$end'] = true
    }
  }

  reset(): void {
    this.buf = []
  }

  feed(key: Key): FeedVerdict {
    if (key === '<Esc>') {
      this.reset()
      return 'match'
    }
    const next = [...this.buf, key]
    let node: Record<string, unknown> | undefined = this.root
    for (const k of next) {
      node = node?.[k] as Record<string, unknown> | undefined
      if (!node) {
        // 挂起的 f/F/t/T 等待任意单字符
        if (key.length === 1 && this.buf.length > 0 && AWAIT_CHAR_KEYS.has(this.buf[this.buf.length - 1]!)) {
          this.reset()
          return 'match'
        }
        this.reset()
        return 'reject'
      }
    }
    this.buf = next
    if (node && node['$end']) {
      // find 键命中后不立即结算：下一键（任意字符）才是命令的一部分
      if (AWAIT_CHAR_KEYS.has(key)) return 'prefix'
      this.reset()
      return 'match'
    }
    return 'prefix'
  }
}
