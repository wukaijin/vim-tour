<script setup lang="ts">
import { computed } from 'vue'
import type { Mode } from '../../engine'
import Keycap from './Keycap.vue'

/**
 * 按键回显栏（PLAN §6 / §8.4）：真实键帽排，pending 键帽呈按下态——
 * 产品招牌交互件。左：最近已结算键（渐隐）；右：pending 序列（按下态）。
 * 应答 ≤50ms：每次按键立即键帽下沉，不等判定。
 */
const props = defineProps<{
  pending: string
  mode: Mode
  cmdline: string
  recent: string[]
  message: string | null
}>()

const pendingChars = computed(() => [...props.pending])
const recentTrail = computed(() => props.recent.slice(-5))
</script>

<template>
  <div class="echo">
    <div class="echo-keys">
      <span class="trail" aria-hidden="true">
        <span v-for="(k, i) in recentTrail" :key="`t${i}`" class="trail-item" :style="{ opacity: 0.25 + 0.15 * i }">
          <Keycap :label="k === ' ' ? '␣' : k" size="sm" />
        </span>
      </span>
      <span v-if="recentTrail.length" class="dot" aria-hidden="true">·</span>
      <span class="pending" aria-label="进行中的按键序列">
        <template v-if="mode === 'cmdline'">
          <Keycap label=":" size="md" pressed />
          <Keycap v-for="(ch, i) in [...cmdline]" :key="i" :label="ch" size="sm" />
        </template>
        <template v-else>
          <Keycap v-for="(ch, i) in pendingChars" :key="i" :label="ch === ' ' ? '␣' : ch" size="md" pressed tone="brand" />
          <span v-if="pendingChars.length === 0 && mode !== 'insert'" class="hint-idle">待命…</span>
          <span v-if="mode === 'insert'" class="hint-idle insert">正在插入文字，&lt;Esc&gt; 退出</span>
        </template>
      </span>
    </div>
    <div class="echo-msg" :class="{ err: !!message }" role="status">{{ message ?? '' }}</div>
    <span class="echo-slot"><slot name="counters" /></span>
  </div>
</template>

<style scoped>
.echo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  min-height: 44px;
  background: var(--paper);
  border: 1px solid var(--edge);
  border-radius: var(--r-input);
  padding: var(--sp-2) var(--sp-4);
}

.echo-keys {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.trail {
  display: inline-flex;
  gap: 4px;
}

.trail-item {
  display: inline-flex;
}

.dot {
  color: var(--ink-2);
}

.pending {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

.hint-idle {
  font-size: var(--fs-xs);
  color: var(--ink-2);
}

.hint-idle.insert {
  color: var(--ok-ink);
}

.echo-msg {
  font-size: var(--fs-xs);
  color: var(--ink-2);
  min-width: 0;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.echo-msg.err {
  color: var(--err-ink);
}

/* 计数槽：贴在键帽排右端，与条外框共用一条右边界 */
.echo-slot {
  flex: none;
  display: inline-flex;
  align-items: center;
  padding-left: var(--sp-3);
  border-left: 1px solid var(--edge);
}
</style>
