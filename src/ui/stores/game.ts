import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { Key } from '../../engine'
import { levelById, loadAllLevels, loadedLevels } from '../../content'
import { LevelRun } from '../../game/runtime'
import { LevelSession } from '../../game/session'
import { variantForDate } from '../../game/variant'
import { applyProgressEvent, retentionOf } from '../../game/retention'
import { graduationClears } from '../../game/graduation'
import type { ComboChunk } from '../../game/combo'
import { nextLevelId } from '../../game/nodes'
import { dismissWarmupToday, isWarmupDismissed, selectWarmup } from '../../game/warmup'
import type { Level, LevelRecord, Stars } from '../../game/types'
import { detectStorage } from '../../storage/progress'
import { markCardSeen, seenCard } from '../../storage/flags'
import { useProgressStore } from './progress'

export type Screen = 'map' | 'play' | 'result'

type Active =
  | { kind: 'level'; level: Level; session: LevelSession }
  | { kind: 'warmup'; level: Level; run: LevelRun; record: LevelRecord }

export interface ResultPayload {
  levelId: string
  title: string
  stars: Stars
  keys: number
  par: number
  requiredStreak: number
  bestStars: number
  graduation: boolean
  nextLevelId: string | null
  /** par 连招组块（PLAN §2.4D：仅 3 星结算屏渲染） */
  combo: ComboChunk[]
}

export interface Toast {
  id: number
  text: string
  tone: 'plain' | 'ok' | 'err'
}

const WARMUP_BUDGET_MS = 90_000

