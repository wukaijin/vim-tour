import { watch } from 'vue'
import type { useGameStore } from './stores/game'

/**
 * 极简 hash 路由（不引 vue-router：三屏无嵌套无守卫复杂度，双向桥接足够）：
 *   #/          章节地图
 *   #/level/x   对局屏（关卡 x）
 *   #/warmup    对局屏（热身）
 * 结算屏不可寻址：hash 停留在进入对局前的值——后退回地图、刷新重进该关，都自然。
 */
export type Route =
  | { name: 'map' }
  | { name: 'level'; id: string }
  | { name: 'warmup' }
  | { name: 'unknown' }

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, '')
  if (h === '' || h === '/') return { name: 'map' }
  if (h === '/warmup') return { name: 'warmup' }
  const m = h.match(/^\/level\/([\w-]+)$/)
  return m ? { name: 'level', id: m[1]! } : { name: 'unknown' }
}

type GameStore = ReturnType<typeof useGameStore>

/** store 当前状态期望的 hash；null = 状态不可寻址（结算屏），不动 URL */
function desiredHash(game: GameStore): string | null {
  if (game.screen === 'map') return '#/'
  if (game.screen === 'result') return null
  const a = game.active
  if (a?.kind === 'warmup') return '#/warmup'
  if (a?.kind === 'level') return `#/level/${a.level.id}`
  return null
}

export function installRouter(game: GameStore): void {
  // 状态 → URL：store 动作后同步地址栏；同值赋值不触发 hashchange，无回环
  watch(
    () => [game.screen, game.active, game.warmup],
    () => {
      const want = desiredHash(game)
      if (want !== null && want !== location.hash) location.hash = want
    },
  )

  // URL → 状态：后退/前进/直链/刷新。关卡未载完时跳过，levelsReady 翻真后重评估
  const applyRoute = (): void => {
    if (!game.levelsReady) return
    const route = parseHash(location.hash)
    switch (route.name) {
      case 'map':
        if (game.screen !== 'map') game.gotoMap()
        break
      case 'level': {
        const a = game.active
        const onIt = a?.kind === 'level' && a.level.id === route.id && game.screen === 'play'
        if (!onIt && !game.openLevel(route.id)) {
          // 直链被守卫拒绝（锁定或不存在）：拉回地图
          game.showToast('关卡未解锁', 'err')
          location.hash = '#/'
        }
        break
      }
      case 'warmup':
        if (!game.warmup) {
          game.startWarmup()
          // 无到期关卡（无可热身）：拉回地图
          if (!game.warmup) location.hash = '#/'
        }
        break
      default:
        location.hash = '#/'
    }
  }

  window.addEventListener('hashchange', applyRoute)
  watch(
    () => game.levelsReady,
    (ready) => {
      if (ready) applyRoute()
    },
  )
  applyRoute()
}
