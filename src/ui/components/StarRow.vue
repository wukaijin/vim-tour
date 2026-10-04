<script setup lang="ts">
import KeyGlyph from './KeyGlyph.vue'

/** 黄铜星级（§8.4）：earned 亮星、其余描边空星；弹入用 ease-out-back */
defineProps<{
  stars: number
  of?: number
}>()
</script>

<template>
  <span class="stars" :aria-label="`${stars} 星`" role="img">
    <span v-for="i in of ?? 3" :key="i" class="star" :class="{ lit: i <= stars }">
      <KeyGlyph name="star" :size="40" />
    </span>
  </span>
</template>

<style scoped>
.stars {
  display: inline-flex;
  gap: var(--sp-2);
}

.star {
  color: var(--edge);
  animation: star-in var(--dur-slow) var(--ease-out-back) both;
  animation-delay: calc(var(--i, 0) * 90ms);
}

.star:nth-child(1) {
  --i: 0;
}
.star:nth-child(2) {
  --i: 1;
}
.star:nth-child(3) {
  --i: 2;
}

.star.lit {
  color: var(--star);
  filter: drop-shadow(0 2px 0 rgba(180, 83, 9, 0.35));
}

@keyframes star-in {
  from {
    transform: scale(0.2);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .star {
    animation: none;
    opacity: 0;
    animation: star-fade 120ms ease-out both;
  }
  @keyframes star-fade {
    to {
      opacity: 1;
    }
  }
}
</style>
