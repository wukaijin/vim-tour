<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useGameStore } from '../stores/game'
import ComboStrip from '../components/ComboStrip.vue'
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
// 只有连招里真出现文本输入键帽时才需要图例，否则是句废话
const comboHasText = computed(() => r.value?.combo.some((c) => c.kind === 'type') ?? false)
</script>

<template>
  <div v-if="r" class="result">
    <div class="ticket">
      <div class="perf top" aria-hidden="true"></div>

      <header class="t-head">
        <span class="t-chip mono">{{ r.sandbox ? '沙盒关卡' : r.graduation ? '毕业考通过' : '关卡通过' }}</span>
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
        <div class="eff-meter">
          <div class="eff-bar" role="img" :aria-label="`用键 ${r.keys}，par ${r.par}，效率 ${efficiency}%`">
            <div class="eff-fill" :style="{ width: `${efficiency}%` }"></div>
            <span
              v-if="efficiency < 100"
              class="eff-tick"
              :style="{ left: `${efficiency}%` }"
              aria-hidden="true"
            ></span>
          </div>
          <!-- 刻度尺：par 分界处标出，左段是 par 额度、右段是多敲的键 -->
          <div class="eff-scale" aria-hidden="true">
            <span v-if="efficiency < 100" class="eff-par" :style="{ left: `${efficiency}%` }">
              par {{ r.par }}
            </span>
          </div>
        </div>
        <p class="eff-note" v-if="r.stars === 3">≤ par 且未用提示与撤销——满星路线</p>
        <p class="eff-note" v-else-if="r.stars === 2">再省 {{ Math.max(0, r.keys - r.par) }} 键可冲 3★</p>
        <p class="eff-note" v-else>完成即得 1★；想拿高星就少敲几键</p>
      </div>

      <div class="t-combo" v-if="r.stars === 3 && r.combo.length > 0">
        <p class="combo-label">你的连招</p>
        <ComboStrip :chunks="r.combo" />
        <p class="combo-legend" v-if="comboHasText">深色键帽 = 你键入的文本</p>
      </div>

      <div class="t-streak" v-if="!r.sandbox">
        <StreakLamps :k="r.requiredStreak" :n="r.requiredStreak" />
      </div>

      <p v-if="r.graduation" class="t-grad">本章所有关卡的复习时钟已刷新</p>
      <p v-else-if="r.sandbox" class="t-grad">沙盒成绩只记在这道题上，不影响正篇进度</p>

      <div class="perf bottom" aria-hidden="true"></div>

      <footer class="t-actions">
        <button ref="continueBtn" class="btn primary" @click="r.sandbox ? game.gotoForge() : game.gotoMap()">
          {{ r.sandbox ? '回到工坊' : '回到地图' }}
        </button>
        <button v-if="r.nextLevelId" class="btn" @click="game.openLevel(r.nextLevelId)">下一关</button>
        <button class="btn ghost" @click="r.sandbox ? game.openSandboxLevel(r.levelId) : game.openLevel(r.levelId)">
          再打一遍
        </button>
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
  /* 描边让票卡边界成立，也让齿孔打断的虚线读得出来 */
  border: 1px solid var(--edge);
  border-radius: var(--r-card);
  box-shadow: var(--shadow-2);
  padding: var(--sp-8);
  display: flex;
  flex-direction: column;
  gap: var(--sp-6);
}

/* 齿孔：纸面色的圆点打穿卡片上下缘（repeating radial-gradient，零资源）。
   底缘靠 6px 硬阴影带衬托即可读；顶缘外侧是页底色、与卡面仅差 3% 明度，
   孔洞本身看不见，故顶缘另加一圈 --edge 孔沿 + 外侧页底色遮罩 */
.perf {
  position: absolute;
  left: 0;
  right: 0;
  height: 14px;
  --perf-punch: radial-gradient(circle at 8px 7px, var(--paper) 6px, transparent 6.4px);
  background-image: var(--perf-punch);
  background-size: 24px 14px;
  background-repeat: repeat-x;
}

.perf.top {
  top: -8px;
  background-image:
    linear-gradient(to bottom, var(--paper) 0 7px, transparent 7px),
    radial-gradient(circle at 8px 7px, transparent 4.8px, var(--edge) 4.8px 6px, transparent 6.2px),
    var(--perf-punch);
}

.perf.bottom {
  bottom: -8px;
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

.eff-meter {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.eff-bar {
  position: relative;
  height: 12px;
  border-radius: 6px;
  background: var(--paper);
  /* 内环代替描边：填充宽度与刻度共用同一参考宽度，分界不会差 1px */
  box-shadow: inset 0 0 0 1px var(--edge);
  overflow: hidden;
}

.eff-fill {
  height: 100%;
  background: var(--brand);
  border-radius: inherit;
  animation: fill-sweep var(--dur-slow) var(--ease-out);
  transform-origin: left;
}

/* par 分界刻度：与填充末端严格同位置 */
.eff-tick {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--ink);
}

.eff-scale {
  position: relative;
  height: 14px;
}

.eff-par {
  position: absolute;
  transform: translateX(-50%);
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--ink-2);
  white-space: nowrap;
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

.t-combo {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  align-items: center;
  padding: var(--sp-2) var(--sp-2);
  border: 1px dashed var(--edge);
  border-radius: var(--r-input);
}

.combo-label {
  margin: 0;
  font-size: var(--fs-xs);
  letter-spacing: 0.12em;
  color: var(--ink-2);
}

/* 深色键帽（tone="ink"，输入文本）无图例则零基础玩家无从判断含义 */
.combo-legend {
  margin: 0;
  font-size: var(--fs-xs);
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
