import { describe, expect, it } from 'vitest';

import { ACCEPTED_LICENSES, parseCorpusManifest, readCorpusManifest } from './manifest.mts';

const repository = {
    url: 'https://github.com/example/pack',
    commit: 'a'.repeat(40),
    sha256: 'b'.repeat(64),
    license: 'MIT',
    packs: [{ id: 'pack', manifest: 'BP/manifest.json', sources: ['BP/scripts'] }]
};

describe('the corpus manifest', () => {
    it('pins every repository by full commit and digest, under an accepted license', () => {
        const manifest = readCorpusManifest();
        expect(manifest.repositories.length).toBeGreaterThan(0);
        for (const entry of manifest.repositories) {
            expect(entry.commit).toMatch(/^[0-9a-f]{40}$/);
            expect(ACCEPTED_LICENSES).toContain(entry.license);
        }
    });

    it('does not pin a repository it also excludes', () => {
        const manifest = readCorpusManifest();
        const pinned = new Set(manifest.repositories.map((entry) => entry.url));
        expect(manifest.excluded.filter((entry) => pinned.has(entry.url))).toEqual([]);
    });

    it('reads a repository', () => {
        expect(parseCorpusManifest({ repositories: [repository] }).repositories[0]).toMatchObject({
            name: 'example/pack',
            packs: [{ id: 'pack', exclude: [] }],
            excluded: []
        });
    });

    it.each([
        [{ commit: 'abc1234' }, 'is not a full commit hash'],
        [{ sha256: 'abc' }, 'is not a sha256 digest'],
        [{ license: 'GPL-3.0' }, 'is licensed GPL-3.0, which the corpus does not accept'],
        [{ url: 'https://gitlab.com/example/pack' }, 'is not a GitHub repository URL'],
        [{ packs: [] }, 'pins no pack']
    ])('rejects a repository with %o', (change, message) => {
        expect(() => parseCorpusManifest({ repositories: [{ ...repository, ...change }] })).toThrow(message);
    });

    it('rejects two packs with one id', () => {
        expect(() =>
            parseCorpusManifest({ repositories: [repository, { ...repository, url: 'https://github.com/example/b' }] })
        ).toThrow('pack pack appears twice');
    });
});
