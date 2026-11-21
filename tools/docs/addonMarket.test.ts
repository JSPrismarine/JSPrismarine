import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Addon } from '../../packages/addon-tools/src/addon.ts';
import type { AddonListingFile } from '../../packages/addon-tools/src/addonIndex.ts';
import type { MarketInput } from './addonMarket.mts';
import { addonJsonLd, buildMarket, cachedDownloader } from './addonMarket.mts';
import { releaseLabel } from './site/.vitepress/theme/addonMarket.ts';
import type { LockedListingAddon } from './listings.mts';
import { FIRST_PARTY_REPOSITORY, LISTINGS_LOCK_VERSION } from './listings.mts';

const encoder = new TextEncoder();
/** A file's bytes, one per character, so a fixture can start with an image's signature. */
const bytes = (text: string) => new Uint8Array(Buffer.from(text, 'latin1'));
const sha256 = (text: string) => createHash('sha256').update(bytes(text)).digest('hex');
const PNG = '\x89PNG\r\n\x1a\n';
const file = (url: string, text: string): AddonListingFile => ({ url, sha256: sha256(text) });

/** One of JSPrismarine's own addons, as `readAddon` returns it. */
const tpsBar: Addon = {
    name: 'tps-bar',
    title: 'TPS Bar',
    version: '1.0.2',
    description: 'Shows TPS, MSPT and ping on a boss bar.',
    minServer: '0.23.0',
    license: '(MIT OR MPL-2.0)',
    tags: ['performance'],
    screenshots: [{ file: 'media/bar.png', alt: 'The bar.' }],
    files: new Map([
        ['README.md', encoder.encode('# TPS Bar\n\n![The bar](media/bar.png)\n\n## Using it\n\nRun /tpsbar.\n')],
        ['pack_icon.png', encoder.encode('icon')]
    ]),
    media: new Map([['media/bar.png', encoder.encode('bar')]])
};

const base = 'https://github.com/acme/addons/releases/download/addons';
/** An addon from another repository, as the snapshot locked it. */
const warps = (overrides: Partial<LockedListingAddon> = {}): LockedListingAddon => ({
    repository: 'acme/addons',
    name: 'warps',
    entry: {
        name: 'warps',
        version: '2.1.0',
        description: 'Named places players travel back to.',
        minServer: '0.99.0',
        url: `${base}/warps-2.1.0.mcpack`,
        sha256: sha256('pack')
    },
    listing: {
        title: 'Warps',
        license: 'MIT',
        tags: ['gameplay', 'economy'],
        authors: ['Ada'],
        readme: file(`${base}/warps-2.1.0.md`, '# Warps\n\nSee <b>this</b>.\n'),
        icon: file(`${base}/warps-2.1.0.png`, `${PNG}warps icon`),
        screenshots: [{ ...file(`${base}/warps-2.1.0-1.png`, `${PNG}shot`), alt: 'A sign.', file: 'media/sign.png' }]
    },
    versions: [
        { version: '2.1.0', minServer: '0.99.0', sha256: sha256('pack'), published: '2026-11-14' },
        { version: '2.0.0', minServer: '0.23.0', sha256: sha256('old') }
    ],
    ...overrides
});

const served = new Map([
    [`${base}/warps-2.1.0.md`, '# Warps\n\nSee <b>this</b>.\n'],
    [`${base}/warps-2.1.0.png`, `${PNG}warps icon`],
    [`${base}/warps-2.1.0-1.png`, `${PNG}shot`]
]);

const input = (addons: readonly LockedListingAddon[], overrides: Partial<MarketInput> = {}): MarketInput => ({
    firstParty: [tpsBar],
    lock: {
        lockVersion: LISTINGS_LOCK_VERSION,
        addons: [
            ...addons,
            {
                repository: FIRST_PARTY_REPOSITORY,
                name: 'tps-bar',
                entry: { ...warps().entry, name: 'tps-bar', version: '1.0.1' },
                versions: [{ version: '1.0.1', minServer: '0.23.0', sha256: sha256('a'), published: '2026-11-20' }]
            }
        ]
    },
    serverVersion: '0.23.0',
    repositoryUrl: 'https://github.com/JSPrismarine/JSPrismarine',
    firstPartyReadme: (addon) => new TextDecoder().decode(addon.files.get('README.md')),
    firstPartyLink: (_, href) => `/site/${href}`,
    download: async ({ url }) => {
        const text = served.get(url);
        return text === undefined ? undefined : bytes(text);
    },
    ...overrides
});

