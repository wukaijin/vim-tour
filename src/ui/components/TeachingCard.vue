<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { parseKeys } from '../../engine'
import type { CommandMeta } from '../../content/commands'
import Keycap from './Keycap.vue'

/** 关前教学卡（PLAN §6）：新命令 + 示例，可跳过；Esc/Enter/点击关闭 */
const props = defineProps<{
  title: string
  teaches: CommandMeta[]
}>()
const emit = defineEmits<{ close: [] }>()
const goBtn = ref<HTMLButtonElement | null>(null)

onMounted(() => goBtn.value?.focus())

const rows = computed(() =>
  props.teaches.map((c) => ({
    ...c,
    keyList: c.keys.split(/\s+/),
    exampleKeys: parseKeys(c.example.keys),
  })),
)
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <section class="card" role="dialog" aria-modal="true" aria-label="新命令教学卡">
      <header class="card-head">
        <h2>新命令</h2>
        <span class="lv">{{ title }}</span>
      </header>
      <ul class="cmds">
        <li v-for="c in rows" :key="c.id" class="cmd">
          <span class="keys">
            <Keycap v-for="(k, i) in c.keys.split(/\s+/)" :key="i" :label="k" size="md" tone="brand" />
          </span>
          <span class="desc">{{ c.desc }}</span>
          <span class="example mono">
            <Keycap v-for="(k, i) in c.exampleKeys" :key="i" :label="k === ' ' ? '␣' : k" size="xs" />
            <span class="effect">→ {{ c.example.effect }}</span>
          </span>
        </li>
      </ul>
      <footer class="card-foot">
        <button ref="goBtn" class="go" @click="emit('close')">开始练习</button>
        <span class="esc-tip mono">Esc 跳过</span>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.overlay {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--paper) 60%, transparent);
  padding: var(--sp-6);
}

.card {
  background: var(--surface);
  border: 1px solid var(--edge);
  border-radius: var(--r-card);
  box-shadow: var(--shadow-2);
  max-width: 560px;
  width: 100%;
  padding: var(--sp-6);
}

.card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--sp-4);
}

.lv {
  font-size: var(--fs-sm);
  color: var(--ink-2);
}

.cmds {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}

.cmd {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--sp-1) var(--sp-3);
}

.keys {
  display: inline-flex;
  gap: 4px;
  grid-row: span 2;
  align-items: flex-start;
}

.desc {
  font-size: var(--fs-base);
}

.example {
  grid-column: 2;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: var(--fs-xs);
  color: var(--ink-2);
  flex-wrap: wrap;
}

.example-mono {
  letter-spacing: 0.05em;
}

.effect {
  margin-left: var(--sp-1);
}

.card-foot {
  margin-top: var(--sp-6);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.go {
  height: 56px;
  padding: 0 var(--sp-8);
  border-radius: var(--r-input);
  border: 1px solid var(--edge);
  background: var(--brand);
  color: #fff;
  font-weight: 700;
  font-size: var(--fs-lg);
  box-shadow: 0 4px 0 var(--brand-ink);
  transition: transform var(--dur-fast) var(--ease-out);
}

.go:hover {
  filter: brightness(1.05);
}

.go:active {
  transform: translateY(2px);
  box-shadow: 0 2px 0 var(--brand-ink);
}

.esc-tip {
  font-size: var(--fs-xs);
  color: var(--ink-2);
}
</style>
