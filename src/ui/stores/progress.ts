import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { defaultProgressRepository } from '../../storage/progress'
import type { LevelRecord } from '../../game/types'

/** 进度仓库的响应式门面：记录变更即写穿 localStorage */
export const useProgressStore = defineStore('progress', () => {
  const repo = defaultProgressRepository()
  const records = reactive(new Map<string, LevelRecord>())
  for (const r of repo.all()) records.set(r.levelId, r)

  function recordOf(levelId: string): LevelRecord | null {
    return records.get(levelId) ?? null
  }

  function put(record: LevelRecord): void {
    repo.put(record)
    records.set(record.levelId, record)
  }

  function clearAll(): void {
    repo.clear()
    records.clear()
  }

  return { records, recordOf, put, clearAll }
})