describe('buildMarket', () => {
    it('lists JSPrismarine’s addons first, with an unreleased version above the released ones', async () => {
        const { market, pages } = await buildMarket(input([warps()]));

        expect(market.addons.map(({ id }) => id)).toEqual(['tps-bar', 'acme/addons/warps']);
        expect(market.repositories).toBe(2);
        expect(pages[0]).toMatchObject({
            id: 'tps-bar',
            path: '/addons/tps-bar',
            firstParty: true,
            icon: '/addon-media/tps-bar/icon.png',
            versions: [
                { version: '1.0.2', unreleased: true },
                { version: '1.0.1', published: '2026-11-20' }
            ],
            // The README shows the screenshot itself, so the gallery leaves it out.
            screenshots: []
        });
        expect(pages[0]?.readmeHtml).toContain('<img src="/addon-media/tps-bar/screenshot-1.png" alt="The bar"');
    });

    it('builds a community page from the pinned files, with the tags the filters know', async () => {
        const { pages, media } = await buildMarket(input([warps()]));
        const page = pages[1];

        expect(page).toMatchObject({
            id: 'acme/addons/warps',
            path: '/addons/acme/addons/warps',
            title: 'Warps',
            tags: ['gameplay'],
            needsNewerServer: true,
            sourceUrl: 'https://github.com/acme/addons',
            screenshots: [{ src: '/addon-media/acme/addons/warps/screenshot-1.png', alt: 'A sign.' }]
        });
        expect(page?.readmeHtml).toBe('<p>See &lt;b&gt;this&lt;/b&gt;.</p>\n');
        expect([...media.keys()].sort()).toEqual([
            'addon-media/acme/addons/warps/icon.png',
            'addon-media/acme/addons/warps/screenshot-1.png',
            'addon-media/tps-bar/icon.png',
            'addon-media/tps-bar/screenshot-1.png'
        ]);
    });

    it('leaves out a file that could not be downloaded', async () => {
        const { pages } = await buildMarket(input([warps()], { download: async () => undefined }));

        expect(pages[1]).toMatchObject({ readmeHtml: '', screenshots: [] });
    });

    it('serves only PNG, JPEG, WebP and GIF images from another repository', async () => {
        const html = '<script>alert(1)</script>';
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
        const gif = 'GIF89a\x01\x00';
        const files = new Map([
            [`${base}/warps.svg`, svg],
            [`${base}/warps-1.html`, html],
            [`${base}/warps-2.png`, html],
            [`${base}/warps-3.png`, gif],
            [`${base}/warps-4.gif`, gif]
        ]);
        const shot = (url: string) => ({ ...file(url, files.get(url)!), alt: 'Shot.' });
        const addon = warps({
            listing: {
                ...warps().listing!,
                icon: file(`${base}/warps.svg`, svg),
                screenshots: [1, 2, 3]
                    .map((n) => shot(`${base}/warps-${n}.${n === 1 ? 'html' : 'png'}`))
                    .concat(shot(`${base}/warps-4.gif`))
            }
        });

        const { pages, media } = await buildMarket(
            input([addon], { download: async ({ url }) => bytes(files.get(url) ?? served.get(url) ?? '') })
        );

        expect(pages[1]?.screenshots).toEqual([
            { src: '/addon-media/acme/addons/warps/screenshot-4.gif', alt: 'Shot.' }
        ]);
        expect([...media.keys()].filter((key) => key.startsWith('addon-media/acme/'))).toEqual([
            'addon-media/acme/addons/warps/screenshot-4.gif'
        ]);
    });

    it('takes the author’s deprecation first and links a listed replacement', async () => {
        const listing = warps().listing!;
        const homes = warps({
            name: 'homes',
            entry: { ...warps().entry, name: 'homes' },
            listing: { ...listing, title: 'Homes', deprecated: 'Use Warps.', replacedBy: 'acme/addons/warps' },
            deprecated: { by: 'maintainer', reason: 'Unmaintained.' }
        });
        const archived = warps({
            name: 'afk',
            entry: { ...warps().entry, name: 'afk' },
            listing: { ...listing, title: 'AFK' },
            deprecated: { by: 'snapshot', reason: 'Its repository is archived.' }
        });

        const { market } = await buildMarket(input([warps(), homes, archived]));

        expect(market.addons.find(({ name }) => name === 'homes')?.deprecated).toEqual({
            by: 'author',
            reason: 'Use Warps.',
            replacedBy: 'acme/addons/warps',
            replacedByPath: '/addons/acme/addons/warps',
            replacedByTitle: 'Warps'
        });
        expect(market.addons.find(({ name }) => name === 'afk')?.deprecated).toEqual({
            by: 'snapshot',
            reason: 'Its repository is archived.'
        });
    });
});

