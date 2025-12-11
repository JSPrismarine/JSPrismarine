import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.d.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: 'inline',
    clean: true,
    target: 'esnext',
    outExtension({ format }) {
        return {
            js: format === 'esm' ? '.es.js' : '.cjs.cjs'
        };
    },
    esbuildOptions(options) {
        options.packages = 'external';
    }
});
