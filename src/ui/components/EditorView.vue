<script setup lang="ts">
import { computed } from 'vue'
import type { Cursor, Mode } from '../../engine'

/**
 * 纸面编辑器（PLAN §8.4）：亮底、1px edge 描边、硬阴影、弱化行号槽。
 * 光标是全屏最亮元素：normal=实心块、insert=竖线；闪烁尊重 reduced-motion。
 */
const props = withDefaults(
  defineProps<{
    lines: string[]
    cursor: Cursor
    mode: Mode
    grid?: boolean
  }>(),
  { grid: true },
)

const rows = computed(() =>
  props.lines.map((text, line) => {
    const isCursorLine = line === props.cursor.line
    const col = isCursorLine ? props.cursor.col : -1
    return {
      text,
      before: isCursorLine ? text.slice(0, col) : text,
      at: isCursorLine ? (text[col] ?? ' ') : '',
      after: isCursorLine ? text.slice(col + 1) : '',
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
          >{{ row.before
          }}<span
            v-if="row.isCursorLine"
            class="cursor"
            :class="mode === 'insert' ? 'bar' : 'block'"
            :data-ch="row.at"
          ></span
          >{{ row.after }}</span
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

/* —— 光标：全屏最亮元素 —— */
.cursor {
  display: inline-block;
  vertical-align: text-bottom;
}

.cursor.block {
  width: 1ch;
  height: 1.45em;
  background: var(--brand-ink);
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
