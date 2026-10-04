import type { StorageLike } from './progress'

/** UI 层杂项标记（教学卡已读、热身收起等），与进度 envelope 分开存放 */
const CARDS_SEEN_KEY = 'vim-tour:cards-seen'

function readJson(storage: StorageLike, key: string): unknown {
  try {
    return JSON.parse(storage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

export function seenCard(storage: StorageLike, levelId: string): boolean {
  const v = readJson(storage, CARDS_SEEN_KEY)
  return Array.isArray(v) && v.includes(levelId)
}

export function markCardSeen(storage: StorageLike, levelId: string): void {
  const v = readJson(storage, CARDS_SEEN_KEY)
  const list = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  if (!list.includes(levelId)) list.push(levelId)
  try {
    storage.setItem(CARDS_SEEN_KEY, JSON.stringify(list))
  } catch {
    // 存储不可用：本次会话内仍可由内存缓存兜底（调用方自行处理）
  }
}
