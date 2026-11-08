import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** Pruebas de componentes (jsdom). Las pruebas de adaptadores siguen en `node --test`. */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['test/ui/**/*.test.tsx'],
    setupFiles: ['test/ui/setup.ts'],
    restoreMocks: true,
  },
});
