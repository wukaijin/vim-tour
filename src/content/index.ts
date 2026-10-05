import type { Level } from '../game/types'
export { commandById, commandsUpTo } from './commands'

export interface ChapterMeta {
  id: number
  title: string
  subtitle: string
  /** 章节色：cyan 单色相 7 档 ramp，浅→深 = 易→难（PLAN §8.2） */
  color: string
  /** 浅色阶节点需要 2px ink 描边（PLAN §8.2） */
  inkBorder: boolean
}

/** ch1 #CFFAFE → ch7 #0E7490（Tailwind cyan 100→700 恰为等距 7 档） */
const RAMP = ['#CFFAFE', '#A5F3FC', '#67E8F9', '#22D3EE', '#06B6D4', '#0891B2', '#0E7490'] as const

export const CHAPTERS: ChapterMeta[] = [
  { id: 1, title: '生存', subtitle: '模式概念 · 增删改的基础键', color: RAMP[0], inkBorder: true },
  { id: 2, title: '词与行移动', subtitle: '在大文件里跑起来', color: RAMP[1], inkBorder: true },
  { id: 3, title: '操作符与移动', subtitle: 'd c y · 计数 · 重复', color: RAMP[2], inkBorder: true },
  { id: 4, title: '文本对象', subtitle: 'iw aw · i( i" · it ip', color: RAMP[3], inkBorder: true },
  { id: 5, title: 'Visual 模式', subtitle: 'v V C-v · 缩进 · 块插入', color: RAMP[4], inkBorder: false },
]

export function chapterMeta(id: number): ChapterMeta | undefined {
  return CHAPTERS.find((c) => c.id === id)
}

const chapterFiles = import.meta.glob<{ default: Level[] }>('./chapters/ch*.ts')

const cache = new Map<number, Level[]>()

/** 关卡数据按章成 chunk（PLAN §10.6）；MVP 两章在启动时一并装载 */
export async function loadChapter(id: number): Promise<Level[]> {
  const hit = cache.get(id)
  if (hit) return hit
  const file = chapterFiles[`./chapters/ch${id}.ts`]
  if (!file) throw new Error(`chapter ${id} not found`)
  const mod = await file()
  cache.set(id, mod.default)
  return mod.default
}

export async function loadAllLevels(): Promise<Level[]> {
  const chapters = await Promise.all(
    Object.keys(chapterFiles)
      .map((k) => Number(/ch(\d+)\.ts$/.exec(k)?.[1]))
      .sort((a, b) => a - b)
      .map((id) => loadChapter(id)),
  )
  return chapters.flat()
}

/** 已装载的关卡（启动完成后可用）；未装载时为空数组 */
export function loadedLevels(): Level[] {
  return [...cache.values()]
    .flat()
    .sort((a, b) => a.chapter - b.chapter || levelOrder(a.id) - levelOrder(b.id))
}

function levelOrder(id: string): number {
  return Number(/-(\d+)$/.exec(id)?.[1] ?? 0)
}

export function levelById(id: string): Level | undefined {
  return loadedLevels().find((l) => l.id === id)
}
