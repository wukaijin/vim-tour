<script setup lang="ts">
/**
 * 参数化键帽（PLAN §8.1 / §10.3）：全站唯一插画原语——
 * 键帽墙、按键回显、章节节点徽标、指示灯都由它派生。
 * 底边用 ::before 实色块 + face 位移实现，按下时 translateY(2px) 且底边变矮，
 * 不 transition box-shadow（不进合成层会掉帧）。
 */
withDefaults(
  defineProps<{
    label: string
    tone?: 'plain' | 'brand' | 'ok' | 'err' | 'warn' | 'star' | 'ink'
    size?: 'xs' | 'sm' | 'md' | 'lg'
    pressed?: boolean
    /** 额外宽度（以字符计），用于 Tab/Space 这类长键 */
    span?: number
  }>(),
  { tone: 'plain', size: 'md', pressed: false },
)
</script>

<template>
  <span
    class="keycap"
    :class="[tone, size, { pressed }]"
    :style="span ? { minWidth: `calc(${span}ch + 20px)` } : undefined"
  >
    <span class="face">{{ label }}</span>
  </span>
</template>

<style scoped>
.keycap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-keycap);
  transition: transform var(--dur-fast) var(--ease-out);
}

/* 底部 3px 实色边：块在 face 之后、下移 3px */
.keycap::before {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateY(3px);
  border-radius: inherit;
  background: var(--kc-edge);
  transition: transform var(--dur-fast) var(--ease-out);
}

.face {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: var(--kc-h);
  padding: 0 var(--kc-px);
  border-radius: inherit;
  background: var(--kc-face);
  /* 顶部 1px 高光（§8.1） */
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
  font-family: var(--font-mono);
  font-weight: 500;
  white-space: nowrap;
}

/* —— 尺寸 —— */
.keycap.xs {
  --kc-h: 18px;
  --kc-px: 4px;
  font-size: var(--fs-xs);
}
.keycap.sm {
  --kc-h: 22px;
  --kc-px: 6px;
  font-size: var(--fs-xs);
}
.keycap.md {
  --kc-h: 30px;
  --kc-px: 9px;
  font-size: var(--fs-sm);
}
.keycap.lg {
  --kc-h: 44px;
  --kc-px: 16px;
  font-size: var(--fs-lg);
}

/* —— 色调：fill/edge 成对（§8.2 语义色双档）—— */
.keycap.plain {
  --kc-face: var(--surface);
  --kc-edge: #cfc8b6;
  color: var(--ink);
}
.keycap.brand {
  --kc-face: #a5f3fc;
  --kc-edge: #0891b2;
  color: var(--brand-ink);
}
.keycap.ok {
  --kc-face: var(--ok-fill);
  --kc-edge: var(--ok);
  color: var(--ok-ink);
}
.keycap.err {
  --kc-face: var(--err-fill);
  --kc-edge: var(--err);
  color: var(--err-ink);
}
.keycap.warn {
  --kc-face: var(--warn-fill);
  --kc-edge: var(--warn);
  color: var(--warn-ink);
}
.keycap.star {
  --kc-face: var(--star-fill);
  --kc-edge: var(--star);
  color: var(--warn-ink);
}
.keycap.ink {
  --kc-face: var(--ink);
  --kc-edge: #000;
  color: var(--surface);
}

/* —— 按下：整体下沉 2px，底边净高 2px（观感=底边变矮）—— */
.keycap.pressed {
  transform: translateY(2px);
}
.keycap.pressed::before {
  transform: translateY(1px);
}
</style>
