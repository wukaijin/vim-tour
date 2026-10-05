<script setup lang="ts">
import { onMounted } from 'vue'
import { useGameStore } from './ui/stores/game'
import { installRouter } from './ui/router'
import MapScreen from './ui/screens/MapScreen.vue'
import PlayScreen from './ui/screens/PlayScreen.vue'
import ResultScreen from './ui/screens/ResultScreen.vue'
import ToastItem from './ui/components/ToastItem.vue'

const game = useGameStore()

onMounted(() => {
  game.boot()
  installRouter(game)
})
</script>

<template>
  <div v-if="!game.levelsReady" class="loading" aria-label="载入中">
    <span class="loading-keys" aria-hidden="true"><b>v</b><b>i</b><b>m</b></span>
  </div>
  <MapScreen v-else-if="game.screen === 'map'" />
  <PlayScreen v-else-if="game.screen === 'play'" />
  <ResultScreen v-else />
  <!-- 地图态的全局提示（拒绝直链/热身结束）：对局屏的 toast 由 PlayScreen 自渲染 -->
  <ToastItem v-if="game.levelsReady && game.screen === 'map' && game.toast" :toast="game.toast" placement="float" />
</template>

<style scoped>
.loading {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-keys {
  display: inline-flex;
  gap: 4px;
}

.loading-keys b {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--r-keycap);
  background: var(--surface);
  box-shadow: var(--shadow-1), inset 0 1px 0 rgba(255, 255, 255, 0.65);
  font-family: var(--font-mono);
  animation: load-bounce 0.9s var(--ease-out) infinite;
}

.loading-keys b:nth-child(2) {
  animation-delay: 0.12s;
}
.loading-keys b:nth-child(3) {
  animation-delay: 0.24s;
}

@keyframes load-bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  40% {
    transform: translateY(-6px);
  }
}
</style>
