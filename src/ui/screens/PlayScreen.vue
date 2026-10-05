<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { commandById } from '../../content'
import { diffLines } from '../lib/diff'
import { eventToKey, shouldBypassCapture } from '../lib/keys'
import { useGameStore } from '../stores/game'
import EditorView from '../components/EditorView.vue'
import TargetDiff from '../components/TargetDiff.vue'
import KeyEchoBar from '../components/KeyEchoBar.vue'
import StreakLamps from '../components/StreakLamps.vue'
import TeachingCard from '../components/TeachingCard.vue'
import ToastItem from '../components/ToastItem.vue'

const game = useGameStore()
const rootEl = ref<HTMLElement | null>(null)
const hintBtn = ref<HTMLButtonElement | null>(null)
let msgTimer: ReturnType<typeof setTimeout> | null = null
const transientMsg = ref<string | null>(null)

/**
 * 引擎持有非响应式实例（LevelRun/VimEngine），且 activeRun 始终返回同一引用——
 * computed 缓存会把 mode/lines/cursor 冻结在第 0 帧。这里每次 rev 变化都
 * 产出全新快照对象，强制下游与模板刷新。
 */
const view = computed(() => {
  void game.rev
  const r = game.activeRun
  if (!r) return null
  return {
    lines: [...r.lines],
    cursor: { ...r.cursor },
    mode: r.mode,
    keys: r.keys,
    par: r.par,
    status: r.status,
    pending: r.pendingEcho(),
    cmdline: r.engine.cmdline?.text ?? '',
    message: r.engine.message,
    selection: r.mode.startsWith('visual') ? r.engine.selectionRange() : null,
  }
})
const level = computed(() => game.activeLevel)

const lines = computed(() => view.value?.lines ?? [])
const cursor = computed(() => view.value?.cursor ?? { line: 0, col: 0 })
const mode = computed(() => view.value?.mode ?? 'normal')
const diffRows = computed(() => {
  void game.rev
  const r = game.activeRun
  return r ? diffLines(r.lines, r.target) : []
})
/** 引擎消息（如 Pattern not found）只在那次按键期间存在，短暂暂存展示 */
const message = computed(() => {
  const m = view.value?.message ?? null
  if (m) {
    if (msgTimer) clearTimeout(msgTimer)
    msgTimer = setTimeout(() => (transientMsg.value = null), 1500)
    transientMsg.value = m
    return m
  }
  return transientMsg.value
})
const pending = computed(() => view.value?.pending ?? '')
const cmdline = computed(() => view.value?.cmdline ?? '')

const teachCards = computed(() => (level.value?.teaches ?? []).map((id) => commandById(id)))

const warmupTotal = computed(() => game.warmup?.queue.length ?? 0)
const warmupIndex = computed(() => (game.warmup?.index ?? 0) + 1)
const warmupSeconds = computed(() => Math.ceil((game.warmup?.remainingMs ?? 0) / 1000))

function onKeydown(e: KeyboardEvent): void {
  if (game.cardVisible) {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault()
      game.closeCard()
    }
    return
  }
  // 打字态（insert/cmdline）绝不放行：焦点残留在工具栏按钮上时，
  // Space/Enter 会被按钮激活行为吞掉，插入文本缺字（键盘可达性只保 normal 态）
  const m = mode.value
  const typing = m === 'insert' || m === 'cmdline'
  if (!typing && shouldBypassCapture(e, e.target)) return
  const key = eventToKey(e)
  if (key === null) return
  e.preventDefault()
  game.feed(key)
}

/** 按钮点击后把焦点收回对局表面：防止空格/回车误触按钮（键盘产品红线） */
function reclaimFocus(): void {
  rootEl.value?.focus({ preventScroll: true })
}

/** 重来：引擎消息暂存（如 Pattern not found）随 run 一起归零，不留上一轮残影 */
function onRestart(): void {
  game.restart()
  if (msgTimer) {
    clearTimeout(msgTimer)
    msgTimer = null
  }
  transientMsg.value = null
  reclaimFocus()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  // 每屏首个可聚焦元素 = 提示按钮（§8.5）；教学卡打开时焦点让给卡片的开始按钮
  if (!game.cardVisible) hintBtn.value?.focus()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (msgTimer) clearTimeout(msgTimer)
})
</script>

