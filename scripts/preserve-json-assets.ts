import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Leaves selected JSON imports external and copies their files into the package's `dist` directory.
 *
 * @param packageRoot - The package directory containing `src` and `dist`.
 * @param files - JSON file paths relative to the package's `src` directory.
 */
export const preserveJsonAssets = (packageRoot: string, files: readonly string[]): Plugin => {
    const sourceRoot = resolve(packageRoot, 'src');

    return {
        name: 'preserve-json-assets',
        enforce: 'pre',
        resolveId(source, importer) {
            if (importer === undefined) return;

            const resolved = resolve(dirname(importer), source);
            if (!files.includes(relative(sourceRoot, resolved))) return;

            return { id: resolved, external: 'relative' };
        },
        closeBundle() {
            for (const file of files) {
                const source = resolve(sourceRoot, file);
                const target = resolve(packageRoot, 'dist', file);
                mkdirSync(dirname(target), { recursive: true });
                copyFileSync(source, target);
            }
        }
    };
};
