import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { javaServerCacheFolder, pinnedJavaReleases } from '@jsprismarine/bedrock-data/sources';
import { DEFAULT_JAVA_DATA_TARGET } from '@jsprismarine/packs/javaDataTarget';

import { PACK_STACK_ENV, resolvePackStack } from './packStack';

/** A preview pinned beside the default, and one pinned but never generated in the temporary cache. */
const PREVIEW = '26.4-snapshot-8';
const UNGENERATED = '26.4-snapshot-9';

/** The manifest's pins plus the two above, passed to the resolver in place of `sources.json`'s. */
const PINNED = [...pinnedJavaReleases, PREVIEW, UNGENERATED];

const temporaryDirs: string[] = [];
afterAll(() => {
    for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** Writes a generated datapack with the `version.json` `datagen:java` writes beside it. */
const writeGenerated = (dir: string, release: string, format: [number, number], dataVersion: number): void => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'pack.mcmeta'), '{}');
    writeFileSync(
        join(dir, 'version.json'),
        JSON.stringify({ release, javaVersion: 25, dataPackFormat: format, dataVersion })
    );
};

describe('resolvePackStack and the Java data target', () => {
    let cacheRoot: string;
    let datapack: (release: string) => string;
    /** Reads only the Java datapack, out of the temporary cache, under the longer pin list. */
    const javaOnly = (javaVersion?: string) =>
        resolvePackStack({ vanilla: false, overlay: false, cacheRoot, pinnedJavaReleases: PINNED, javaVersion });

    beforeEach(() => {
        cacheRoot = mkdtempSync(join(tmpdir(), 'jsp-java-target-'));
        temporaryDirs.push(cacheRoot);
        datapack = (release) => join(cacheRoot, 'vanilla-datapack', release);
        writeGenerated(datapack(javaServerCacheFolder), javaServerCacheFolder, [121, 0], 5023);
        writeGenerated(datapack(PREVIEW), PREVIEW, [127, 0], 5100);
        vi.stubEnv(PACK_STACK_ENV.vanillaDatapack, '');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('targets the default release when no release is named', () => {
        const { stack, java } = javaOnly();

        expect(stack).toEqual([{ kind: 'datapack', path: datapack(javaServerCacheFolder) }]);
        expect(java).toEqual({ release: javaServerCacheFolder, format: [121, 0], dataVersion: 5023 });
    });

    it('loads and targets the release content-java-version names', () => {
        const { stack, java, diagnostics } = javaOnly(PREVIEW);

        expect(stack).toEqual([{ kind: 'datapack', path: datapack(PREVIEW) }]);
        expect(java).toEqual({ release: PREVIEW, format: [127, 0], dataVersion: 5100 });
        expect(diagnostics).toEqual([]);
    });

    it('refuses a release that is not pinned, naming the pinned ones', () => {
        expect(() => javaOnly('1.20.1')).toThrowError('content-java-version names Java 1.20.1, which is not pinned');
        expect(() => javaOnly('1.20.1')).toThrowError(`pinned releases are ${PINNED.join(', ')}`);
    });

    it('refuses a pinned release whose data is not generated, naming the command that generates it', () => {
        expect(() => javaOnly(UNGENERATED)).toThrowError(
            `run \`pnpm --filter @jsprismarine/bedrock-data run datagen:java --java ${UNGENERATED}\``
        );
    });

    it('reads the target of a datapack the override names, and warns when it has none', () => {
        const pointed = join(datapack(PREVIEW), '..', 'pointed');
        writeGenerated(pointed, PREVIEW, [127, 0], 5100);
        vi.stubEnv(PACK_STACK_ENV.vanillaDatapack, pointed);
        expect(javaOnly().java?.release).toBe(PREVIEW);

        rmSync(join(pointed, 'version.json'));
        const { java, diagnostics } = javaOnly();
        expect(java).toEqual(DEFAULT_JAVA_DATA_TARGET);
        expect(diagnostics).toMatchObject([{ severity: 'warning', code: 'pack.java-version-missing', pack: pointed }]);
    });
});
