import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    validation: 'src/validation.ts',
    'security/index': 'src/security/index.ts',
    'observability/index': 'src/observability/index.ts',
    'internal/validation-utils': 'src/internal/validation-utils.ts',
    'runtime/crypto': 'src/runtime/crypto.ts',
    'runtime/base64': 'src/runtime/base64.ts',
    'runtime/env': 'src/runtime/env.ts',
    'pdf-utils': 'src/pdf-utils.ts'
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false, // Prevent shared chunks to avoid fs imports in validation.js
  external: [
    '@doclo/providers-llm',
    '@doclo/providers-datalab',
    'fs', // Mark fs as external for browser-safe validation
  ],
});
