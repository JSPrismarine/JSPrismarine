import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { AddonIndexEntry } from '../../packages/addon-tools/src/addonIndex.ts';
import { createAddonIndex } from '../../packages/addon-tools/src/addonIndex.ts';
import type { ListingsLock, RepositoryState, SnapshotSources } from './listings.mts';
import {
    readCapped,
    FIRST_PARTY_REPOSITORY,
    LISTINGS_LOCK_VERSION,
    loadListingsFile,
    loadListingsLock,
    lockProblems,
    parseListingsFile,
    parseListingsLock,
    refreshListings,
    serializeListingsLock
} from './listings.mts';

/** A file's bytes, one per character, so a fixture can start with an image's signature. */
const bytes = (text: string) => new Uint8Array(Buffer.from(text, 'latin1'));
const sha256 = (text: string) => createHash('sha256').update(bytes(text)).digest('hex');
const SHOT = '\x89PNG\r\n\x1a\nshot';

const base = (repository: string) => `https://github.com/${repository}/releases/download/addons`;

/** An index entry with a listing whose files are the texts given, served by {@link fakeSources}. */
const entry = (repository: string, name: string, version: string, deprecated?: string): AddonIndexEntry => ({
    name,
    version,
    description: `${name} does things.`,
    minServer: '0.23.0',
    url: `${base(repository)}/${name}-${version}.mcpack`,
    sha256: sha256(`${name} ${version} pack`),
    listing: {
        title: name,
        license: 'MIT',
        tags: ['gameplay'],
        authors: ['Ada'],
        ...(deprecated === undefined ? {} : { deprecated }),
        readme: { url: `${base(repository)}/${name}-${version}.md`, sha256: sha256(`# ${name}`) },
        screenshots: [
            {
                url: `${base(repository)}/${name}-${version}-1.png`,
                sha256: sha256(SHOT),
                alt: 'A screenshot.',
                file: 'media/shot.png'
            }
        ]
    }
});

/** Sources that serve the repositories given and every listing file the entries name. */
const fakeSources = (repositories: Record<string, Partial<RepositoryState>>, today = '2026-11-21') => {
    const warnings: string[] = [];
    const downloads: string[] = [];
    const files = new Map<string, string>();
    for (const state of Object.values(repositories))
        for (const { name, listing } of state.index?.addons ?? []) {
            if (listing === undefined) continue;
            files.set(listing.readme.url, `# ${name}`);
            for (const shot of listing.screenshots) files.set(shot.url, SHOT);
        }
    const sources: SnapshotSources = {
        today,
        warn: (message) => warnings.push(message),
        download: async (url) => {
            downloads.push(url);
            const text = files.get(url);
            return text === undefined ? undefined : bytes(text);
        },
        repository: async (repository) => ({ assetDates: new Map(), ...repositories[repository] })
    };
    return { sources, warnings, downloads, files };
};

const empty: ListingsLock = { lockVersion: LISTINGS_LOCK_VERSION, addons: [] };
const listing = (repository: string, ...addons: (string | { name: string; deprecated: string })[]) =>
    parseListingsFile({ listings: [{ repository, addons }] });

describe('parseListingsFile', () => {
    it('reads names and a maintainer’s deprecation', () => {
        expect(listing('acme/addons', 'warps', { name: 'homes', deprecated: 'Use warps.' })).toEqual({
            listings: [
                { repository: 'acme/addons', addons: [{ name: 'warps' }, { name: 'homes', deprecated: 'Use warps.' }] }
            ]
        });
    });

    it.each([
        ['JSPrismarine’s own repository', { listings: [{ repository: FIRST_PARTY_REPOSITORY, addons: ['x'] }] }],
        [
            'a repository twice',
            {
                listings: [
                    { repository: 'a/b', addons: ['x'] },
                    { repository: 'A/b', addons: ['y'] }
                ]
            }
        ],
        ['an addon twice', { listings: [{ repository: 'a/b', addons: ['x', { name: 'x' }] }] }],
        ['a name that is not an addon name', { listings: [{ repository: 'a/b', addons: ['Warps'] }] }],
        ['a repository with no addons', { listings: [{ repository: 'a/b', addons: [] }] }]
    ])('refuses %s', (_, value) => {
        expect(() => parseListingsFile(value)).toThrow();
    });
});

