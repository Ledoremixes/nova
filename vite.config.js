import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { novaDevApiPlugin } from './server/viteApiPlugin.js'

export default defineConfig(({ mode }) => {
  // Vite espone al browser solo le variabili VITE_*. Le chiavi service-role vengono
  // caricate qui esclusivamente per le API locali usate da `npm run dev`.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), novaDevApiPlugin(env)],
  }
})
