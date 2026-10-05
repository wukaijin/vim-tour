<script setup lang="ts">
import Keycap from './Keycap.vue'
import { keycapLabel } from '../lib/keys'
import type { ComboChunk } from '../../game/combo'

/**
 * par 连招键帽连排（PLAN §2.4D，仅 3 星结算屏渲染）：
 * 连续同键合并为 count 形态 [3×][w]；insert/cmdline 输入聚合为宽键帽；
 * 组块间 6px 间隙 + 小号「·」分隔，刻意不加连线箭头（组块不是流程图）。
 */
defineProps<{ chunks: ComboChunk[] }>()

/** 输入文本是纯内容：只把空格显形，不做命名键剥壳 */
const textLabel = (text: string): string => text.replace(/ /g, '␣')
</script>

<template>
  <div class="combo" aria-label="你的连招">
    <template v-for="(c, i) in chunks" :key="i">
      <span v-if="i > 0" class="dot" aria-hidden="true">·</span>
      <span v-if="c.kind === 'tap' && c.count > 1" class="run">
        <Keycap :label="`${c.count}×`" size="xs" />
        <Keycap :label="keycapLabel(c.key)" size="sm" />
      </span>
      <Keycap v-else-if="c.kind === 'tap'" :label="keycapLabel(c.key)" size="sm" />
      <Keycap v-else :label="textLabel(c.text)" size="sm" tone="ink" :span="c.text.length" />
    </template>
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

.dot {
  font-size: var(--fs-xs);
  color: var(--ink-2);
}

/* count 键帽与其命令键帽是一个组块：内部贴合，不吞组块间 6px */
.run {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
</style>
