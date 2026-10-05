<script setup lang="ts">
import Keycap from './Keycap.vue'
import type { Toast } from '../stores/game'

/**
 * 全局 toast（store.toast 的渲染件）：对局屏贴停靠区上方（placement=dock），
 * 地图屏悬浮视口底部（placement=float）——拒绝直链/热身结束等提示发生在非对局屏。
 */
defineProps<{ toast: Toast; placement?: 'dock' | 'float' }>()
</script>

<template>
  <div class="toast" :class="[toast.tone, placement ?? 'dock']" :key="toast.id" role="status">
    <span>{{ toast.text }}</span>
    <Keycap
      v-if="toast.keycap"
      :label="toast.keycap"
      size="sm"
      :tone="toast.tone === 'err' ? 'err' : 'plain'"
    />
  </div>
</template>

<style scoped>
/* 描边语义色取代饱和实底；两处锚点都保证出现动画有 transform 终态可回落 */
.toast {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  background: var(--surface);
  color: var(--ink);
  border: 2px solid var(--toast-accent, var(--ink-2));
  border-radius: var(--r-input);
  box-shadow: var(--shadow-1);
  padding: var(--sp-1) var(--sp-4);
  font-size: var(--fs-sm);
  white-space: nowrap;
  animation: toast-in var(--dur-base) var(--ease-out);
  z-index: 5;
}

.toast.dock {
  position: absolute;
  left: 50%;
  bottom: calc(100% + var(--sp-3));
  transform: translateX(-50%);
}

.toast.float {
  position: fixed;
  left: 50%;
  bottom: var(--sp-6);
  transform: translateX(-50%);
  z-index: 60;
}

.toast.ok {
  --toast-accent: var(--ok-ink);
}

.toast.err {
  --toast-accent: var(--err-ink);
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translate(-50%, 8px);
  }
}
</style>
