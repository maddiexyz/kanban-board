import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            // Suppress harmless socket abort errors when the browser reloads or closes the tab
            if (
              (err as any).code === 'ECONNABORTED' ||
              (err as any).code === 'ECONNRESET' ||
              err.message.includes('ECONNABORTED') ||
              err.message.includes('ECONNRESET')
            ) {
              return;
            }
            console.error('[vite ws proxy error]', err);
          });
        },
      },
    },
  },
})
