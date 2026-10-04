<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { CHAPTERS } from '../../content'
import { chapterNodes } from '../../game/nodes'
import type { NodeInfo } from '../../game/nodes'
import { useGameStore } from '../stores/game'
import { useProgressStore } from '../stores/progress'
import KeyGlyph from '../components/KeyGlyph.vue'

const game = useGameStore()
const progress = useProgressStore()

const now = ref(Date.now())
let clockTimer: ReturnType<typeof setInterval> | null = null
const firstCurrent = ref<HTMLButtonElement | null>(null)

onMounted(() => {
  clockTimer = setInterval(() => (now.value = Date.now()), 30_000)
  window.addEventListener('keydown', onKeydown)
  // 地图初始焦点：当前关卡节点（键盘焦点永不丢失，§8.5）
  firstCurrent.value?.focus()
})
onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer)
  window.removeEventListener('keydown', onKeydown)
})

const chapters = computed(() =>
  CHAPTERS.map((meta) => ({
    meta,
    nodes: chapterNodes(meta.id, game.levels, (id) => progress.recordOf(id), now.value),
  })),
)

/** 蜿蜒路线几何：节点绝对定位 + SVG 曲线连接 */
const NODE = 68
const ROW_H = 104
const X_PATTERN = [72, 400, 136, 336]

function nodeX(i: number): number {
  return X_PATTERN[i % X_PATTERN.length]!
}
function nodeY(i: number): number {
  return i * ROW_H
}
function routeHeight(count: number): number {
  return count > 0 ? nodeY(count - 1) + NODE + 16 : 0
}
function routePath(count: number): string {
  if (count < 2) return ''
  const pts = Array.from({ length: count }, (_, i) => ({
    x: nodeX(i) + NODE / 2,
    y: nodeY(i) + NODE / 2,
  }))
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    const dy = (b.y - a.y) * 0.45
    d += ` C ${a.x} ${a.y + dy}, ${b.x} ${b.y - dy}, ${b.x} ${b.y}`
  }
  return d
}

function starsOf(node: NodeInfo): number {
  return progress.recordOf(node.level.id)?.bestStars ?? 0
}

function nodeTitle(node: NodeInfo): string {
  const s = starsOf(node)
  return s > 0 ? `${node.level.title} · 最佳 ${s}★` : node.level.title
}

function openNode(node: NodeInfo): void {
  if (node.state === 'locked') return
  game.openLevel(node.level.id)
}

/** 地图上 Esc = 收起热身卡（当日不再出现，PLAN §2.4C） */
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && game.warmupBarVisible) {
    e.preventDefault()
    game.dismissWarmup()
    now.value = Date.now() // 触发 warmupBarVisible 重算
  }
}

const warmupCount = computed(() => game.warmupDueIds.length)
</script>

