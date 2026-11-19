import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { javaServerCacheFolder } from '@jsprismarine/bedrock-data/sources';
import { DEFAULT_JAVA_DATA_TARGET } from '@jsprismarine/packs/javaDataTarget';

import type * as PackStackModule from './packStack';

/** A preview pinned beside the default, and one pinned but never generated in the fake cache. */
const PREVIEW = '26.4-snapshot-8';
const UNGENERATED = '26.4-snapshot-9';

let PACK_STACK_ENV: typeof PackStackModule.PACK_STACK_ENV;
let resolvePackStack: typeof PackStackModule.resolvePackStack;

// `sources.json` pins one release today, so the resolver is imported fresh against a manifest
// that pins two more. A fresh import, rather than `vi.mock`, because test files share modules.
beforeAll(async () => {
    vi.resetModules();
    vi.doMock('@jsprismarine/bedrock-data/sources', async (importOriginal) => {
        const original = await importOriginal<typeof import('@jsprismarine/bedrock-data/sources')>();
        return { ...original, pinnedJavaReleases: [...original.pinnedJavaReleases, PREVIEW, UNGENERATED] };
    });
    ({ PACK_STACK_ENV, resolvePackStack } = await import('./packStack'));
});

const temporaryDirs: string[] = [];
afterAll(() => {
    vi.doUnmock('@jsprismarine/bedrock-data/sources');
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
    let datapack: (release: string) => string;

    beforeEach(() => {
        const project = mkdtempSync(join(tmpdir(), 'jsp-java-target-'));
        temporaryDirs.push(project);
        datapack = (release) => join(project, 'node_modules', '.cache', 'jsprismarine', 'vanilla-datapack', release);
        writeGenerated(datapack(javaServerCacheFolder), javaServerCacheFolder, [121, 0], 5023);
        writeGenerated(datapack(PREVIEW), PREVIEW, [127, 0], 5100);
        vi.spyOn(process, 'cwd').mockReturnValue(project);
        vi.stubEnv(PACK_STACK_ENV.vanillaDatapack, '');
    });

    afterEach(() => {
        vi.mocked(process.cwd).mockRestore();
        vi.unstubAllEnvs();
    });

    const javaOnly = { vanilla: false, overlay: false } as const;

    it('targets the default release when no release is named', () => {
        const { stack, java } = resolvePackStack(javaOnly);

        expect(stack).toEqual([{ kind: 'datapack', path: datapack(javaServerCacheFolder) }]);
        expect(java).toEqual({ release: javaServerCacheFolder, format: [121, 0], dataVersion: 5023 });
    });

    it('loads and targets the release content-java-version names', () => {
        const { stack, java, diagnostics } = resolvePackStack({ ...javaOnly, javaVersion: PREVIEW });

        expect(stack).toEqual([{ kind: 'datapack', path: datapack(PREVIEW) }]);
        expect(java).toEqual({ release: PREVIEW, format: [127, 0], dataVersion: 5100 });
        expect(diagnostics).toEqual([]);
    });

    it('refuses a release that is not pinned, naming the pinned ones', () => {
        expect(() => resolvePackStack({ ...javaOnly, javaVersion: '1.20.1' })).toThrowError(
            'content-java-version names Java 1.20.1, which is not pinned'
        );
        expect(() => resolvePackStack({ ...javaOnly, javaVersion: '1.20.1' })).toThrowError(
            `pinned releases are ${javaServerCacheFolder}, ${PREVIEW}, ${UNGENERATED}`
        );
    });

    it('refuses a pinned release whose data is not generated, naming the command that generates it', () => {
        expect(() => resolvePackStack({ ...javaOnly, javaVersion: UNGENERATED })).toThrowError(
            `run \`pnpm --filter @jsprismarine/bedrock-data run datagen:java --java ${UNGENERATED}\``
        );
    });

    it('reads the target of a datapack the override names, and warns when it has none', () => {
        const pointed = join(datapack(PREVIEW), '..', 'pointed');
        writeGenerated(pointed, PREVIEW, [127, 0], 5100);
        vi.stubEnv(PACK_STACK_ENV.vanillaDatapack, pointed);
        expect(resolvePackStack(javaOnly).java?.release).toBe(PREVIEW);

        rmSync(join(pointed, 'version.json'));
        const { java, diagnostics } = resolvePackStack(javaOnly);
        expect(java).toEqual(DEFAULT_JAVA_DATA_TARGET);
        expect(diagnostics).toMatchObject([{ severity: 'warning', code: 'pack.java-version-missing', pack: pointed }]);
    });
});
