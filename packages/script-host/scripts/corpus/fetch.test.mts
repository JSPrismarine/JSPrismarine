import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { corpusDescriptor, fetchCorpusRepository, isCorpusCached } from './fetch.mts';
import type { CorpusRepository } from './manifest.mts';

const repository: CorpusRepository = {
    url: 'https://github.com/example/pack',
    name: 'example/pack',
    commit: 'a'.repeat(40),
    sha256: 'b'.repeat(64),
    license: 'MIT',
    packs: [
        { id: 'first', manifest: 'BP/manifest.json', sources: ['BP/scripts'], exclude: [] },
        { id: 'second', manifest: 'BP2/manifest.json', sources: ['BP2/scripts'], exclude: [] }
    ],
    excluded: []
};

describe('fetching the corpus', () => {
    let cacheRoot: string;
    const requested: string[] = [];

    beforeEach(() => {
        cacheRoot = mkdtempSync(join(tmpdir(), 'jsp-corpus-cache-'));
        requested.length = 0;
    });
    afterEach(() => rmSync(cacheRoot, { recursive: true, force: true }));

    const serve =
        (response: Response): typeof fetch =>
        async (input) => {
            requested.push(String(input));
            return response;
        };

    it('downloads the codeload zip of the pinned commit into a directory per repository and commit', () => {
        expect(corpusDescriptor(repository)).toMatchObject({
            name: 'addon-corpus/example/pack',
            version: 'a'.repeat(40),
            url: `https://codeload.github.com/example/pack/zip/${'a'.repeat(40)}`,
            hash: { algorithm: 'sha256', value: 'b'.repeat(64) },
            unpack: true
        });
    });

    it('names the packs and the commit when the commit is gone upstream', async () => {
        await expect(
            fetchCorpusRepository(repository, { cacheRoot, fetchImpl: serve(new Response('', { status: 404 })) })
        ).rejects.toThrow(
            `Cannot fetch corpus pack first, second from https://github.com/example/pack at ${'a'.repeat(40)}: ` +
                'Download failed for https://codeload.github.com/example/pack/zip/'
        );
        expect(requested).toEqual([`https://codeload.github.com/example/pack/zip/${'a'.repeat(40)}`]);
    });

    it('names the packs when the zip does not match the pinned digest', async () => {
        await expect(
            fetchCorpusRepository(repository, { cacheRoot, fetchImpl: serve(new Response('not the pinned zip')) })
        ).rejects.toThrow(/Cannot fetch corpus pack first, second .*sha256 mismatch/);
        expect(isCorpusCached({ repositories: [repository], excluded: [] }, cacheRoot)).toBe(false);
    });
});
