import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000', // <-- METTI QUI LA PORTA DEL TUO BACKEND
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
