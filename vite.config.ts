import { defineConfig } from 'vite';

const bridge = `http://127.0.0.1:${process.env.BRIDGE_PORT ?? 8787}`;

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/health': bridge,
      '/tts': bridge,
      '/ws': { target: bridge, ws: true },
    },
  },
});
