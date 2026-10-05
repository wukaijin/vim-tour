<script setup lang="ts">
import { computed } from 'vue'
import type { Cursor, Mode } from '../../engine'

/**
 * 纸面编辑器（PLAN §8.4）：亮底、1px edge 描边、硬阴影、弱化行号槽。
 * 光标是全屏最亮元素：normal=实心块、insert=竖线；闪烁尊重 reduced-motion。
 * visual 模式下选区以 brand 浅底高亮（char=行内段 / line=整行 / block=列段，短行截断）。
 * 块插入 pending 期间以 phantoms 虚显：其余行在块缘处实时叠加已键文本
 * （真实 vim 同观感，Esc 后由引擎套用转正）。
 */
interface VisualSelection {
  start: Cursor
  end: Cursor
  kind: 'char' | 'line' | 'block'
}

/** 虚显段：该行 col 处叠加显示 text（引擎 blockInsertPending 的输出） */
interface Phantom {
  line: number
  col: number
  text: string
}

interface Seg {
  text: string
  sel: boolean
  phantom?: boolean
}

const props = withDefaults(
  defineProps<{
    lines: string[]
    cursor: Cursor
    mode: Mode
    grid?: boolean
    selection?: VisualSelection | null
    phantoms?: Phantom[]
  }>(),
  { grid: true, selection: null, phantoms: () => [] },
)

/** 本行选区列区间 [a, b)；行不在选区内或区间为空 → null */
function selSpan(line: number, text: string): [number, number] | null {
  const s = props.selection
  if (!s || line < s.start.line || line > s.end.line) return null
  if (s.kind === 'line') return text.length > 0 ? [0, text.length] : null
  if (s.kind === 'block') {
    const b = Math.min(s.end.col + 1, text.length)
    return s.start.col < b ? [s.start.col, b] : null
  }
  const a = line === s.start.line ? s.start.col : 0
  const b = line === s.end.line ? Math.min(s.end.col + 1, text.length) : text.length
  return a < b ? [a, b] : null
}

/** 把文本按标记区间拆成段（无标记时整行一段） */
function segments(text: string, line: number, ph: [number, number] | null): Seg[] {
  // sel 与 phantom 互斥：虚显仅存在于块插入 pending，彼时已无选区
  const span = selSpan(line, text) ?? ph
  if (!span) return [{ text, sel: false }]
  const [a, b] = span
  const segs: Seg[] = []
  if (a > 0) segs.push({ text: text.slice(0, a), sel: false })
  segs.push({ text: text.slice(a, b), sel: false, phantom: ph !== null })
  if (b < text.length) segs.push({ text: text.slice(b), sel: false })
  return segs
}

const rows = computed(() =>
  props.lines.map((text, line) => {
    const ph = props.phantoms.find(p => p.line === line)
    const display = ph ? text.slice(0, ph.col) + ph.text + text.slice(ph.col) : text
    const phSpan: [number, number] | null = ph ? [ph.col, ph.col + ph.text.length] : null
    const isCursorLine = line === props.cursor.line
    const col = isCursorLine ? props.cursor.col : -1
    const full = segments(display, line, phSpan)
    let before = full
    let after: Seg[] = []
    if (isCursorLine) {
      // 在光标列处劈开：[0, col) → before，光标格 = text[col]，(col, len] → after
      before = []
      after = []
      let at = 0
      for (const seg of full) {
        const end = at + seg.text.length
        if (end <= col) before.push(seg)
        else if (at >= col + 1) after.push(seg)
        else {
          const left = col - at
          const right = end - (col + 1)
          if (left > 0) before.push({ text: seg.text.slice(0, left), sel: seg.sel })
          if (right > 0) after.push({ text: seg.text.slice(seg.text.length - right), sel: seg.sel })
        }
        at = end
      }
    }
    return {
      before,
      at: isCursorLine ? (display[col] ?? ' ') : null,
      after,
      isCursorLine,
    }
  }),
)

const modeLabel: Record<Mode, string> = {
  normal: '普通',
  insert: '插入',
  'visual-char': '可视·字符',
  'visual-line': '可视·行',
  'visual-block': '可视·块',
  cmdline: '命令行',
}
</script>

