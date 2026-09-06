import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {prerenderFallback} from './src/prerenderFallback';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), prerenderFallback()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // 本地开发时把 /api 转发到配额服务（bun run dev 前先启动: QUOTA_DB=./data/usage.json node server.js）
      proxy: {
        '/api': 'http://127.0.0.1:3990',
      },
    },
  };
});
