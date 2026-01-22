import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    emptyOutDir: true, // This will clean dist/ before building
    lib: {
      entry: 'src/zmodem.ts',
      formats: ['es', 'cjs'],
      fileName: (format) => `zmodem.${format === 'es' ? 'js' : 'cjs'}`
    },
    outDir: 'dist',
    rollupOptions: {
      output: [
        {
          format: 'es',
          entryFileNames: 'zmodem.js'
        },
        {
          format: 'cjs',
          entryFileNames: 'zmodem.cjs',
          exports: 'default'
        }
      ]
    }
  }
})
