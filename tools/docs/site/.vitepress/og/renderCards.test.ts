import { mkdtempSync, readdirSync, readFileSync, rmSync, truncateSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadProject } from '../../../project.mts';
import { cardPath, cardSize } from './cardImage.ts';
import type { CardContext, CardContent, CardRequest } from './cardContent.ts';
import { renderCard, writeCards } from './renderCards.ts';

/** The width and height a PNG's header gives. */
function pngSize(png: Uint8Array) {
    const view = Buffer.from(png);
    expect(view.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    return { width: view.readUInt32BE(16), height: view.readUInt32BE(20) };
}

const content = (style: CardContent['style'], figure?: CardContent['figure']): CardContent => ({
    style,
    title: 'Joining a server',
    identifier: false,
    description: 'How players add a JSPrismarine server in Minecraft.',
    section: 'Guides',
    tone: 'accent',
    figure,
    eyebrow: [[{ text: 'Guides' }]]
});

describe('renderCard', () => {
    it.each([
        ['hero', content('hero')],
        ['bento with a figure', content('bento', { value: '0025', label: 'Accepted' })],
        ['bento with the mark', content('bento')]
    ])('renders the %s style as a card-sized PNG', async (_name, card) => {
        expect(pngSize(await renderCard(card))).toEqual(cardSize);
    });

    it('renders the same bytes for the same content', async () => {
        const card = content('bento', { value: '26', label: 'errors' });
        expect(Buffer.from(await renderCard(card)).equals(Buffer.from(await renderCard(card)))).toBe(true);
    });

    it('fails rather than cut a figure short', async () => {
        await expect(renderCard(content('bento', { value: '1234567890123', label: 'errors' }))).rejects.toThrow(
            /1234567890123/
        );
    });
});

describe('writeCards', () => {
    const dirs: string[] = [];
    afterEach(() => {
        for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
    });

    const context: CardContext = {
        project: loadProject(),
        menus: [],
        errorCounts: new Map(),
        pages: [],
        source: () => '# Page\n\nA page.\n'
    };
    const tempDir = (prefix: string) => {
        const dir = mkdtempSync(path.join(tmpdir(), prefix));
        dirs.push(dir);
        return dir;
    };
    const joining: CardRequest = {
        relativePath: 'guide/joining.md',
        style: 'bento',
        title: 'Joining a server',
        description: 'How.'
    };
    const parity: CardRequest = {
        relativePath: 'parity.md',
        style: 'hero',
        title: 'Parity tracker',
        description: 'How much.'
    };
    const requests = [joining, parity];

    it('writes each card at its path, and copies an unchanged card from the cache on the next build', async () => {
        const cacheDir = mkdtempSync(path.join(tmpdir(), 'og-cache-'));
        dirs.push(cacheDir);
        const build = () => {
            const outDir = mkdtempSync(path.join(tmpdir(), 'og-out-'));
            dirs.push(outDir);
            return { outDir, stats: writeCards(requests, { context, outDir, cacheDir }) };
        };

        const first = build();
        expect(await first.stats).toMatchObject({ rendered: 2, reused: 0 });
        for (const { relativePath } of requests)
            expect(pngSize(readFileSync(path.join(first.outDir, cardPath(relativePath))))).toEqual(cardSize);

        const second = build();
        const stats = await second.stats;
        expect(stats).toMatchObject({ rendered: 0, reused: 2 });
        expect(stats.bytes).toBe((await first.stats).bytes);

        // A changed card renders again, and the entry it replaces leaves the cache.
        const changed = writeCards([{ ...joining, title: 'Joining' }, parity], {
            context,
            outDir: second.outDir,
            cacheDir
        });
        expect(await changed).toMatchObject({ rendered: 1, reused: 1 });
        expect(readdirSync(cacheDir)).toHaveLength(2);
    });

    it('renders a cached card again when its file was cut short', async () => {
        const cacheDir = tempDir('og-cache-');
        await writeCards([joining], { context, outDir: tempDir('og-out-'), cacheDir });
        const [entry] = readdirSync(cacheDir);
        truncateSync(path.join(cacheDir, entry ?? ''), 100);

        const outDir = tempDir('og-out-');
        expect(await writeCards([joining], { context, outDir, cacheDir })).toMatchObject({ rendered: 1, reused: 0 });
        expect(pngSize(readFileSync(path.join(outDir, cardPath(joining.relativePath))))).toEqual(cardSize);
        expect(readdirSync(cacheDir)).toEqual([entry]);
        expect(await writeCards([joining], { context, outDir, cacheDir })).toMatchObject({ rendered: 0, reused: 1 });
    });

    it('names the page whose card fails, even when it fails before rendering', async () => {
        const menus = [
            {
                text: 'Unknown menu',
                description: '',
                sections: [{ text: 'G', items: [{ text: 'J', link: '/guide/joining' }] }]
            }
        ];
        await expect(
            writeCards([joining], {
                context: { ...context, menus },
                outDir: tempDir('og-out-'),
                cacheDir: tempDir('og-cache-')
            })
        ).rejects.toThrow(/guide\/joining\.md/);
    });

    it('leaves out characters no card font draws, and says which page lost them', async () => {
        const warn = vi.spyOn(console, 'warn');
        const targets = { context, outDir: tempDir('og-out-'), cacheDir: tempDir('og-cache-') };
        await writeCards([{ ...joining, title: 'Joining 🎉 a server' }], targets);
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/guide\/joining\.md.*🎉/));
        warn.mockRestore();
        // The card is the one for the title without the emoji.
        expect(await writeCards([joining], targets)).toMatchObject({ rendered: 0, reused: 1 });
    });
});