<template>
  <div class="map">
    <header class="brand">
      <span class="brand-keys" aria-hidden="true">
        <span class="bk">v</span><span class="bk">i</span><span class="bk">m</span>
        <span class="tour">tour</span>
      </span>
      <span class="tagline">键帽上的 vim 修行</span>
    </header>

    <!-- 热身卡：顶部全宽窄条（PLAN §2.4C） -->
    <div v-if="game.warmupBarVisible" class="warmup" role="region" aria-label="每日热身">
      <span class="w-text">
        <b>{{ warmupCount }}</b> 个键帽生疏了 · 约 90 秒
      </span>
      <span class="w-actions">
        <button class="w-go" @click="game.startWarmup()">开始热身</button>
        <button class="w-skip" @click="game.dismissWarmup(); now = Date.now()">跳过 <span class="mono">Esc</span></button>
      </span>
    </div>

    <section v-for="{ meta, nodes } in chapters" :key="meta.id" class="chapter">
      <header class="ch-band" :style="{ '--ch': meta.color }">
        <span class="ch-no mono">CH{{ meta.id }}</span>
        <h2 class="ch-title">{{ meta.title }}</h2>
        <span class="ch-sub">{{ meta.subtitle }}</span>
        <span v-if="nodes[0]?.state === 'locked'" class="ch-lock">
          <KeyGlyph name="lock" :size="16" /> 完成上一章毕业考解锁
        </span>
      </header>

      <div class="route" :style="{ height: `${routeHeight(nodes.length)}px` }">
        <svg class="route-svg" :width="540" :height="routeHeight(nodes.length)" aria-hidden="true">
          <path :d="routePath(nodes.length)" class="route-line" />
        </svg>
        <div
          v-for="(node, i) in nodes"
          :key="node.level.id"
          class="node-wrap"
          :style="{ left: `${nodeX(i)}px`, top: `${nodeY(i)}px` }"
        >
          <button
            :ref="(el) => { if (node.state === 'current' && el) firstCurrent = el as HTMLButtonElement }"
            class="node"
            :class="[node.state, { 'ink-border': meta.inkBorder }]"
            :style="{ '--ch': meta.color }"
            :disabled="node.state === 'locked'"
            :aria-label="nodeTitle(node)"
            :title="nodeTitle(node)"
            @click="openNode(node)"
          >
            <span class="n-no mono">{{ i + 1 }}</span>
            <span
              v-if="node.state === 'done' || node.state === 'due-review' || node.level.graduation"
              class="n-badge"
            >
              <template v-if="node.state === 'done'">✓</template>
              <template v-else-if="node.state === 'due-review'">复</template>
              <template v-else-if="node.level.graduation">考</template>
            </span>
            <span class="n-stars" v-if="starsOf(node) > 0">
              <span v-for="s in 3" :key="s" class="n-star" :class="{ lit: s <= starsOf(node) }">★</span>
            </span>
          </button>
          <span class="n-label">{{ node.level.title }}</span>
          <span v-if="node.state === 'current'" class="n-pointer" aria-hidden="true">▸ 你在这</span>
        </div>
      </div>
    </section>

    <footer class="foot">
      <span class="foot-note">进度存在本机 localStorage，无账号无同步</span>
      <button class="reset" @click="progress.clearAll()">重置全部进度</button>
    </footer>
  </div>
</template>

<style scoped>
.map {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--sp-6) var(--sp-4) var(--sp-8);
  display: flex;
  flex-direction: column;
  gap: var(--sp-6);
}

/* —— 品牌行（禁 hero 大标题，§8.1）—— */
.brand {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand-keys {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.bk {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--r-keycap);
  background: var(--surface);
  box-shadow: var(--shadow-1), inset 0 1px 0 rgba(255, 255, 255, 0.65);
  font-family: var(--font-mono);
  font-weight: 600;
}

.tour {
  margin-left: var(--sp-2);
  font-family: var(--font-display);
  font-size: var(--fs-xl);
}

.tagline {
  font-size: var(--fs-sm);
  color: var(--ink-2);
}

/* —— 热身条 —— */
.warmup {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  background: var(--surface);
  border: 1px solid var(--brand);
  border-radius: var(--r-input);
  box-shadow: var(--shadow-1);
  padding: var(--sp-2) var(--sp-4);
}

.w-text {
  font-size: var(--fs-sm);
  color: var(--brand-ink);
}

.w-text b {
  font-family: var(--font-display);
  font-size: var(--fs-lg);
}

.w-actions {
  display: inline-flex;
  gap: var(--sp-2);
}

.w-go {
  height: 40px;
  padding: 0 var(--sp-6);
  border-radius: var(--r-keycap);
  border: 1px solid var(--brand-ink);
  background: var(--brand);
  color: #fff;
  font-weight: 700;
  box-shadow: 0 3px 0 var(--brand-ink);
}

.w-go:active {
  transform: translateY(2px);
  box-shadow: none;
}

.w-skip {
  border: 1px solid var(--edge);
  background: transparent;
  border-radius: var(--r-keycap);
  padding: 0 var(--sp-3);
  color: var(--ink-2);
  font-size: var(--fs-sm);
}

/* —— 章节 —— */
.chapter {
  background: var(--surface);
  border: 1px solid var(--edge);
  border-radius: var(--r-card);
  box-shadow: var(--shadow-1);
  overflow: hidden;
}

.ch-band {
  display: flex;
  align-items: baseline;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border-left: 8px solid var(--ch);
  border-bottom: 1px solid var(--edge);
}

.ch-no {
  font-size: var(--fs-xs);
  color: var(--ink-2);
  letter-spacing: 0.1em;
}

.ch-title {
  font-size: var(--fs-lg);
}

.ch-sub {
  font-size: var(--fs-xs);
  color: var(--ink-2);
}

.ch-lock {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-xs);
  color: var(--ink-2);
}

