import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      GEMINI_API_KEY: 'test-key-for-testing-only',
      WORKSPACE_ROOT: process.env.HOME || '/home/dp',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});

