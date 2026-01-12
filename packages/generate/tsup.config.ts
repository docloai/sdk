import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'configs/index': 'src/configs/index.ts'
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  external: [
    '@doclo/core',
    '@doclo/schemas'
  ],
});
