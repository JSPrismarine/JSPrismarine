import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
    cardPath,
    cardSize,
    checkImageFiles,
    defaultCardStyle,
    imageTags,
    landingPage,
    pageImage,
    parseImageChoice
} from './cardImage.ts';

const siteUrl = 'https://docs.example/';
const options = { relativePath: 'guide/joining.md', alt: 'Joining', landingAlt: 'Landing', siteUrl };

describe('parseImageChoice', () => {
    it('generates a card in the default style when the page sets nothing', () => {
        expect(parseImageChoice(undefined, 'guide/joining.md')).toEqual({ kind: 'card' });
    });

    it('uses a site path or an https URL as the image, with no card', () => {
        expect(parseImageChoice('/brand/card.png', 'guide/joining.md')).toEqual({
            kind: 'file',
            src: '/brand/card.png'
        });
        expect(parseImageChoice('https://example.com/card.png', 'guide/joining.md')).toMatchObject({ kind: 'file' });
    });

    it('falls back to the landing page card for `false`', () => {
        expect(parseImageChoice(false, 'guide/joining.md')).toEqual({ kind: 'landing' });
    });

    it('takes a style and wording of the card own', () => {
        expect(
            parseImageChoice({ style: 'hero', title: ' Short title ', description: 'Why.' }, 'adr/0014-x.md')
        ).toEqual({ kind: 'card', style: 'hero', title: 'Short title', description: 'Why.' });
        expect(parseImageChoice({ style: 'bento' }, 'parity.md')).toEqual({
            kind: 'card',
            style: 'bento',
            title: undefined,
            description: undefined
        });
    });

    it.each([
        ['a relative path', 'card.png'],
        ['an http URL', 'http://example.com/card.png'],
        ['a protocol-relative URL', '//example.com/card.png'],
        ['true', true],
        ['a number', 3],
        ['a list', ['/a.png']],
        ['an unknown style', { style: 'slab' }],
        ['an unknown key', { image: '/a.png' }],
        ['an empty title', { title: '  ' }],
        ['a title that is not text', { title: 3 }]
    ])('fails the build on %s', (_name, value) => {
        expect(() => parseImageChoice(value, 'guide/joining.md')).toThrow(/guide\/joining\.md/);
    });

    it('fails the build when the landing page sets an image, since its card is the fallback', () => {
        expect(() => parseImageChoice(false, landingPage)).toThrow();
        expect(() => parseImageChoice({ style: 'bento' }, landingPage)).toThrow();
        expect(parseImageChoice(undefined, landingPage)).toEqual({ kind: 'card' });
    });
});

describe('defaultCardStyle', () => {
    it('gives the landing page, root pages and section overviews the hero', () => {
        for (const page of ['index.md', 'parity.md', 'releases.md', 'guide/index.md', 'api/index.md'])
            expect(defaultCardStyle(page)).toBe('hero');
    });

    it('gives every page inside a section the bento', () => {
        for (const page of [
            'guide/joining.md',
            'adr/0025-older-protocols.md',
            'api/@jsprismarine/nbt/index.md',
            'research/console-tui/plan.md'
        ])
            expect(defaultCardStyle(page)).toBe('bento');
    });
});

describe('card locations', () => {
    it('mirrors the source file under og/, so a page keeps its card path from build to build', () => {
        expect(cardPath('index.md')).toBe('og/index.png');
        expect(cardPath('guide/index.md')).toBe('og/guide/index.png');
        expect(cardPath('api/@jsprismarine/nbt/classes/NBT.md')).toBe('og/api/@jsprismarine/nbt/classes/NBT.png');
    });

    it('gives each page its own card, the landing card for `false`, and the named image for a path', () => {
        const own = pageImage({ kind: 'card' }, options);
        expect(own).toEqual({
            url: new URL(cardPath('guide/joining.md'), siteUrl).href,
            alt: 'Joining',
            size: cardSize,
            type: 'image/png'
        });
        const fallback = pageImage({ kind: 'landing' }, options);
        expect(fallback).toEqual({ ...own, url: new URL(cardPath(landingPage), siteUrl).href, alt: 'Landing' });
        const named = pageImage({ kind: 'file', src: '/brand/card.png' }, options);
        expect(named).toEqual({ url: new URL('brand/card.png', siteUrl).href, alt: 'Joining' });
    });

    it("puts a card and a named site file under the site's base path, without reading them as pages", () => {
        const based = { ...options, siteUrl: 'https://example.github.io/docs/' };
        expect(pageImage({ kind: 'card' }, { ...based, relativePath: 'guide/index.md' }).url).toBe(
            'https://example.github.io/docs/og/guide/index.png'
        );
        expect(pageImage({ kind: 'file', src: '/brand/index.png' }, based).url).toBe(
            'https://example.github.io/docs/brand/index.png'
        );
    });
});

describe('checkImageFiles', () => {
    it('fails the build, naming the page, when a named site file is not in the built site', () => {
        const outDir = mkdtempSync(path.join(tmpdir(), 'og-site-'));
        try {
            mkdirSync(path.join(outDir, 'brand'));
            writeFileSync(path.join(outDir, 'brand/card.png'), '');
            expect(() => checkImageFiles([['guide/joining.md', '/brand/card.png']], outDir)).not.toThrow();
            expect(() => checkImageFiles([['guide/joining.md', '/brand/crad.png']], outDir)).toThrow(
                /guide\/joining\.md: \/brand\/crad\.png/
            );
        } finally {
            rmSync(outDir, { recursive: true, force: true });
        }
    });
});

describe('imageTags', () => {
    const properties = (tags: ReturnType<typeof imageTags>) =>
        Object.fromEntries(tags.map(([, attributes]) => [attributes.property ?? attributes.name, attributes.content]));

    it('describes a generated card in full, at absolute URLs', () => {
        const image = pageImage({ kind: 'card' }, options);
        expect(properties(imageTags(image))).toEqual({
            'og:image': image.url,
            'og:image:type': 'image/png',
            'og:image:width': String(cardSize.width),
            'og:image:height': String(cardSize.height),
            'og:image:alt': 'Joining',
            'twitter:image': image.url,
            'twitter:image:alt': 'Joining'
        });
        expect(new URL(image.url).origin).toBe(new URL(siteUrl).origin);
    });

    it('leaves out the size and type of an image the build does not make', () => {
        const tags = properties(imageTags({ url: 'https://example.com/a.png', alt: 'A' }));
        expect(tags).not.toHaveProperty('og:image:width');
        expect(tags).not.toHaveProperty('og:image:type');
        expect(tags['og:image']).toBe('https://example.com/a.png');
    });
});
