import { describe, expect, it } from 'vitest'
import { createKeyCustody, KEYRING_STORAGE_KEY } from '../keys'
import { ForgeError } from '../providers/types'
import type { StorageLike } from '../../storage/progress'

function memStorage(): StorageLike & { dump(): Map<string, string> } {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    dump: () => m,
  }
}

describe('createKeyCustody（PLAN §14.6）', () => {
  it('默认仅内存：不落盘，关页即忘', async () => {
    const storage = memStorage()
    const custody = createKeyCustody(storage)
    await custody.set('sk-secret')
    expect(custody.current()).toBe('sk-secret')
    expect(custody.hasStored()).toBe(false)
    expect(storage.dump().has(KEYRING_STORAGE_KEY)).toBe(false)
    custody.lock()
    expect(custody.current()).toBeNull()
  })

  it('记住：口令派生加密落盘，密文不含明文；解锁回内存', async () => {
    const storage = memStorage()
    const custody = createKeyCustody(storage)
    expect(custody.canRemember()).toBe(true)
    await custody.set('sk-secret-123', { remember: true, passphrase: 'correct horse' })
    const blob = storage.dump().get(KEYRING_STORAGE_KEY)
    expect(blob).toBeTruthy()
    expect(blob).not.toContain('sk-secret-123')

    custody.lock()
    expect(custody.current()).toBeNull()
    expect(custody.hasStored()).toBe(true)

    expect(await custody.unlock('wrong pass')).toBe(false)
    expect(custody.current()).toBeNull()
    expect(custody.hasStored()).toBe(true) // 口令错不毁密文

    expect(await custody.unlock('correct horse')).toBe(true)
    expect(custody.current()).toBe('sk-secret-123')
  })

  it('选择不记住时清除已存密文（最近一次选择说了算）', async () => {
    const storage = memStorage()
    const custody = createKeyCustody(storage)
    await custody.set('sk-a', { remember: true, passphrase: 'pw123456' })
    expect(custody.hasStored()).toBe(true)
    await custody.set('sk-b')
    expect(custody.hasStored()).toBe(false)
    expect(custody.current()).toBe('sk-b')
  })

  it('无 crypto.subtle：canRemember=false，加密请求明确报错、会话内存可用', async () => {
    const storage = memStorage()
    const custody = createKeyCustody(storage, { subtle: null })
    expect(custody.canRemember()).toBe(false)
    await expect(custody.set('sk-1', { remember: true, passphrase: 'pw123456' })).rejects.toMatchObject({
      kind: 'no-webcrypto',
    })
    await custody.set('sk-1')
    expect(custody.current()).toBe('sk-1')
  })

  it('口令太短 / key 为空 → config 错误', async () => {
    const custody = createKeyCustody(memStorage())
    await expect(custody.set('sk-1', { remember: true, passphrase: '123' })).rejects.toMatchObject({ kind: 'config' })
    await expect(custody.set('   ')).rejects.toMatchObject({ kind: 'config' })
    expect(ForgeError).toBeTruthy()
  })

  it('clear：内存与密文一起清', async () => {
    const storage = memStorage()
    const custody = createKeyCustody(storage)
    await custody.set('sk-x', { remember: true, passphrase: 'pw123456' })
    custody.clear()
    expect(custody.current()).toBeNull()
    expect(custody.hasStored()).toBe(false)
    expect(storage.dump().has(KEYRING_STORAGE_KEY)).toBe(false)
  })
})
