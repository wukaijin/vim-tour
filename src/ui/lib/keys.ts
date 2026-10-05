import type { Key } from '../../engine'

/** 与 KeyboardEvent 结构兼容的最小接口（node 环境可测） */
export interface KeyEventLike {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  isComposing: boolean
}

/**
 * 键盘事件 → 引擎 Key token。
 * 可打印单字符直通；命名键映射为尖括号形式；方向键刻意忽略（vim 用 hjkl）；
 * IME 组合期间不产生按键。
 * Ctrl 组合只放行 <C-r>（重做）与 <C-v>（块可视化，ch5 起）——其余组合键忽略。
 */
export function eventToKey(e: KeyEventLike): Key | null {
  if (e.isComposing) return null
  if (e.ctrlKey || e.metaKey || e.altKey) {
    if (e.key === 'r' && (e.ctrlKey || e.metaKey)) return '<C-r>'
    if (e.key === 'v' && e.ctrlKey && !e.metaKey && !e.altKey) return '<C-v>'
    return null
  }
  switch (e.key) {
    case 'Enter':
      return '<CR>'
    case 'Backspace':
      return '<BS>'
    case 'Tab':
      return '<Tab>'
    case 'Escape':
      return '<Esc>'
  }
  if (e.key.length === 1) return e.key
  return null
}

/** 该事件是否应被对局屏吃掉（阻止浏览器默认行为，如 / 快速查找、Tab 焦点移动） */
export function isGameplayKey(e: KeyEventLike): boolean {
  return eventToKey(e) !== null
}

/**
 * 键的键帽显示名：命名键剥尖括号（<Esc> → Esc），空格以 ␣ 显形（与 KeyEchoBar 同口径）。
 * 单字符键原样返回——`<` `>` 是缩进命令键，不是尖括号包裹（曾因裸 replace 渲染成空键帽）。
 */
export function keycapLabel(k: Key): string {
  if (k.length === 1) return k === ' ' ? '␣' : k
  return k.replace(/^<|>$/g, '')
}

/** 焦点在交互元素上时，按钮激活键要放行给浏览器，避免杀死键盘可达性 */
const ACTIVATION_KEYS = new Set(['Enter', ' ', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

export function shouldBypassCapture(e: KeyEventLike, target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  const interactive =
    !!el &&
    (el.tagName === 'BUTTON' ||
      el.tagName === 'A' ||
      el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT' ||
      el.isContentEditable)
  return interactive && ACTIVATION_KEYS.has(e.key)
}
