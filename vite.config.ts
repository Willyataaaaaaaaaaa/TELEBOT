import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'لوحة تحكم البوت',
          short_name: 'الإدارة',
          description: 'تطبيق لوحة تحكم البوت لمعالجة الطلبات.',
          theme_color: '#110c1c',
          background_color: '#110c1c',
          display: 'standalone',
          icons: [
            {
              src: 'https://ui-avatars.com/api/?name=Admin&background=a855f7&color=fff&size=192',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'https://ui-avatars.com/api/?name=Admin&background=a855f7&color=fff&size=512',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        }
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
