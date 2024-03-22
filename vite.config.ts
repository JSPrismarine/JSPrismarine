import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import pkg from './package.json' assert { type: 'json' };

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: __dirname,
    ssr: { noExternal: true },
    build: {
        copyPublicDir: false,
        emptyOutDir: true,
        minify: false,
        outDir: 'dist',
        sourcemap: 'inline',
        target: 'esnext',
        rollupOptions: {
            treeshake: 'smallest',
            external: [
                ...Object.keys(pkg.dependencies),
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
                'stream',
                'string_decoder',
                'timers/promises',
                'tls',
                'tty',
                'url',
                'util',
                'vm',
                'worker_threads',
                'zlib',
                /^@jsprismarine/
            ],
            output: {
                exports: 'named',
                hoistTransitiveImports: true,
                indent: false,
                interop: 'auto',
                strict: true
            }
        }
    },
    plugins: [
        dts({
            clearPureImport: false,
            copyDtsFiles: true,
            entryRoot: `./src`,
            insertTypesEntry: true,
            rollupTypes: false,
            tsconfigPath: `./tsconfig.json`,
            include: ['**/src']
        })
    ]
});
