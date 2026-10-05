import { VimEngine, parseKeys } from '../engine'
import type { Key } from '../engine'
import type { LevelText } from './types'

/**
 * par 连招的展示模型（PLAN §2.4D，仅 3 星结算屏渲染）。
 * 「组块」切分：用引擎干跑 parKeys，press 前处于 insert/cmdline 态的可打印
 * 字符聚合为一个输入文本块（打字是内容不是连招，拆碎会吃掉组块的节奏感），
 * 其余按命令键处理，连续同键合并为 count 形态（jjj → 3×j）。
 * 干跑保证与引擎状态机语义一致，且无需在展示层复刻 pending 解析。
 */
export type ComboChunk =
  | { kind: 'tap'; key: Key; count: number }
  | { kind: 'type'; text: string }

export function comboOf(variant: LevelText): ComboChunk[] {
  const eng = new VimEngine({ lines: variant.start, cursor: variant.cursor })
  const chunks: ComboChunk[] = []
  let textBuf: string[] | null = null

  const flushText = (): void => {
    if (textBuf && textBuf.length > 0) chunks.push({ kind: 'type', text: textBuf.join('') })
    textBuf = null
  }
  const tap = (key: Key): void => {
    flushText()
    const last = chunks[chunks.length - 1]
    if (last && last.kind === 'tap' && last.key === key) last.count += 1
    else chunks.push({ kind: 'tap', key, count: 1 })
  }

  for (const key of parseKeys(variant.parKeys)) {
    const m = eng.mode
    if ((m === 'insert' || m === 'cmdline') && key.length === 1) {
      textBuf = [...(textBuf ?? []), key]
    } else {
      tap(key)
    }
    eng.press(key)
  }
  flushText()
  return chunks
}