/* —— 蜿蜒路线 —— */
.route {
  position: relative;
  margin: var(--sp-4) 0;
}

.route-svg {
  position: absolute;
  inset: 0;
}

.route-line {
  fill: none;
  stroke: var(--edge);
  stroke-width: 5px;
  stroke-linecap: round;
}

.node-wrap {
  position: absolute;
  width: 68px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.node {
  position: relative;
  width: 68px;
  height: 68px;
  border-radius: var(--r-node);
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  padding: 0;
}

.n-no {
  font-family: var(--font-display);
  font-size: var(--fs-xl);
}

/* locked：无色凹槽 */
.node.locked {
  background: var(--paper);
  box-shadow: inset 0 3px 6px rgba(43, 42, 38, 0.18);
  color: #b9b29e;
  cursor: not-allowed;
}

/* done / current / due-review：实心章节色 + 硬边 */
.node.done,
.node.current,
.node.due-review {
  background: var(--ch);
  color: var(--ink);
  box-shadow: 0 4px 0 color-mix(in srgb, var(--ch) 55%, var(--ink));
}

.node.ink-border.done,
.node.ink-border.current,
.node.ink-border.due-review {
  outline: 2px solid var(--ink);
  outline-offset: -2px;
}

.node.done {
  cursor: pointer;
}

/* current：脉冲光晕（::after 只动 scale+opacity，§8.5）+ 指针 */
.node.current {
  cursor: pointer;
}

.node.current::after {
  content: '';
  position: absolute;
  inset: -6px;
  border-radius: inherit;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--ch) 80%, transparent), transparent);
  animation: pulse 1.8s var(--ease-out) infinite;
  z-index: -1;
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(0.94);
    opacity: 0.55;
  }
  50% {
    transform: scale(1.03);
    opacity: 1;
  }
}

/* due-review：颜色与 done 完全一致，靠虚线底边 + 「复」徽标 + 呼吸区分（色盲可辨） */
.node.due-review {
  cursor: pointer;
}

.node.due-review::after {
  content: '';
  position: absolute;
  inset: -5px;
  border-radius: inherit;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ch) 70%, var(--ink));
  animation: breathe 1.8s ease-in-out infinite;
  z-index: -1;
}

@keyframes breathe {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.35;
  }
  50% {
    transform: scale(1.03);
    opacity: 0.9;
  }
}

.n-badge {
  position: absolute;
  top: -7px;
  right: -7px;
  width: 22px;
  height: 22px;
  border-radius: var(--r-keycap);
  background: var(--ink);
  color: var(--surface);
  font-size: var(--fs-xs);
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.4);
}

.n-stars {
  position: absolute;
  bottom: 4px;
  display: inline-flex;
  gap: 1px;
  font-size: 10px;
  color: rgba(43, 42, 38, 0.25);
}

.n-star.lit {
  color: var(--warn-ink);
}

.n-label {
  font-size: var(--fs-xs);
  color: var(--ink-2);
  text-align: center;
  max-width: 128px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.n-pointer {
  font-size: var(--fs-xs);
  color: var(--brand-ink);
  font-weight: 700;
}

.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--ink-2);
  font-size: var(--fs-xs);
}

.reset {
  border: 1px solid var(--edge);
  background: transparent;
  border-radius: var(--r-keycap);
  color: var(--ink-2);
  font-size: var(--fs-xs);
  padding: 2px 10px;
}

@media (prefers-reduced-motion: reduce) {
  .node.current::after,
  .node.due-review::after {
    animation: none;
  }
}
</style>