<template>
  <div v-if="level" ref="rootEl" class="play" tabindex="-1">
    <!-- 工具行：提示按钮是本屏首个可聚焦元素（§8.5 硬条款） -->
    <div class="toolbar">
      <div class="tool-left">
        <button
          ref="hintBtn"
          class="tool hint1"
          @click="game.useHint(1); reclaimFocus()"
        >
          提示 · 方向
        </button>
        <button class="tool hint2" :disabled="game.hintStage < 1" @click="game.useHint(2); reclaimFocus()">
          提示 · 解法 <span class="warn">−2★</span>
        </button>
        <button class="tool restart" @click="onRestart()">重来</button>
        <button
          v-if="teachCards.length && !game.warmup"
          class="tool teach"
          @click="game.reopenCard(); reclaimFocus()"
        >
          教学卡
        </button>
      </div>
      <div class="tool-right">
        <div v-if="game.warmup" class="warmup-chip">
          <span>热身 {{ warmupIndex }}/{{ warmupTotal }}</span>
          <span class="mono timer" :class="{ low: warmupSeconds <= 10 }">{{ warmupSeconds }}s</span>
          <button class="tool skip" @click="game.finishWarmup()">跳过热身</button>
        </div>
        <StreakLamps v-else :k="game.streak" :n="game.requiredStreak" />
        <button class="tool back" @click="game.gotoMap(); reclaimFocus()">返回地图</button>
      </div>
    </div>

    <header class="head">
      <h1 class="title">{{ level.title }}</h1>
      <p class="brief">{{ level.brief }}</p>
    </header>

    <div class="board">
      <EditorView
        class="pane"
        :lines="lines"
        :cursor="cursor"
        :mode="mode"
        :grid="level.grid !== false"
        :selection="view?.selection ?? null"
      />
      <TargetDiff
        class="pane"
        :rows="diffRows"
        :shake="game.flash?.kind === 'rep-err'"
        :stamp="game.flash?.kind === 'rep-ok'"
      />
    </div>

    <!-- 底部停靠区：提示条 + 回显条吸底（vim 命令行的空间位置），toast 浮在其上方 -->
    <div class="dock">
      <div v-if="game.hintText" class="hint-panel" :data-stage="game.hintStage" role="note">
        <span class="hint-tag">{{ game.hintStage === 1 ? '方向提示' : '完整解法' }}</span>
        <span>{{ game.hintText }}</span>
        <span v-if="game.hintStage" class="hint-cost">看过提示，本次封顶 1 ★</span>
      </div>

      <KeyEchoBar
        :pending="pending"
        :mode="mode"
        :cmdline="cmdline"
        :recent="game.recentKeys"
        :message="message"
      >
        <template #counters>
          <span class="counters mono" aria-label="击键与 par">
            <b>{{ view?.keys ?? 0 }}</b> 击键 · par <b>{{ view?.par ?? 0 }}</b>
          </span>
        </template>
      </KeyEchoBar>

      <ToastItem v-if="game.toast" :toast="game.toast" placement="dock" />
    </div>

    <TeachingCard
      v-if="game.cardVisible"
      :title="`${level.chapter}-${level.id.slice(-2)} ${level.title}`"
      :teaches="teachCards"
      @close="game.closeCard(); reclaimFocus()"
    />
  </div>
</template>

<style scoped>
.play {
  position: relative;
  max-width: 1080px;
  margin: 0 auto;
  padding: var(--sp-4) var(--sp-6) var(--sp-8);
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-height: 100vh;
  outline: none;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
}

.tool-left {
  display: flex;
  gap: var(--sp-2);
}

.tool-right {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}

.tool {
  border: 1px solid var(--edge);
  background: var(--surface);
  border-radius: var(--r-keycap);
  padding: var(--sp-1) var(--sp-3);
  font-size: var(--fs-sm);
  box-shadow: var(--shadow-1);
  transition: transform var(--dur-fast) var(--ease-out);
}

.tool:active {
  transform: translateY(2px);
  box-shadow: none;
}

.tool:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.tool .k {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--ink-2);
  border: 1px solid var(--edge);
  border-radius: 4px;
  padding: 0 4px;
  margin-left: 4px;
}

.tool .warn {
  color: var(--warn-ink);
  font-size: var(--fs-xs);
}

.hint2:not(:disabled) {
  border-color: var(--warn);
}

.warmup-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-sm);
  color: var(--brand-ink);
  background: color-mix(in srgb, var(--ch1) 70%, var(--surface));
  border: 1px solid var(--brand);
  border-radius: var(--r-keycap);
  padding: var(--sp-1) var(--sp-3);
}

.timer {
  font-weight: 600;
}

.timer.low {
  color: var(--err-ink);
}

.head .title {
  font-size: var(--fs-xl);
}

.brief {
  margin: 0;
  color: var(--ink-2);
}

.board {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: var(--sp-4);
  align-items: stretch;
  /* 缓冲区撑满可用高度：vim 里编辑区占满窗口，命令行只占最后一行；
     否则短关卡会变成「内容顶在上、状态条贴在下、中间一片空洞」 */
  flex: 1 0 auto;
  min-height: 240px;
}

/* 停靠区吸底：对局屏不再是内容压在顶部、下半屏空置的头重脚轻构图 */
.dock {
  position: relative;
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.counters {
  font-size: var(--fs-sm);
  color: var(--ink-2);
  white-space: nowrap;
}

.counters b {
  color: var(--ink);
  font-size: var(--fs-lg);
}

.hint-panel {
  display: flex;
  align-items: baseline;
  gap: var(--sp-3);
  background: var(--warn-fill);
  border: 1px solid var(--warn);
  border-radius: var(--r-keycap);
  padding: var(--sp-2) var(--sp-4);
  font-size: var(--fs-sm);
  color: var(--warn-ink);
}

/* 完整解法不是错误：与方向提示同属 warn 家族（PLAN §8.2「提示扣星」），
   换纸色底 + 正文墨色承载更长的解法文本，代价交给琥珀色的 cost 标注 */
.hint-panel[data-stage='2'] {
  background: var(--surface);
  color: var(--ink);
}

.hint-tag {
  font-weight: 700;
  flex: none;
}

.hint-cost {
  margin-left: auto;
  font-size: var(--fs-xs);
  color: var(--warn-ink);
  font-weight: 700;
  white-space: nowrap;
}

/* toast 外观与锚点见 ToastItem.vue（对局屏贴停靠区，地图屏悬浮底部） */
</style>
