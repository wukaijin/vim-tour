import type { RegisterContent } from './types'

/**
 * 寄存器集：unnamed(") / yank("0) / named("a-"z)。
 * vim 语义：unnamed 始终镜像最近一次写入；"0 仅在无具名寄存器的 yank 时更新。
 * uppercase 追加不在教学子集，不支持。
 */
export class Registers {
  private map = new Map<string, RegisterContent>()

  get(name: string | null): RegisterContent | null {
    const key = name == null || name === '"' ? '"' : name
    return this.map.get(key) ?? null
  }

  yank(name: string | null, content: RegisterContent): void {
    this.map.set('"', content)
    if (name != null && name !== '"') this.map.set(name, content)
    else this.map.set('0', content)
  }

  delete(name: string | null, content: RegisterContent): void {
    this.map.set('"', content)
    if (name != null && name !== '"') this.map.set(name, content)
  }

  /** 深拷贝（求解器搜索用，无共享引用） */
  clone(): Registers {
    const r = new Registers()
    for (const [k, v] of this.map) {
      r.map.set(k, { text: [...v.text], linewise: v.linewise, blockwise: v.blockwise })
    }
    return r
  }

  /** 行为态序列化（键排序保证稳定） */
  stateKey(): string {
    const parts: string[] = []
    for (const k of [...this.map.keys()].sort()) {
      const v = this.map.get(k)!
      parts.push(`${k}\u0001${v.linewise ? 1 : 0}${v.blockwise ? 1 : 0}\u0001${v.text.join('\u0001')}`)
    }
    return parts.join('\u0002')
  }
}
