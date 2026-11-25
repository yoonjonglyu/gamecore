import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'react/index': 'src/react/index.ts',
    'core/index': 'src/entries/core.ts',
    'combat/index': 'src/entries/combat.ts',
    'spatial/index': 'src/entries/spatial.ts',
    'serialization/index': 'src/entries/serialization.ts',
    'ai/index': 'src/entries/ai.ts',
    'data/index': 'src/entries/data.ts',
  },
  format: ['esm', 'cjs'],
  dts: false,
  clean: true,
  sourcemap: false,
  treeshake: true,
  splitting: true,
  external: ['react'],
});
