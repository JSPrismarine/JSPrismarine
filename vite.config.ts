import { defineConfig } from 'vite';

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { codecovVitePlugin } from '@codecov/vite-plugin';
import dts from 'vite-plugin-dts';
import tsconfigPaths from 'vite-tsconfig-paths';

import pkg from './package.json' assert { type: 'json' };

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: __dirname,
    resolve: {
        alias: [
            // Resolve @jsprismarine/* imports.
            {
                find: /^@jsprismarine\/(?!jsbinaryutils|bedrock-data)(.+)/,
                replacement: `${resolve(__dirname, '/packages/')}/$1/src/index.ts`
            }
        ]
    },
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
                hoistTransitiveImports: true,
                indent: false,
                interop: 'auto',
                strict: true
            }
        }
    },
    plugins: [
        tsconfigPaths({
            root: process.cwd()
        }),
        dts({
            clearPureImport: false,
            copyDtsFiles: true,
            entryRoot: `./src`,
            insertTypesEntry: true,
            rollupTypes: false,
            tsconfigPath: `./tsconfig.json`,
            include: ['**/src']
        }),
        codecovVitePlugin({
            enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
            bundleName: 'JSPrismarine',
            uploadToken: process.env.CODECOV_TOKEN
        })
    ]
});
