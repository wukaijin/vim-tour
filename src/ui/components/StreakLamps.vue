<script setup lang="ts">
import Keycap from './Keycap.vue'

/**
 * 关内进度：一排 N 个小键帽指示灯（连续成功 k/N，PLAN §8.4）——
 * 键盘指示灯的物理隐喻，不用进度条。
 */
defineProps<{
  k: number
  n: number
}>()
</script>

<template>
  <span class="lamps" :aria-label="`连续成功 ${k}/${n}`" role="img">
    <Keycap v-for="i in n" :key="i" label="" size="xs" :tone="i <= k ? 'ok' : 'plain'" class="lamp" />
    <span class="count mono">{{ k }}/{{ n }}</span>
  </span>
</template>

<style scoped>
.lamps {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.lamp {
  width: 14px;
}

.count {
  margin-left: var(--sp-1);
  font-size: var(--fs-xs);
  color: var(--ink-2);
}
</style>
