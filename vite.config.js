import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    // jsdom gives component tests a DOM to mount into. This is needed to create 
    // the DOM elements so we can run more in-depth tests
    environment: 'jsdom',
  },
})
