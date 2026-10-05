import { ForgeError } from './providers/types'
import type { StorageLike } from '../storage/progress'

/**
 * API key 保管（PLAN §14.6）：
 * - 默认仅内存：关页即忘，永不落盘；
 * - 可选「记住」= 用户口令 PBKDF2 派生 → AES-GCM 密文落 localStorage，派生密钥不落盘；
 * - 非安全上下文（无 crypto.subtle）无法加密：调用方据 canRemember() 降级为仅会话并明示原因。
 * 威胁模型：防本机顺手翻看与备份泄露；防不了 XSS / 恶意扩展（页面运行时必然持有明文）。
 */
export const KEYRING_STORAGE_KEY = 'vim-tour:keyring'
const PBKDF2_ITERATIONS = 210_000
const SALT_BYTES = 16
const IV_BYTES = 12

interface KeyringBlob {
  v: 1
  iter: number
  salt: string
  iv: string
  ct: string
}

export interface KeyCustody {
  /** 当前会话可用的 key（内存），未解锁为 null */
  current(): string | null
  /**
   * 设置本次会话 key。remember=true 时需要 passphrase（≥6 位）并加密落盘；
   * remember=false 时清除已存密文（用户的最近一次选择说了算）。
   */
  set(key: string, opts?: { remember?: boolean; passphrase?: string }): Promise<void>
  /** 用口令解锁已存密文到内存；失败（口令错/数据坏）返回 false 且保留密文 */
  unlock(passphrase: string): Promise<boolean>
  hasStored(): boolean
  /** 清掉内存（保留已存密文） */
  lock(): void
  /** 内存与密文一起清 */
  clear(): void
  canRemember(): boolean
}

export interface KeyCustodyDeps {
  /** 注入 null 可模拟非安全上下文（测试/降级路径） */
  subtle?: SubtleCrypto | null
  randomBytes?: (n: number) => Uint8Array
}

export function createKeyCustody(storage: StorageLike, deps: KeyCustodyDeps = {}): KeyCustody {
  const subtle = deps.subtle !== undefined ? deps.subtle : typeof crypto !== 'undefined' ? crypto.subtle : null
  const randomBytes = deps.randomBytes ?? ((n: number) => crypto.getRandomValues(new Uint8Array(n)))
  let memory: string | null = null

  function readBlob(): KeyringBlob | null {
    let raw: string | null = null
    try {
      raw = storage.getItem(KEYRING_STORAGE_KEY)
    } catch {
      raw = null
    }
    if (!raw) return null
    try {
      const b = JSON.parse(raw) as KeyringBlob
      if (
        b?.v === 1 &&
        typeof b.iter === 'number' &&
        typeof b.salt === 'string' &&
        typeof b.iv === 'string' &&
        typeof b.ct === 'string'
      ) {
        return b
      }
    } catch {
      // 损坏视为未存
    }
    return null
  }

  async function derive(passphrase: string, salt: Uint8Array, iter: number, usage: KeyUsage[]): Promise<CryptoKey> {
    const s = subtle as SubtleCrypto
    const base = await s.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
    return s.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, usage)
  }

  return {
    current: () => memory,
    canRemember: () => subtle !== null && subtle !== undefined,
    hasStored: () => readBlob() !== null,
    lock: () => {
      memory = null
    },
    clear: () => {
      memory = null
      try {
        storage.removeItem(KEYRING_STORAGE_KEY)
      } catch {
        // 存储不可用：静默
      }
    },
    async set(key, opts = {}) {
      const k = key.trim()
      if (!k) throw new ForgeError('config', 'key 为空')
      if (!opts.remember) {
        memory = k
        try {
          storage.removeItem(KEYRING_STORAGE_KEY)
        } catch {
          // 静默
        }
        return
      }
      const passphrase = opts.passphrase ?? ''
      if (passphrase.length < 6) throw new ForgeError('config', '口令至少 6 位')
      const s = subtle
      if (!s) throw new ForgeError('no-webcrypto', 'crypto.subtle 不可用')
      const salt = randomBytes(SALT_BYTES)
      const iv = randomBytes(IV_BYTES)
      const aes = await derive(passphrase, salt, PBKDF2_ITERATIONS, ['encrypt'])
      const ct = new Uint8Array(await s.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(k)))
      const blob: KeyringBlob = { v: 1, iter: PBKDF2_ITERATIONS, salt: b64(salt), iv: b64(iv), ct: b64(ct) }
      memory = k
      try {
        storage.setItem(KEYRING_STORAGE_KEY, JSON.stringify(blob))
      } catch {
        throw new ForgeError('config', '本机存储不可用，无法记住 key')
      }
    },
    async unlock(passphrase) {
      const blob = readBlob()
      const s = subtle
      if (!blob || !s) return false
      try {
        const aes = await derive(passphrase, unb64(blob.salt), blob.iter, ['decrypt'])
        const pt = await s.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, aes, unb64(blob.ct))
        memory = new TextDecoder().decode(pt)
        return true
      } catch {
        // 口令错或密文损坏：保留密文，让用户重试
        return false
      }
    },
  }
}

function b64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function unb64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
