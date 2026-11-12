import { dirname, join, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { nativeBuildDir } from './nativeHash';

const cacheDir = join('/work', 'JSPrismarine', 'node_modules', '.cache', 'jsprismarine', 'native-network');
const build = { cacheDir, treeKey: '8c459bc2b75e72cd', platform: 'darwin-arm64', tls: 'mbedtls', debug: false };

describe('nativeBuildDir', () => {
    it('gives two checkouts of the same sources separate build directories in the shared cache', () => {
        const primary = nativeBuildDir({
            ...build,
            nativeDir: join('/work', 'JSPrismarine', 'packages', 'native-network', 'native')
        });
        const worktree = nativeBuildDir({
            ...build,
            nativeDir: join('/work', 'worktrees', 'feature', 'packages', 'native-network', 'native')
        });
        expect(primary).not.toBe(worktree);
        expect(dirname(primary)).toBe(cacheDir);
        expect(dirname(worktree)).toBe(cacheDir);
    });

    it('gives a checkout the same build directory however its path is spelled', () => {
        const nativeDir = join('/work', 'JSPrismarine', 'packages', 'native-network', 'native');
        expect(nativeBuildDir({ ...build, nativeDir: `${nativeDir}${sep}..${sep}native` })).toBe(
            nativeBuildDir({ ...build, nativeDir })
        );
    });

    it('separates debug builds from release builds', () => {
        const nativeDir = join('/work', 'JSPrismarine', 'packages', 'native-network', 'native');
        expect(nativeBuildDir({ ...build, nativeDir, debug: true })).not.toBe(nativeBuildDir({ ...build, nativeDir }));
    });
});
