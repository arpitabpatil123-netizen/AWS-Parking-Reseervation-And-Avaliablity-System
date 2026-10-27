import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import react from '@astrojs/react';

export default defineConfig({
  integrations: [tailwind(), react()],
  output: 'static',
  server: {
    port: 4321,
    host: true,
  },
  vite: {
    server: {
      cors: true,
    },
  },
});
