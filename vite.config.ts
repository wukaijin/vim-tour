import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // 相对路径：GitHub Pages 部署在子路径 /vim-tour/ 下，路由是 hash 模式，相对 base 两边通吃
  base: './',
  plugins: [vue()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
