import { defineConfig } from 'vite';

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import dts from 'vite-plugin-dts';

import pkg from './package.json' with { type: 'json' };

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: __dirname,
    envDir: process.cwd(),
    resolve: {
        alias: [],
        tsconfigPaths: true
    },
    build: {
        copyPublicDir: false,
        emptyOutDir: !!process.env.CI,
        minify: false,
        outDir: 'dist',
        sourcemap: 'inline',
        target: 'esnext',
        rolldownOptions: {
            treeshake: true,
            external: [
                ...Object.keys(pkg.dependencies ?? {}),
                /^@jsprismarine/,
                /^node_modules/,
                /^node:.*/,
                'assert',
                'buffer',
                'child_process',
                'console',
                'constants',
                'crypto',
                'dns',
                'events',
                'fs',
                'fs/promises',
                'http',
                'http2',
                'https',
                'module',
                'net',
                'os',
                'path',
                'process',
                'querystring',
                'readline',
                'set-interval-async',
                'stream',
                'string_decoder',
                'timers/promises',
                'tls',
                'tty',
                'url',
                'util',
                'vm',
                'worker_threads',
                'zlib'
            ],
            output: {
                exports: 'named',
                preserveModules: true,
                strict: true
            }
        }
    },
    plugins: [
        dts({
            root: process.cwd(),
            clearPureImport: false,
            copyDtsFiles: true,
            entryRoot: `./src`,
            insertTypesEntry: true,
            tsconfigPath: `./tsconfig.json`
        })
    ]
});
