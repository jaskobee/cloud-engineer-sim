import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// GitHub Pages serves the site from https://<user>.github.io/cloud-engineer-sim/
export default defineConfig({
  base: '/cloud-engineer-sim/',
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