export const useGameStore = defineStore('game', () => {
  const progress = useProgressStore()
  const storage = detectStorage()

  const screen = ref<Screen>('map')
  const levelsReady = ref(false)
  const active = shallowRef<Active | null>(null)
  /** 引擎持有 undo 栈等大对象，不做深度响应式：每次 feed/动作后自增驱动视图重算 */
  const rev = ref(0)
  const cardVisible = ref(false)
  const hintStage = ref<0 | 1 | 2>(0)
  const hintText = ref<string | null>(null)
  const toast = ref<Toast | null>(null)
  const flash = ref<{ kind: 'rep-ok' | 'rep-err'; id: number } | null>(null)
  const result = ref<ResultPayload | null>(null)
  const recentKeys = ref<Key[]>([])
  const warmup = ref<{ queue: string[]; index: number; deadline: number; remainingMs: number } | null>(null)
  /** 当日已收起（isWarmupDismissed 读 localStorage 非响应式，用 ref 镜像） */
  const warmupHidden = ref(false)
  let warmupTimer: ReturnType<typeof setInterval> | null = null
  let toastTimer: ReturnType<typeof setTimeout> | null = null
  let flashTimer: ReturnType<typeof setTimeout> | null = null
  let toastSeq = 0
  let flashSeq = 0

  const levels = computed(() => (levelsReady.value ? loadedLevels() : []))

  const activeLevel = computed(() => active.value?.level ?? null)

  const activeRun = computed<LevelRun | null>(() => {
    void rev.value
    const a = active.value
    if (!a) return null
    return a.kind === 'level' ? a.session.run : a.run
  })

  const requiredStreak = computed(() => {
    const a = active.value
    if (!a) return 1
    return a.kind === 'level' ? a.session.requiredStreak : 1
  })

  const streak = computed(() => {
    void rev.value
    const a = active.value
    if (!a || a.kind !== 'level') return 0
    return a.session.streak
  })

  function showToast(text: string, tone: Toast['tone'] = 'plain'): void {
    toastSeq += 1
    toast.value = { id: toastSeq, text, tone }
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => (toast.value = null), 1600)
  }

  function showFlash(kind: 'rep-ok' | 'rep-err'): void {
    flashSeq += 1
    flash.value = { kind, id: flashSeq }
    if (flashTimer) clearTimeout(flashTimer)
    flashTimer = setTimeout(() => (flash.value = null), 700)
  }

  function pushRecent(key: Key): void {
    recentKeys.value = [...recentKeys.value.slice(-7), key]
  }

  function openLevel(levelId: string): void {
    const level = levelById(levelId)
    if (!level) return
    const session = new LevelSession({
      level,
      record: progress.recordOf(levelId),
      clock: () => Date.now(),
    })
    active.value = { kind: 'level', level, session }
    cardVisible.value = !!level.teaches && level.teaches.length > 0 && !seenCard(storage, levelId)
    hintStage.value = 0
    hintText.value = null
    recentKeys.value = []
    result.value = null
    screen.value = 'play'
  }

  function closeCard(): void {
    if (!cardVisible.value) return
    const lv = active.value?.level
    if (lv) markCardSeen(storage, lv.id)
    cardVisible.value = false
  }

  function useHint(stage: 1 | 2): void {
    const a = active.value
    if (!a) return
    if (a.kind === 'level') {
      hintText.value = a.session.useHint(stage)
    } else {
      a.run.markHint(stage)
      hintText.value = a.level.hints[stage - 1]
    }
    hintStage.value = Math.max(hintStage.value, stage) as 1 | 2
  }

  function feed(key: Key): void {
    if (cardVisible.value) return
    const a = active.value
    if (!a) return
    if (a.kind === 'level') {
      const out = a.session.feed(key)
      pushRecent(key)
      rev.value++
      if (out.kind === 'untaught') {
        showToast(`还没教到：${key === ' ' ? 'Space' : key}`, 'err')
        return
      }
      if (out.kind === 'rep-success') {
        progress.put(out.record)
        if (out.levelCleared) {
          finishLevel(a.level, out.stars, out.keys, a.session.run.par, a.session.run.combo)
        } else {
          showFlash('rep-ok')
          showToast(`✓ 本轮完成（${out.streak}/${a.session.requiredStreak}）`, 'ok')
        }
      }
    } else {
      const out = a.run.feed(key)
      pushRecent(key)
      rev.value++
      if (out.kind === 'untaught') {
        showToast(`还没教到：${key === ' ' ? 'Space' : key}`, 'err')
        return
      }
      if (out.kind === 'rep-success') {
        const rec = applyProgressEvent(
          a.record,
          a.level.id,
          { kind: 'rep-success', stars: out.stars, keys: out.keys, requiredStreak: 1 },
          Date.now(),
        )
        progress.put(rec)
        showFlash('rep-ok')
        showToast('✓ 热身完成一题', 'ok')
        advanceWarmup()
      }
    }
  }

  function restart(): void {
    const a = active.value
    if (!a) return
    if (a.kind === 'level') {
      const out = a.session.restart()
      rev.value++
      if (out.kind === 'rep-failure') {
        showFlash('rep-err')
        showToast('本轮重来：连续成功已清零', 'err')
      }
    } else if (a.run.concede()) {
      // 热身题放弃：计一次失败后进入下一题（保持 ≤90 秒节奏）
      const rec = applyProgressEvent(a.record, a.level.id, { kind: 'rep-failure' }, Date.now())
      progress.put(rec)
      showToast('这题跳过', 'err')
      advanceWarmup()
    }
  }

  function finishLevel(level: Level, stars: Stars, keys: number, par: number, combo: ComboChunk[]): void {
    const rec = progress.recordOf(level.id)
    const requiredStreak =
      level.requiredStreak ?? (level.chapter <= 1 ? 1 : level.chapter <= 3 ? 2 : 3)
    if (level.graduation) {
      const now = Date.now()
      for (const r of graduationClears(level, levels.value, (id) => progress.recordOf(id), now)) {
        progress.put(r)
      }
    }
    result.value = {
      levelId: level.id,
      title: level.title,
      stars,
      keys,
      par,
      combo,
      requiredStreak,
      bestStars: (rec ? rec.bestStars : 0) as Stars,
      graduation: !!level.graduation,
      nextLevelId: nextLevelId(levels.value, (id) => progress.recordOf(id), Date.now()),
    }
    screen.value = 'result'
  }

  // ---------- 热身（PLAN §2.4C：≤90 秒的仪式，永不门禁） ----------

  const warmupDueIds = computed(() => {
    if (!levelsReady.value) return [] as string[]
    const now = Date.now()
    return selectWarmup(
      levels.value.flatMap((l) => {
        const rec = progress.recordOf(l.id)
        if (!rec || !rec.cleared) return []
        return [
          {
            levelId: l.id,
            due: retentionOf(rec, now).due,
            bestStars: rec.bestStars,
            lastPlayedAt: rec.lastPlayedAt,
          },
        ]
      }),
    )
  })

  const warmupBarVisible = computed(
    () =>
      screen.value === 'map' &&
      !warmup.value &&
      !warmupHidden.value &&
      warmupDueIds.value.length > 0,
  )

  function boot(): void {
    warmupHidden.value = isWarmupDismissed(storage, Date.now())
    void loadAllLevels().then(() => {
      levelsReady.value = true
    })
  }

  function startWarmup(): void {
    const queue = warmupDueIds.value
    if (queue.length === 0) return
    const now = Date.now()
    warmup.value = { queue, index: 0, deadline: now + WARMUP_BUDGET_MS, remainingMs: WARMUP_BUDGET_MS }
    openWarmupQuestion(0)
    warmupTimer = setInterval(tickWarmup, 500)
  }

  function openWarmupQuestion(index: number): void {
    const w = warmup.value
    if (!w) return
    const level = levelById(w.queue[index]!)
    if (!level) {
      finishWarmup()
      return
    }
    const variant = variantForDate(level.texts, Date.now())
    const record =
      progress.recordOf(level.id) ?? applyProgressEvent(null, level.id, { kind: 'clear' }, Date.now())
    active.value = { kind: 'warmup', level, run: new LevelRun(variant, level.allowedKeys), record }
    cardVisible.value = false
    hintStage.value = 0
    hintText.value = null
    recentKeys.value = []
    w.index = index
    screen.value = 'play'
  }

  function advanceWarmup(): void {
    const w = warmup.value
    if (!w) return
    if (w.index + 1 >= w.queue.length) finishWarmup()
    else openWarmupQuestion(w.index + 1)
  }

  function tickWarmup(): void {
    const w = warmup.value
    if (!w) return
    w.remainingMs = Math.max(0, w.deadline - Date.now())
    if (w.remainingMs === 0) finishWarmup()
  }

  function finishWarmup(): void {
    if (warmupTimer) clearInterval(warmupTimer)
    warmupTimer = null
    warmup.value = null
    active.value = null
    screen.value = 'map'
    showToast('热身结束', 'ok')
  }

  function dismissWarmup(): void {
    dismissWarmupToday(storage, Date.now())
    warmupHidden.value = true
  }

  function gotoMap(): void {
    if (warmup.value) finishWarmup()
    else {
      active.value = null
      screen.value = 'map'
    }
  }

  return {
    screen,
    levelsReady,
    active,
    activeLevel,
    activeRun,
    requiredStreak,
    streak,
    rev,
    cardVisible,
    hintStage,
    hintText,
    toast,
    flash,
    result,
    recentKeys,
    warmup,
    warmupDueIds,
    warmupBarVisible,
    levels,
    boot,
    openLevel,
    closeCard,
    useHint,
    feed,
    restart,
    startWarmup,
    finishWarmup,
    dismissWarmup,
    gotoMap,
  }
})
