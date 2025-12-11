import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.d.ts'],
    format: ['esm'], // Server is an application, only needs ESM
    dts: true,
    sourcemap: 'inline',
    clean: true,
    target: 'esnext',
    outExtension() {
        return {
            js: '.es.js'
        };
    },
    esbuildOptions(options) {
        options.packages = 'external';
    }
});
