import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { hasNativeSources, nativeSourceHash } from './nativeHash';

const dirs: string[] = [];
afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A checkout's build inputs, each holding its own name. */
const checkout = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'jsp-script-host-hash-'));
    dirs.push(dir);
    for (const file of [
        'native/sources.json',
        'native/manifest.json',
        'native/src/engine.c',
        'scripts/build-native.mts',
        'src/absentGlobals.ts',
        'src/platform.ts'
    ]) {
        mkdirSync(dirname(join(dir, file)), { recursive: true });
        writeFileSync(join(dir, file), `${file}\n`);
    }
    return dir;
};

describe('nativeSourceHash', () => {
    it('changes with the C sources and with the TypeScript the build reads', () => {
        const dir = checkout();
        const before = nativeSourceHash(dir);
        for (const file of ['native/src/engine.c', 'src/absentGlobals.ts', 'src/platform.ts']) {
            writeFileSync(join(dir, file), 'changed\n');
            expect(nativeSourceHash(dir), file).not.toBe(before);
        }
    });

    it('ignores the manifest, which records the hash, and line endings', () => {
        const dir = checkout();
        const before = nativeSourceHash(dir);
        writeFileSync(join(dir, 'native/manifest.json'), '{"build": "0123456789abcdef"}\n');
        writeFileSync(join(dir, 'native/src/engine.c'), 'native/src/engine.c\r\n');
        expect(nativeSourceHash(dir)).toBe(before);
    });

    it('tells a checkout from a published package by its pinned sources', () => {
        const dir = checkout();
        expect(hasNativeSources(dir)).toBe(true);
        rmSync(join(dir, 'native/sources.json'));
        expect(hasNativeSources(dir)).toBe(false);
    });
});
