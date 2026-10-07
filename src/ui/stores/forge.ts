import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'
import { solve } from '../../engine/solver'
import { generateSandboxLevel } from '../../forge/generate'
import { createKeyCustody } from '../../forge/keys'
import { verifySandboxLevel } from '../../forge/level'
import { createDemoProvider, DEMO_MODEL, DEMO_PARAMS } from '../../forge/providers/demo'
import { createOpenAIProvider } from '../../forge/providers/openai'
import { ForgeError, forgeErrorText } from '../../forge/providers/types'
import type { ChatDeltaEvent, ForgeProvider } from '../../forge/providers/types'
import { DEFAULT_FORGE_PARAMS, rollTier } from '../../forge/types'
import type { ForgeParams, ProviderKind, SandboxLevel } from '../../forge/types'
import { detectStorage } from '../../storage/progress'
import { loadForgeSettings, saveForgeSettings } from '../../storage/forge-settings'
import type { ForgeSettings, ForgeSettingsParams } from '../../storage/forge-settings'
import { defaultSandboxRepository, parseSandboxExport, serializeSandboxExport, withFreshIds } from '../../storage/sandbox'

/** 关卡工坊状态（PLAN §14）：生成台 / 沙盒库 / 模型与 key —— 与正篇进度零交集 */
export const useForgeStore = defineStore('forge', () => {
  const repo = defaultSandboxRepository()
  const storage = detectStorage()
  const custody = createKeyCustody(storage)

  // 默认落在离线演示 fixture 的档位（第 3 章 / 标准）：打开就能生成
  const defaults: ForgeSettings = {
    providerKind: 'demo',
    baseUrl: 'http://localhost:11434/v1',
    model: '',
    maxTokens: 65_536,
    params: { ...DEFAULT_FORGE_PARAMS, ...DEMO_PARAMS },
  }
  // 重载不丢设置：服务/地址/模型名与生成旋钮都从本机设置恢复（非机密，透明存）
  const initial = loadForgeSettings(storage, defaults)
  const params = reactive<ForgeSettingsParams>({ ...initial.params })
  const providerKind = ref<ProviderKind>(initial.providerKind)
  const baseUrl = ref(initial.baseUrl)
  const model = ref(initial.model)
  const maxTokens = ref(initial.maxTokens)
  if (providerKind.value === 'demo') {
    // 演示 provider 是固定 fixture，档位必须对齐（见下方 watch 同理）
    params.tier = DEMO_PARAMS.tier
    params.difficulty = DEMO_PARAMS.difficulty
  }
  const keyInput = ref('')
  const rememberKey = ref(false)
  const passphrase = ref('')
  const keyStored = ref(custody.hasStored())
  const keyUnlocked = ref(custody.current() !== null)
  const canRemember = custody.canRemember()

  const library = ref<SandboxLevel[]>(repo.all())
  const running = ref(false)
  const attempt = ref(0)
  const maxAttempts = ref(3)
  const errorText = ref<string | null>(null)
  const notice = ref<string | null>(null)
  const usageText = ref<string | null>(null)
  // 流式进度（PLAN §14.7）：phase/字数给状态行，原文给剧透折叠块（封顶防长思考撑爆内存渲染）
  const streamPhase = ref<'idle' | 'thinking' | 'output'>('idle')
  const streamCount = reactive({ thinking: 0, output: 0 })
  const streamRaw = reactive({ thinking: '', output: '' })
  const STREAM_RAW_CAP = 20_000
  let controller: AbortController | null = null
  let noticeTimer: ReturnType<typeof setTimeout> | null = null

  // 切回离线演示时对齐档位，避免「演示 fixture 与旋钮档位不匹配」被闸门拒绝
  watch(providerKind, (kind) => {
    if (kind === 'demo') {
      params.tier = DEMO_PARAMS.tier
      params.difficulty = DEMO_PARAMS.difficulty
    }
  })

  // 设置变更即落盘（非机密项；key 的保管在 custody 里另走）
  watch(
    [providerKind, baseUrl, model, maxTokens, () => ({ ...params })],
    () => {
      saveForgeSettings(storage, {
        providerKind: providerKind.value,
        baseUrl: baseUrl.value,
        model: model.value,
        maxTokens: maxTokens.value,
        params: { ...params },
      })
    },
    { deep: true },
  )

  /** 离开/重进工坊时清掉过期提示，避免语境脱节（对局往返后仍显示「已入库」） */
  function dismissNotice(): void {
    notice.value = null
    if (noticeTimer) clearTimeout(noticeTimer)
  }

  function refreshLibrary(): void {
    library.value = repo.all()
  }

  function flash(text: string): void {
    notice.value = text
    if (noticeTimer) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => (notice.value = null), 3200)
  }

  function buildProvider(): ForgeProvider {
    // 演示 provider 先喂一次坏数据：让「回喂重试」链路在演示与走查里被真实走一遍
    if (providerKind.value === 'demo') return createDemoProvider({ failFirst: true })
    if (!model.value.trim()) throw new ForgeError('config', '未填写模型名')
    if (keyStored.value && custody.current() === null) throw new ForgeError('auth', '已保存的 key 尚未解锁')
    return createOpenAIProvider({
      baseUrl: baseUrl.value,
      model: model.value,
      apiKey: custody.current() ?? undefined,
      maxTokens: maxTokens.value,
    })
  }

  function pushDelta(d: ChatDeltaEvent): void {
    streamPhase.value = d.kind
    streamCount[d.kind] += d.text.length
    let merged = streamRaw[d.kind] + d.text
    if (merged.length > STREAM_RAW_CAP) merged = '…' + merged.slice(merged.length - STREAM_RAW_CAP + 1)
    streamRaw[d.kind] = merged
  }

  /** 生成 → 闸门 → 入库（PLAN §14.2/§14.7：可见重试、可取消、失败分类文案） */
  async function generate(): Promise<void> {
    if (running.value) return
    errorText.value = null
    notice.value = null
    usageText.value = null
    streamPhase.value = 'idle'
    streamCount.thinking = 0
    streamCount.output = 0
    streamRaw.thinking = ''
    streamRaw.output = ''
    let provider: ForgeProvider
    try {
      provider = buildProvider()
    } catch (e) {
      errorText.value = forgeErrorText(e)
      return
    }
    // onDelta 在这里注入（而非穿 generateSandboxLevel）：生成编排仍只认「完整文本」，
    // 流式展示纯属 UI 关切；演示 provider 也因此能模拟流式
    const wrapped: ForgeProvider = {
      id: provider.id,
      label: provider.label,
      chat: async (messages, opts) => {
        const r = await provider.chat(messages, { ...opts, onDelta: pushDelta })
        if (r.usage) {
          usageText.value = `本次调用 tokens：输入 ${r.usage.promptTokens ?? '—'} / 输出 ${r.usage.completionTokens ?? '—'}`
        }
        return r
      },
    }
    controller = new AbortController()
    running.value = true
    attempt.value = 0
    try {
      // 「随机」档进入生成链路前解析成具体章：核心层不见哨兵值，抽中的章进 provenance
      const resolved: ForgeParams = { ...params, tier: rollTier(params.tier) }
      const out = await generateSandboxLevel({
        provider: wrapped,
        model: providerKind.value === 'demo' ? DEMO_MODEL : model.value,
        params: resolved,
        solve,
        makeId: () => `sbx-${crypto.randomUUID()}`,
        now: () => Date.now(),
        signal: controller.signal,
        onAttempt: (n, m) => {
          attempt.value = n
          maxAttempts.value = m
        },
      })
      if (out.ok) {
        if (!repo.put(out.level)) {
          errorText.value = '生成结果不合法，已丢弃'
          return
        }
        refreshLibrary()
        flash(out.attempts > 1 ? `第 ${out.attempts} 次尝试生成成功，已入库` : '生成成功，已入库')
      } else if (out.kind === 'provider') {
        errorText.value = forgeErrorText(out.error)
      } else {
        errorText.value = `${out.attempts} 次尝试都没能生成合格关卡：${out.reason}`
      }
    } finally {
      running.value = false
      controller = null
    }
  }

  function cancel(): void {
    controller?.abort()
  }

  function removeLevel(id: string): void {
    if (repo.remove(id)) refreshLibrary()
  }

  function clearLibrary(): void {
    repo.clear()
    refreshLibrary()
  }

  // ---------- 模型与 key（PLAN §14.6） ----------

  async function saveKey(): Promise<void> {
    errorText.value = null
    try {
      await custody.set(keyInput.value, rememberKey.value ? { remember: true, passphrase: passphrase.value } : undefined)
      keyInput.value = ''
      passphrase.value = ''
      keyStored.value = custody.hasStored()
      keyUnlocked.value = custody.current() !== null
      flash(rememberKey.value ? 'key 已用口令加密保存在本机' : 'key 只保存在本次会话')
    } catch (e) {
      errorText.value = forgeErrorText(e)
    }
  }

  async function unlockKey(): Promise<void> {
    errorText.value = null
    const ok = await custody.unlock(passphrase.value)
    passphrase.value = ''
    keyUnlocked.value = ok
    if (ok) flash('key 已解锁')
    else errorText.value = '口令不对，或密文已损坏'
  }

  function forgetKey(): void {
    custody.clear()
    keyStored.value = false
    keyUnlocked.value = false
    flash('已清除 key 与密文')
  }

  // ---------- 导出 / 导入（PLAN §14.4：导入即不可信） ----------

  function exportLibrary(): void {
    const text = serializeSandboxExport(library.value, { exportedAt: Date.now() })
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'vim-tour-sandbox.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function importLibrary(text: string): void {
    errorText.value = null
    const parsed = parseSandboxExport(text)
    if (!parsed.ok) {
      errorText.value = `导入失败：${parsed.reason}`
      return
    }
    const accepted: SandboxLevel[] = []
    let rejected = parsed.skipped
    for (const level of withFreshIds(parsed.levels, () => `sbx-${crypto.randomUUID()}`)) {
      const v = verifySandboxLevel(level, solve)
      if (v.ok) accepted.push(v.level)
      else rejected += 1
    }
    if (accepted.length === 0) {
      errorText.value = `导入失败：${rejected} 个关卡都没通过校验`
      return
    }
    for (const l of accepted) repo.put(l)
    refreshLibrary()
    flash(`导入 ${accepted.length} 关${rejected > 0 ? `，丢弃 ${rejected} 关` : ''}`)
  }

  return {
    params,
    providerKind,
    baseUrl,
    model,
    maxTokens,
    keyInput,
    rememberKey,
    passphrase,
    keyStored,
    keyUnlocked,
    canRemember,
    library,
    running,
    attempt,
    maxAttempts,
    errorText,
    notice,
    usageText,
    streamPhase,
    streamCount,
    streamRaw,
    refreshLibrary,
    dismissNotice,
    generate,
    cancel,
    removeLevel,
    clearLibrary,
    saveKey,
    unlockKey,
    forgetKey,
    exportLibrary,
    importLibrary,
  }
})
