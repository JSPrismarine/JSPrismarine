import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { hasNativeSources, nativeSourceHash } from './nativeHash';

const dirs: string[] = [];
afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** The files outside `native/` the build in {@link checkout} reads. */
const BUILD_SCRIPTS = ['scripts/build-native.mts', 'src/absentGlobals.ts', 'src/platform.ts'];

/** A checkout's build inputs, each holding its own name. */
const checkout = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'jsp-native-hash-'));
    dirs.push(dir);
    for (const file of [
        'native/sources.json',
        'native/manifest.json',
        'native/src/engine.c',
        'src/unrelated.ts',
        ...BUILD_SCRIPTS
    ]) {
        mkdirSync(dirname(join(dir, file)), { recursive: true });
        writeFileSync(join(dir, file), `${file}\n`);
    }
    return dir;
};

describe('nativeSourceHash', () => {
    it.each(['native/src/engine.c', ...BUILD_SCRIPTS])('changes when %s changes', (file) => {
        // A fresh checkout for each file, so no earlier change carries the difference.
        const dir = checkout();
        const before = nativeSourceHash(dir, BUILD_SCRIPTS);
        writeFileSync(join(dir, file), 'changed\n');
        expect(nativeSourceHash(dir, BUILD_SCRIPTS)).not.toBe(before);
    });

    it('leaves out files the build does not read', () => {
        const dir = checkout();
        const before = nativeSourceHash(dir, BUILD_SCRIPTS);
        writeFileSync(join(dir, 'src/unrelated.ts'), 'changed\n');
        expect(nativeSourceHash(dir, BUILD_SCRIPTS)).toBe(before);
    });

    it('ignores the manifest, which records the hash, and line endings', () => {
        const dir = checkout();
        const before = nativeSourceHash(dir, BUILD_SCRIPTS);
        writeFileSync(join(dir, 'native/manifest.json'), '{"build": "0123456789abcdef"}\n');
        writeFileSync(join(dir, 'native/src/engine.c'), 'native/src/engine.c\r\n');
        expect(nativeSourceHash(dir, BUILD_SCRIPTS)).toBe(before);
    });

    it('tells a checkout from a published package by its pinned sources', () => {
        const dir = checkout();
        expect(hasNativeSources(dir)).toBe(true);
        rmSync(join(dir, 'native/sources.json'));
        expect(hasNativeSources(dir)).toBe(false);
    });
});
