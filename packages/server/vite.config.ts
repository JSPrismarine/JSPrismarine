import { defineConfig, mergeConfig } from 'vite';
import { globSync } from 'glob';

import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pkg from './package.json' assert { type: 'json' };
import { codecovVitePlugin } from '@codecov/vite-plugin';

import base from '../../vite.config';

const __dirname = dirname(fileURLToPath(import.meta.url));

const input = Object.fromEntries(
    globSync('./**/src/**/*.ts*', {
        ignore: ['**/*.d.ts', '**/coverage/**', '**/dist/**', '**/node_modules/**', '**/*.test.*']
    }).map((file) => {
        const filenameWithoutExt = file.slice(0, file.length - extname(file).length);

        return [relative('src', filenameWithoutExt), resolve(process.cwd(), file)];
    })
);

export default mergeConfig(
    base,
    defineConfig({
        root: __dirname,
        resolve: {
            alias: {
                '@/': resolve(__dirname, 'src/'),
                '@': resolve(__dirname, 'src/index.ts')
            }
        },
        build: {
            lib: {
                entry: input,
                formats: ['es', 'cjs'],
                fileName: (format, name) => `${name}.${format}.${format === 'es' ? 'js' : 'cjs'}`,
                name: pkg.name
            },
            rollupOptions: {
                external: [...Object.keys(pkg.dependencies)]
            }
        },
        plugins: [
            codecovVitePlugin({
                enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
                bundleName: pkg.name,
                uploadToken: process.env.CODECOV_TOKEN
            })
        ]
    })
);