describe('refreshListings', () => {
    it('records the newest version with verified files and every published version, newest first', async () => {
        const index = createAddonIndex([
            entry('acme/addons', 'warps', '1.0.0'),
            entry('acme/addons', 'warps', '1.2.0')
        ]);
        const { sources } = fakeSources({
            'acme/addons': { index, assetDates: new Map([['warps-1.2.0.mcpack', '2026-11-02']]) }
        });

        const lock = await refreshListings(listing('acme/addons', 'warps'), [], empty, sources);

        const newest = entry('acme/addons', 'warps', '1.2.0');
        const { listing: newestListing, ...plain } = newest;
        expect(lock.addons).toEqual([
            {
                repository: 'acme/addons',
                name: 'warps',
                entry: plain,
                listing: newestListing,
                versions: [
                    { version: '1.2.0', minServer: '0.23.0', sha256: newest.sha256, published: '2026-11-02' },
                    { version: '1.0.0', minServer: '0.23.0', sha256: sha256('warps 1.0.0 pack') }
                ]
            }
        ]);
        expect(parseListingsLock(JSON.parse(serializeListingsLock(lock)))).toEqual(lock);
    });

    it('leaves out a listing file that does not match its hash, and downloads nothing a full lock verified', async () => {
        const index = createAddonIndex([entry('acme/addons', 'warps', '1.0.0')]);
        const fake = fakeSources({ 'acme/addons': { index } });
        fake.files.set(`${base('acme/addons')}/warps-1.0.0-1.png`, 'another image');

        const lock = await refreshListings(listing('acme/addons', 'warps'), [], empty, fake.sources);
        expect(lock.addons[0]?.listing?.screenshots).toEqual([]);
        expect(fake.warnings).toEqual([expect.stringContaining('does not match its SHA-256')]);

        const verified = fakeSources({ 'acme/addons': { index } });
        const first = await refreshListings(listing('acme/addons', 'warps'), [], empty, verified.sources);
        verified.downloads.length = 0;
        expect(await refreshListings(listing('acme/addons', 'warps'), [], first, verified.sources)).toEqual(first);
        expect(verified.downloads).toEqual([]);
    });

    it.each([
        ['an HTML file named as a PNG', '-1.png', '<script>alert(1)</script>'],
        ['an SVG', '-1.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
        ['a PNG named as HTML', '-1.html', SHOT]
    ])('leaves out a screenshot that is %s', async (_, suffix, content) => {
        const plain = entry('acme/addons', 'warps', '1.0.0');
        const url = `${base('acme/addons')}/warps-1.0.0${suffix}`;
        const shot = { url, sha256: sha256(content), alt: 'A screenshot.', file: 'media/shot.png' };
        const index = createAddonIndex([{ ...plain, listing: { ...plain.listing!, screenshots: [shot] } }]);
        const fake = fakeSources({ 'acme/addons': { index } });
        fake.files.set(url, content);

        const lock = await refreshListings(listing('acme/addons', 'warps'), [], empty, fake.sources);

        expect(lock.addons[0]?.listing?.screenshots).toEqual([]);
        expect(fake.warnings).toEqual([`acme/addons/warps: ${url} is not a PNG, JPEG, WebP or GIF image`]);
    });

    it('lists JSPrismarine’s own addons without an entry in listings.json', async () => {
        const index = createAddonIndex([entry(FIRST_PARTY_REPOSITORY, 'tps-bar', '1.0.2')]);
        const { sources } = fakeSources({ [FIRST_PARTY_REPOSITORY]: { index } });

        const lock = await refreshListings({ listings: [] }, ['tps-bar', 'unreleased'], empty, sources);

        expect(lock.addons.map(({ repository, name }) => `${repository}/${name}`)).toEqual([
            `${FIRST_PARTY_REPOSITORY}/tps-bar`
        ]);
    });

    it('deprecates an addon on a maintainer’s word, or when its repository is archived', async () => {
        const index = createAddonIndex([
            entry('acme/addons', 'warps', '1.0.0'),
            entry('acme/addons', 'homes', '1.0.0')
        ]);
        const { sources } = fakeSources({ 'acme/addons': { index, archived: true } });

        const lock = await refreshListings(
            listing('acme/addons', 'warps', { name: 'homes', deprecated: 'Use warps.' }),
            [],
            empty,
            sources
        );

        expect(lock.addons.map(({ name, deprecated }) => [name, deprecated])).toEqual([
            ['homes', { by: 'maintainer', reason: 'Use warps.' }],
            ['warps', { by: 'snapshot', reason: 'Its repository is archived.' }]
        ]);
    });

    it('keeps an addon whose release is gone, and deprecates it after seven days', async () => {
        const index = createAddonIndex([entry('acme/addons', 'warps', '1.0.0')]);
        const listed = listing('acme/addons', 'warps');
        const present = await refreshListings(listed, [], empty, fakeSources({ 'acme/addons': { index } }).sources);

        const gone = await refreshListings(
            listed,
            [],
            present,
            fakeSources({ 'acme/addons': {} }, '2026-11-22').sources
        );
        expect(gone.addons[0]).toEqual({ ...present.addons[0], missingSince: '2026-11-22' });

        const week = await refreshListings(listed, [], gone, fakeSources({ 'acme/addons': {} }, '2026-11-29').sources);
        expect(week.addons[0]?.deprecated).toEqual({
            by: 'snapshot',
            reason: 'Its release has been gone since 2026-11-22.'
        });

        const back = await refreshListings(listed, [], week, fakeSources({ 'acme/addons': { index } }).sources);
        expect(back).toEqual(present);
    });
});

describe('lockProblems', () => {
    it('finds a listed addon the lock lacks, a lock entry nobody lists, and a changed deprecation', async () => {
        const index = createAddonIndex([
            entry('acme/addons', 'warps', '1.0.0'),
            entry('acme/addons', 'homes', '1.0.0')
        ]);
        const lock = await refreshListings(
            listing('acme/addons', 'warps', 'homes'),
            [],
            empty,
            fakeSources({ 'acme/addons': { index } }).sources
        );

        expect(lockProblems(listing('acme/addons', 'warps', 'homes'), lock)).toEqual([]);
        expect(lockProblems(listing('acme/addons', 'warps', 'homes', 'afk'), lock)).toEqual([
            'acme/addons/afk is listed but not in the lock'
        ]);
        expect(lockProblems(listing('acme/addons', 'warps'), lock)).toEqual([
            'acme/addons/homes is in the lock but not listed'
        ]);
        expect(lockProblems(listing('acme/addons', 'warps', { name: 'homes', deprecated: 'Gone.' }), lock)).toEqual([
            "acme/addons/homes's maintainer deprecation in the lock differs from listings.json"
        ]);
    });

    it('holds for the checked-in files', () => {
        expect(lockProblems(loadListingsFile(), loadListingsLock())).toEqual([]);
    });
});

describe('readCapped', () => {
    /** A response whose body arrives in chunks, with no Content-Length to go by. */
    const streamed = (...chunks: string[]) =>
        new Response(
            new ReadableStream({
                start(controller) {
                    for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
                    controller.close();
                }
            })
        );

    it('reads a body up to the limit', async () => {
        expect(new TextDecoder().decode(await readCapped(streamed('ab', 'cd'), 4))).toBe('abcd');
    });

    it('stops at a body past the limit, whether or not it declares its length', async () => {
        expect(await readCapped(streamed('ab', 'cd', 'e'), 4)).toBeUndefined();
        expect(await readCapped(new Response('abcde', { headers: { 'content-length': '5' } }), 4)).toBeUndefined();
    });
});
