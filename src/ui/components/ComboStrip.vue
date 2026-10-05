<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Keycap from './Keycap.vue'
import { keycapLabel } from '../lib/keys'
import type { ComboChunk } from '../../game/combo'

/**
 * par 连招键帽连排（PLAN §2.4D，仅 3 星结算屏渲染）：
 * 连续同键合并为 count 形态 [3×][w]；insert/cmdline 输入聚合为宽键帽；
 * 组块间 6px 间隙 + 小号「·」分隔，刻意不加连线箭头（组块不是流程图）。
 */
const props = defineProps<{ chunks: ComboChunk[] }>()

/** 输入文本是纯内容：只把空格显形，不做命名键剥壳 */
const textLabel = (text: string): string => text.replace(/ /g, '␣')

/**
 * 断行行首的「·」要藏掉：nowrap 分组保证 dot 不会与它的 chunk 被拆散，
 * 但组整体换行时 dot 仍会落在下一行行首（读成断句错误）。
 * CSS 没有「因换行落到行首」的选择器，只能量一次行的 y 坐标——组块高度一致，
 * 首组与后续组 y 相同即同行；y 变大即换行，该组的 dot 就是行首。
 */
const stripEl = ref<HTMLElement | null>(null)
/** 落在断行行首的组块索引（首组永远是行首，但它没有前导 dot，无需处理） */
const lineStartIdx = ref<Set<number>>(new Set())

function measure(): void {
  const el = stripEl.value
  if (!el) return
  const groups = Array.from(el.children) as HTMLElement[]
  const starts = new Set<number>()
  let top: number | null = null
  let idx = 0
  for (const g of groups) {
    const y = Math.round(g.offsetTop)
    if (top === null || y > top) {
      starts.add(idx)
      top = y
    }
    idx++
  }
  lineStartIdx.value = starts
}

let ro: ResizeObserver | null = null
onMounted(() => {
  measure()
  // 视口变化会让连招重新折行，断行位置随之改变——只在挂载时量一次会留下脏状态
  if (typeof ResizeObserver !== 'undefined' && stripEl.value) {
    ro = new ResizeObserver(measure)
    ro.observe(stripEl.value)
  }
})
onBeforeUnmount(() => {
  ro?.disconnect()
  ro = null
})
</script>

<template>
  <div ref="stripEl" class="combo" aria-label="你的连招">
    <!-- dot 与 chunk 必须同属一个 nowrap 组：flex-wrap 只在组间断行，
         否则「·」会被甩到下一行行首（毕业考 12 键帽两行排版） -->
    <span v-for="(c, i) in chunks" :key="i" class="grp" :class="{ 'line-start': lineStartIdx.has(i) && i > 0 }">
      <span v-if="i > 0" class="dot" aria-hidden="true">·</span>
      <span v-if="c.kind === 'tap' && c.count > 1" class="run">
        <Keycap :label="`${c.count}×`" size="xs" />
        <Keycap :label="keycapLabel(c.key)" size="sm" />
      </span>
      <Keycap v-else-if="c.kind === 'tap'" :label="keycapLabel(c.key)" size="sm" />
      <Keycap v-else :label="textLabel(c.text)" size="sm" tone="ink" :span="c.text.length" />
    </span>
  </div>
</template>

<style scoped>
.combo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.grp {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.dot {
  font-size: var(--fs-xs);
  color: var(--ink-2);
}

/* 断行行首的组块：前导 dot 读成断句错误，藏掉（首组本就没有 dot，不受影响） */
.grp.line-start .dot {
  display: none;
}

/* count 键帽与其命令键帽是一个组块：内部贴合，不吞组块间 6px */
.run {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
</style>