<template>
  <div class="editor" :class="{ nogrid: !grid }" aria-label="编辑缓冲区">
    <div class="editor-head">
      <span class="mode-chip" :data-mode="mode">{{ modeLabel[mode] }}</span>
    </div>
    <div class="buffer mono">
      <div v-for="(row, i) in rows" :key="i" class="line" :class="{ active: row.isCursorLine }">
        <span class="gutter">{{ i + 1 }}</span>
        <span class="text"
          ><span v-for="(s, k) in row.before" :key="'b' + k" class="seg" :class="{ sel: s.sel, phantom: s.phantom }">{{ s.text }}</span
          ><span
            v-if="row.at !== null"
            class="cursor"
            :class="mode === 'insert' ? 'bar' : 'block'"
            :data-ch="row.at"
          ></span
          ><span v-for="(s, k) in row.after" :key="'a' + k" class="seg" :class="{ sel: s.sel, phantom: s.phantom }">{{ s.text }}</span></span
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor {
  background: var(--surface);
  border: 1px solid var(--edge);
  border-radius: var(--r-card);
  box-shadow: var(--shadow-2);
  overflow: hidden;
}

.editor-head {
  display: flex;
  justify-content: flex-end;
  padding: var(--sp-2) var(--sp-3) 0;
}

.mode-chip {
  font-size: var(--fs-xs);
  color: var(--ink-2);
  border: 1px solid var(--edge);
  border-radius: var(--r-keycap);
  padding: 1px 8px;
  background: var(--paper);
}

.mode-chip[data-mode='insert'] {
  color: var(--ok-ink);
  border-color: var(--ok);
}

.mode-chip[data-mode='cmdline'] {
  color: var(--warn-ink);
  border-color: var(--warn);
}

.mode-chip[data-mode^='visual'] {
  color: var(--brand-ink);
  border-color: var(--brand);
}

.buffer {
  padding: var(--sp-3) var(--sp-4) var(--sp-4);
  font-size: var(--fs-lg);
  line-height: 1.7;
  overflow-x: auto;
}

.line {
  display: flex;
  white-space: pre;
}

.line.active .gutter {
  color: var(--brand-ink);
}

.gutter {
  flex: none;
  width: 2.5ch;
  margin-right: 2ch;
  text-align: right;
  color: var(--edge);
  user-select: none;
}

/* 栅格列刻度（grid:false 关卡退场，PLAN §9.2） */
.text {
  position: relative;
  background-image: repeating-linear-gradient(
    to right,
    transparent 0,
    transparent calc(1ch - 1px),
    rgba(43, 42, 38, 0.035) calc(1ch - 1px),
    rgba(43, 42, 38, 0.035) 1ch
  );
}

.nogrid .text {
  background-image: none;
}

/* visual 选区高亮：真实 vim 为反白；键帽母题下用 brand 浅底，
   但要压得住纸面白——24% 混色在 #FFFDF8 上几乎读不出边界。
   块插入虚显同观感（vim 中虚显文本也是反白） */
.seg.sel,
.seg.phantom {
  background: color-mix(in srgb, var(--brand) 45%, var(--surface));
  border-radius: 3px;
}

/* —— 光标：全屏最亮元素 —— */
.cursor {
  display: inline-block;
  vertical-align: text-bottom;
}

.cursor.block {
  width: 1ch;
  height: 1.45em;
  background: var(--brand-ink);
  /* 1px 纸色内环：选区加深后光标仍要能与选区切开（光标始终是全屏最亮元素） */
  box-shadow: inset 0 0 0 1px var(--surface);
  position: relative;
  animation: cursor-blink 1.06s steps(1) infinite;
}

.cursor.block::after {
  content: attr(data-ch);
  position: absolute;
  inset: 0;
  color: var(--surface);
  text-align: center;
}

/* 竖线占满字符位：字符以正常墨色经 ::after 渲染，线由 ::before 叠在左缘 */
.cursor.bar {
  position: relative;
  width: 1ch;
  height: 1.45em;
}

.cursor.bar::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--brand-ink);
  animation: cursor-blink 1.06s steps(1) infinite;
}

.cursor.bar::after {
  content: attr(data-ch);
  position: absolute;
  inset: 0;
  color: inherit;
}

@keyframes cursor-blink {
  50% {
    opacity: 0.25;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cursor.block,
  .cursor.bar::before {
    animation: none;
  }
}
</style>
