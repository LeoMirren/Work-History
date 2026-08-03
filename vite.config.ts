import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Streaming integration tests mesh hundreds of chunks incl. light BFS.
    testTimeout: 60000,
  },
});