describe('JSPrismarine’s own addons', () => {
    it('shows the snapshot’s deprecation when the author set none', async () => {
        const base = input([]);
        const lock = {
            ...base.lock,
            addons: base.lock.addons.map((addon) => ({
                ...addon,
                deprecated: { by: 'snapshot' as const, reason: 'Its release has been gone since 2026-11-01.' }
            }))
        };

        const { market } = await buildMarket({ ...base, lock });
        expect(market.addons[0]?.deprecated).toEqual({
            by: 'snapshot',
            reason: 'Its release has been gone since 2026-11-01.'
        });

        const authored = await buildMarket({ ...base, lock, firstParty: [{ ...tpsBar, deprecated: 'Use Warps.' }] });
        expect(authored.market.addons[0]?.deprecated).toEqual({ by: 'author', reason: 'Use Warps.' });
    });
});

describe('cachedDownloader', () => {
    it('downloads again when the cached file does not match its hash', async () => {
        const directory = mkdtempSync(path.join(tmpdir(), 'addon-cache-'));
        try {
            const fetched: string[] = [];
            const download = cachedDownloader(
                directory,
                () => {},
                async (url) => {
                    fetched.push(String(url));
                    return new Response('readme');
                }
            );
            const pinned = file('https://x.test/readme.md', 'readme');
            // A build stopped mid-write left the first bytes only.
            writeFileSync(path.join(directory, pinned.sha256), 'rea');

            expect(new TextDecoder().decode(await download(pinned))).toBe('readme');
            expect(new TextDecoder().decode(await download(pinned))).toBe('readme');
            expect(fetched).toEqual(['https://x.test/readme.md']);
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });
});

describe('releaseLabel', () => {
    it('says a published version without a day has an unknown date, not that it is unreleased', () => {
        expect(releaseLabel({ version: '1.0.1', published: '2026-11-20' })).toBe('Nov 20, 2026');
        expect(releaseLabel({ version: '1.0.1' })).toBe('Date unknown');
        expect(releaseLabel({ version: '1.0.2', unreleased: true })).toBe('Not released yet');
    });
});

describe('addonJsonLd', () => {
    it('describes the addon as a SoftwareApplication the page is about', async () => {
        const { pages } = await buildMarket(input([warps()]));

        expect(addonJsonLd(pages[1]!)).toEqual({
            main: { about: { '@id': '#addon' } },
            graph: [
                expect.objectContaining({
                    '@id': '#addon',
                    '@type': 'SoftwareApplication',
                    name: 'Warps',
                    softwareVersion: '2.1.0',
                    license: 'MIT',
                    datePublished: '2026-11-14',
                    author: [{ '@type': 'Person', name: 'Ada' }]
                })
            ]
        });
    });
});
