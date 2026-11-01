import { codecovVitePlugin } from '@codecov/vite-plugin';
import { globSync } from 'glob';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vite';
import base from '../../vite.config.ts';
import pkg from './package.json' with { type: 'json' };

const __dirname = dirname(fileURLToPath(import.meta.url));

const input = Object.fromEntries(
    globSync('./**/src/**/*.{ts*,json}', {
        ignore: ['**/*.d.ts', '**/coverage/**', '**/dist/**', '**/node_modules/**', '**/*.test.*']
    }).map((file) => {
        const filenameWithoutExt = file.slice(0, file.length - extname(file).length);

        return [relative('src', filenameWithoutExt), resolve(process.cwd(), file)];
    })
);

/**
 * The packages the build leaves as imports rather than bundling: each name
 * on its own, and a pattern for its subpaths, because the mcdoc validator
 * imports `@spyglassmc/java-edition` modules the package root does not
 * re-export.
 */
const bare = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})];
const external = [...bare, ...bare.map((name) => new RegExp(`^${name.replaceAll(/[.*+?^$\\{}()|[\]]/g, '\\$&')}/`))];

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
                fileName: (format, name) => `${name}.${format}.js`,
                name: pkg.name
            },
            rollupOptions: {
                // The peers are the optional `@spyglassmc` packages the
                // mcdoc validator imports; a consumer that does not install
                // them never loads that entry point.
                external
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
