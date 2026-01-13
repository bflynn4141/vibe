import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    exclude: ['node_modules', 'dist'],
    globals: true,
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['api/**/*.js'],
      exclude: ['api/**/*.test.js', 'node_modules']
    }
  }
});
