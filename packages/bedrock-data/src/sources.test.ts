import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import sources from '../sources.json' with { type: 'json' };
import { javaServerCacheFolder, readGeneratedJavaVersion } from './sources';

let dir: string;

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'jsp-java-version-'));
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe('javaServerCacheFolder', () => {
    it('is the default Java release', () => {
        expect(javaServerCacheFolder).toBe(sources.javaServer.defaultVersion);
    });
});

describe('readGeneratedJavaVersion', () => {
    it('reads the record datagen:java writes', async () => {
        const record = { release: '26.3', javaVersion: 25, dataPackFormat: [101, 1], dataVersion: 4790 };
        await writeFile(join(dir, 'version.json'), JSON.stringify(record));

        expect(readGeneratedJavaVersion(dir)).toEqual(record);
    });

    it('returns undefined for a datapack generated before the record existed', () => {
        expect(readGeneratedJavaVersion(dir)).toBeUndefined();
    });

    it.each([
        ['not JSON', '{'],
        [
            'a format without a minor',
            JSON.stringify({ release: '26.3', javaVersion: 25, dataPackFormat: [101], dataVersion: 1 })
        ],
        ['a missing data version', JSON.stringify({ release: '26.3', javaVersion: 25, dataPackFormat: [101, 1] })]
    ])('returns undefined for %s', async (_case, content) => {
        await writeFile(join(dir, 'version.json'), content);

        expect(readGeneratedJavaVersion(dir)).toBeUndefined();
    });
});
