<script setup lang="ts">
/**
 * 自绘 inline SVG 图标（PLAN §10.2：0 图标库，每个 200–500B）。
 * 只做跨平台基线不稳的字形：星、锁、对勾。✓ 虽是平台稳定字形，但回退字体
 * 在 13px 下画的是细线（对局屏工具行的状态槽里近乎不可见），且用文本会随
 * 字体度量改变槽宽、点击后带动整排键位移——故与锁同槽自绘。
 */
withDefaults(defineProps<{ name: 'star' | 'lock' | 'check'; size?: number }>(), { size: 20 })
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    class="glyph"
  >
    <template v-if="name === 'star'">
      <path
        d="M12 2.6l2.76 5.9 6.24.72-4.63 4.3 1.2 6.16L12 16.6l-5.57 3.08 1.2-6.16-4.63-4.3 6.24-.72L12 2.6z"
      />
    </template>
    <template v-else-if="name === 'check'">
      <path
        d="M5 12.8l4.6 4.6L19 6.6"
        fill="none"
        stroke="currentColor"
        stroke-width="3.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </template>
    <template v-else>
      <path
        d="M6 10V8a6 6 0 0 1 12 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1zm2 0h8V8a4 4 0 0 0-8 0v2z"
      />
    </template>
  </svg>
</template>

<style scoped>
.glyph {
  display: inline-block;
  vertical-align: -0.18em;
}
</style>
