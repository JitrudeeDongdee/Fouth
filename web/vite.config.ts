import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // Relative paths so the site works under https://<user>.github.io/<repo>/.
  base: './',
  resolve: {
    alias: { 'billing-engine': resolve(__dirname, 'engine/billing-engine.mjs') },
  },
  test: {
    environment: 'node',
  },
})
