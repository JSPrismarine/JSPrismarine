import { globSync } from 'glob';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { codecovVitePlugin } from '@codecov/vite-plugin';
import { defineConfig, mergeConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

import base from '../../vite.config.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const input = Object.fromEntries(
    globSync('./**/src/**/*.{ts*,json}', {
        ignore: [
            '**/*.d.ts',
            '**/coverage/**',
            '**/dist/**',
            '**/node_modules/**',
            '**/*.test.*',
            // The Script API tables of `dump:bedrock`, which generators in other packages read
            // and nothing here exports. Each would otherwise be a bundle of its own.
            '**/src/jsp/*/bedrock/**'
        ]
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
            alias: []
        },
        build: {
            lib: {
                entry: input,
                formats: ['es'],
                fileName: (_format, name) => `${name}.js`,
                name: pkg.name
            },
            rollupOptions: {
                external: [...Object.keys(pkg.dependencies ?? {})]
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
