<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useGameStore } from '../stores/game'
import StarRow from '../components/StarRow.vue'
import StreakLamps from '../components/StreakLamps.vue'

/** 结算屏（PLAN §8.4）：整屏替换的「通关卡」——齿孔 + 黄铜星 + 等宽数字效率条 */
const game = useGameStore()
const continueBtn = ref<HTMLButtonElement | null>(null)
let focusTimer: ReturnType<typeof setTimeout> | null = null

// 延迟聚焦：通关瞬间玩家手里可能还有残留按键（如收尾的 :wq <CR>），
// 立即聚焦会让 Enter 误触「回到地图」
onMounted(() => {
  focusTimer = setTimeout(() => continueBtn.value?.focus(), 600)
})
onBeforeUnmount(() => {
  if (focusTimer) clearTimeout(focusTimer)
})

const r = computed(() => game.result)
const efficiency = computed(() => {
  if (!r.value || r.value.keys === 0) return 0
  return Math.min(100, Math.round((r.value.par / r.value.keys) * 100))
})
</script>

<template>
  <div v-if="r" class="result">
    <div class="ticket">
      <div class="perf top" aria-hidden="true"></div>

      <header class="t-head">
        <span class="t-chip mono">{{ r.graduation ? '毕业考通过' : '关卡通过' }}</span>
        <h1 class="t-title">{{ r.title }}</h1>
      </header>

      <div class="t-stars">
        <StarRow :stars="r.stars" />
        <span class="t-best" v-if="r.bestStars > r.stars">历史最佳 {{ r.bestStars }}★</span>
      </div>

      <div class="t-eff">
        <div class="eff-nums mono">
          <span class="big">{{ r.keys }}</span>
          <span class="vs">击键 / par</span>
          <span class="big par">{{ r.par }}</span>
        </div>
        <div class="eff-bar" role="img" :aria-label="`效率 ${efficiency}%`">
          <div class="eff-fill" :style="{ width: `${efficiency}%` }"></div>
        </div>
        <p class="eff-note" v-if="r.stars === 3">≤ par 且未用提示与撤销——满星路线</p>
        <p class="eff-note" v-else-if="r.stars === 2">再省 {{ Math.max(0, r.keys - r.par) }} 键可冲 3★</p>
        <p class="eff-note" v-else>完成即得 1★；想拿高星就少敲几键</p>
      </div>

      <div class="t-streak">
        <StreakLamps :k="r.requiredStreak" :n="r.requiredStreak" />
      </div>

      <p v-if="r.graduation" class="t-grad">本章所有关卡的复习时钟已刷新</p>

      <div class="perf bottom" aria-hidden="true"></div>

      <footer class="t-actions">
        <button ref="continueBtn" class="btn primary" @click="game.gotoMap()">回到地图</button>
        <button v-if="r.nextLevelId" class="btn" @click="game.openLevel(r.nextLevelId)">下一关</button>
        <button class="btn ghost" @click="game.openLevel(r.levelId)">再打一遍</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.result {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-6);
}

.ticket {
  position: relative;
  width: 100%;
  max-width: 520px;
  background: var(--surface);
  border-radius: var(--r-card);
  box-shadow: var(--shadow-2);
  padding: var(--sp-8);
  display: flex;
  flex-direction: column;
  gap: var(--sp-6);
}

/* 齿孔：纸面色的圆点打穿卡片上下缘（repeating radial-gradient，零资源） */
.perf {
  position: absolute;
  left: 0;
  right: 0;
  height: 14px;
  background-image: radial-gradient(circle at 8px 7px, var(--paper) 4.5px, transparent 5px);
  background-size: 24px 14px;
  background-repeat: repeat-x;
}

.perf.top {
  top: -7px;
}

.perf.bottom {
  bottom: -7px;
}

.t-head {
  text-align: center;
}

.t-chip {
  display: inline-block;
  font-size: var(--fs-xs);
  color: var(--brand-ink);
  border: 1px solid var(--brand);
  border-radius: var(--r-keycap);
  padding: 1px 10px;
  letter-spacing: 0.12em;
}

.t-title {
  margin-top: var(--sp-2);
  font-size: var(--fs-xl);
}

.t-stars {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-1);
}

.t-best {
  font-size: var(--fs-xs);
  color: var(--ink-2);
}

.t-eff {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.eff-nums {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: var(--sp-3);
}

.eff-nums .big {
  font-size: var(--fs-2xl);
  font-weight: 600;
}

.eff-nums .par {
  color: var(--ink-2);
}

.eff-nums .vs {
  font-size: var(--fs-xs);
  color: var(--ink-2);
}

.eff-bar {
  height: 12px;
  border-radius: 6px;
  background: var(--paper);
  border: 1px solid var(--edge);
  overflow: hidden;
}

.eff-fill {
  height: 100%;
  background: var(--brand);
  border-radius: inherit;
  animation: fill-sweep var(--dur-slow) var(--ease-out);
  transform-origin: left;
}

@keyframes fill-sweep {
  from {
    transform: scaleX(0);
  }
}

.eff-note {
  margin: 0;
  text-align: center;
  font-size: var(--fs-sm);
  color: var(--ink-2);
}

.t-streak {
  display: flex;
  justify-content: center;
}

.t-grad {
  margin: 0;
  text-align: center;
  font-size: var(--fs-sm);
  color: var(--ok-ink);
}

.t-actions {
  display: flex;
  gap: var(--sp-3);
  justify-content: center;
}

.btn {
  height: 56px;
  padding: 0 var(--sp-6);
  border-radius: var(--r-input);
  border: 1px solid var(--edge);
  background: var(--surface);
  font-size: var(--fs-base);
  font-weight: 700;
  box-shadow: var(--shadow-1);
  transition: transform var(--dur-fast) var(--ease-out);
}

.btn:active {
  transform: translateY(2px);
  box-shadow: none;
}

.btn.primary {
  background: var(--brand);
  border-color: var(--brand-ink);
  color: #fff;
  box-shadow: 0 3px 0 var(--brand-ink);
}

.btn.ghost {
  color: var(--ink-2);
  background: transparent;
  box-shadow: none;
}
</style>
