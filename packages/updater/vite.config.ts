import { globSync } from 'glob';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, createLogger, mergeConfig } from 'vite';
import pkg from './package.json' assert { type: 'json' };

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

const logger = createLogger(undefined, { prefix: pkg.name });
logger.info(JSON.stringify({ __dirname, input }, null, 4));

export default mergeConfig(
    base,
    defineConfig({
        root: __dirname,
        resolve: {
            alias: {
                '@': resolve(__dirname, 'src/index.ts'),
                '@/': resolve(__dirname, 'src/')
            }
        },
        build: {
            lib: {
                entry: input,
                formats: ['es', 'cjs'],
                fileName: (format, name) => `${name}.${format}.js`,
                name: pkg.name
            },
            rollupOptions: {
                external: [...Object.keys(pkg.dependencies)]
            }
        }
    })
);
