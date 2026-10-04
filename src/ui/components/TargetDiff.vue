<script setup lang="ts">
import type { DiffRow } from '../lib/diff'

/**
 * 目标 diff 对照（PLAN §3 / §8.4）：+ 前缀绿底 / − 前缀红删除线，
 * 前缀符号本身就是第二通道，颜色不单独承载差异（§8.2 硬条款）。
 * 成功时整块「盖章」变绿 + 左侧实色条；失败时 ±4px 抖两次共 160ms。
 */
defineProps<{
  rows: DiffRow[]
  /** 失败反馈：±4px 抖两次共 160ms（禁全屏 shake，§8.5） */
  shake?: boolean
  /** 成功反馈：diff 行盖章式变绿 */
  stamp?: boolean
}>()
</script>

<template>
  <div class="target" :class="{ shake, stamp }" aria-label="目标文本">
    <div class="target-head">目标 · 把左边的缓冲区改成这样</div>
    <div class="rows mono">
      <div
        v-for="(row, i) in rows"
        :key="i"
        class="row"
        :class="row.type"
      >
        <span class="prefix" aria-hidden="true">{{
          row.type === 'add' ? '+' : row.type === 'del' ? '−' : ' '
        }}</span>
        <span class="txt" :class="{ strike: row.type === 'del' }">{{ row.text || ' ' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.target {
  background: var(--surface);
  border: 1px solid var(--edge);
  border-radius: var(--r-card);
  box-shadow: var(--shadow-1);
  overflow: hidden;
}

.target-head {
  font-size: var(--fs-xs);
  color: var(--ink-2);
  padding: var(--sp-2) var(--sp-3);
  border-bottom: 1px dashed var(--edge);
}

.rows {
  padding: var(--sp-3) var(--sp-3) var(--sp-4);
  font-size: var(--fs-base);
  line-height: 1.7;
}

.row {
  display: flex;
  white-space: pre-wrap;
  border-left: 4px solid transparent;
  padding-left: var(--sp-1);
}

.row .prefix {
  flex: none;
  width: 2ch;
  font-weight: 600;
  user-select: none;
}

.row.add {
  background: color-mix(in srgb, var(--ok-fill) 65%, var(--surface));
  border-left-color: var(--ok);
}

.row.add .prefix {
  color: var(--ok-ink);
}

.row.del {
  background: color-mix(in srgb, var(--err-fill) 65%, var(--surface));
  border-left-color: var(--err);
}

.row.del .prefix {
  color: var(--err-ink);
}

.strike {
  text-decoration: line-through;
  color: var(--ink-2);
}

.row.add .txt {
  color: var(--ok-ink);
}

/* 盖章式变绿（§8.5） */
.stamp .row {
  background: color-mix(in srgb, var(--ok-fill) 80%, var(--surface));
  border-left-color: var(--ok);
  transition: background var(--dur-base) var(--ease-out);
}

/* 失败抖动：仅 diff 面板，禁全屏 shake（§8.5） */
.shake {
  animation: panel-shake 160ms var(--ease-out);
}

@keyframes panel-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-4px);
  }
  75% {
    transform: translateX(4px);
  }
}
</style>
