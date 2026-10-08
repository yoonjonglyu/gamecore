import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    // vitest가 TypeScript 소스를 직접 해석하도록
    extensions: ['.ts', '.js'],
  },
});
