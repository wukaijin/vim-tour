import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './ui/styles/fonts.css'
import './ui/styles/tokens.css'
import App from './App.vue'

createApp(App).use(createPinia()).mount('#app')
