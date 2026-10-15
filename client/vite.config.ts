import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // In development the API runs separately; proxying keeps everything same-origin, exactly like production,
    // so the session cookie and the event stream behave the same way.
    proxy: { '/api': 'http://localhost:4000' },
  },
});
