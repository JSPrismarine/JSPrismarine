import { globSync } from 'glob';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, mergeConfig } from 'vite';
import base from '../../vite.config.ts';
import pkg from './package.json' with { type: 'json' };

const __dirname = dirname(fileURLToPath(import.meta.url));

const files = globSync('./**/src/**/*.{ts*,json}', {
    cwd: __dirname,
    ignore: ['**/*.d.ts', '**/coverage/**', '**/dist/**', '**/node_modules/**', '**/*.test.*']
});
const withoutExt = (file: string) => file.slice(0, file.length - extname(file).length);
// A JSON file beside a module of the same name is that module's data, bundled into it. As an entry
// of its own it would take the module's output name and replace the module in `dist`.
const modules = new Set(files.filter((file) => extname(file) !== '.json').map(withoutExt));

const input = Object.fromEntries(
    files
        .filter((file) => extname(file) !== '.json' || !modules.has(withoutExt(file)))
        .map((file) => [relative('src', withoutExt(file)), resolve(__dirname, file)])
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
        }
    })
);
