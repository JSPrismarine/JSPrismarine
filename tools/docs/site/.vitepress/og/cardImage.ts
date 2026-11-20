import { existsSync } from 'node:fs';
import path from 'node:path';

import type { HeadConfig } from 'vitepress';

import { isRecord } from '../../../../../scripts/isRecord.mts';
import { pageRoute } from '../../../sections.mts';

/** The two card designs: `hero` for the pages at the top of the site, `bento` for every other page. */
export const cardStyles = ['hero', 'bento'] as const;

/** One of {@link cardStyles}. */
export type CardStyle = (typeof cardStyles)[number];

/** A card's size in pixels: the 1.91:1 image link previews show at full width. */
export const cardSize = { width: 1200, height: 630 } as const;

/** The landing page's source file. Its card stands in for every page that turns its own off. */
export const landingPage = 'index.md';

/**
 * What a page's `image` front matter asks for:
 *
 * - absent: a card in the page's default style;
 * - `/path.png` or an absolute URL: that image as it is, and no card;
 * - `false`: no card of its own, and the landing page's card in its place, so a link never previews blank;
 * - `{ style, title, description }`: a card in the chosen style, with different wording. Each key is optional.
 */
export type ImageChoice =
    | { kind: 'card'; style?: CardStyle; title?: string; description?: string }
    | { kind: 'file'; src: string }
    | { kind: 'landing' };

const isCardStyle = (value: unknown): value is CardStyle => cardStyles.some((style) => style === value);

/** Reads and checks a page's `image` front matter. The build fails on a value that matches no form. */
export function parseImageChoice(value: unknown, relativePath: string): ImageChoice {
    const fail = (problem: string): never => {
        throw new Error(
            `${relativePath}: front matter \`image\` ${problem}. Leave it out for a generated card, or set a path such as \`/brand/card.png\`, \`false\`, or \`{ style: ${cardStyles.join(' | ')}, title, description }\`.`
        );
    };
    if (value === undefined || value === null) return { kind: 'card' };
    if (relativePath === landingPage)
        fail('cannot be set on the landing page, whose card is the one pages with `image: false` show');
    if (value === false) return { kind: 'landing' };
    if (typeof value === 'string') {
        // `//host/x` is a URL on another host with the page's scheme, not a site path.
        if (!/^(\/(?!\/)|https:\/\/)\S+$/.test(value)) fail(`is "${value}", which is not a site path or an https URL`);
        return { kind: 'file', src: value };
    }
    if (!isRecord(value)) return fail(`is ${JSON.stringify(value)}`);
    const unknown = Object.keys(value).filter((key) => !['style', 'title', 'description'].includes(key));
    if (unknown.length) fail(`has keys it does not know: ${unknown.join(', ')}`);
    const { style, title, description } = value;
    if (style !== undefined && !isCardStyle(style))
        fail(`asks for style ${JSON.stringify(style)}; the styles are ${cardStyles.join(' and ')}`);
    for (const [key, text] of Object.entries({ title, description }))
        if (text !== undefined && (typeof text !== 'string' || !text.trim())) fail(`has a ${key} that is not text`);
    return {
        kind: 'card',
        style: isCardStyle(style) ? style : undefined,
        title: typeof title === 'string' ? title.trim() : undefined,
        description: typeof description === 'string' ? description.trim() : undefined
    };
}

/**
 * The style a page's card takes unless its front matter picks one: `hero` for the landing page and
 * every page one level below it, which are the root pages (`/parity`, `/releases`) and the section
 * overviews (`/guide/`, `/api/`); `bento` for the pages inside a section.
 */
export function defaultCardStyle(relativePath: string): CardStyle {
    return pageRoute(relativePath).split('/').filter(Boolean).length <= 1 ? 'hero' : 'bento';
}

/** Where a page's card is published, from its source file: `og/guide/joining.png` for `guide/joining.md`. */
export const cardPath = (relativePath: string) => `og/${relativePath.replace(/\.md$/, '.png')}`;

/** The image a page's link preview shows, with what the Open Graph tags say about it. */
export interface PageImage {
    url: string;
    alt: string;
    /** Set for a generated card; an image a page names is used as it is, at a size the build does not read. */
    size?: typeof cardSize;
    type?: 'image/png';
}

/** The image of a generated card, under the site's base path. */
export const cardImage = (relativePath: string, alt: string, siteUrl: string): PageImage => ({
    url: new URL(cardPath(relativePath), siteUrl).href,
    alt,
    size: cardSize,
    type: 'image/png'
});

/** What a page's preview image is described by. */
export interface PageImageOptions {
    relativePath: string;
    /** The text of the page's own card, and of an image it names. */
    alt: string;
    /** The text of the landing page's card, which `image: false` shows. */
    landingAlt: string;
    siteUrl: string;
}

/** A page's preview image: its own card, the image its front matter names, or the landing page's card. */
export function pageImage(
    choice: ImageChoice,
    { relativePath, alt, landingAlt, siteUrl }: PageImageOptions
): PageImage {
    switch (choice.kind) {
        case 'card':
            return cardImage(relativePath, alt, siteUrl);
        case 'file':
            // A site path names a file in the built site, under the site's base path, not a page.
            return { url: new URL(isSitePath(choice.src) ? choice.src.slice(1) : choice.src, siteUrl).href, alt };
        case 'landing':
            return cardImage(landingPage, landingAlt, siteUrl);
    }
}

/** Whether an image `parseImageChoice` accepted is a file of the built site rather than an https URL. */
export const isSitePath = (src: string) => src.startsWith('/');

/**
 * Fails the build when a page's `image` names a site path the built site does not have, which would
 * publish a preview that never loads.
 *
 * @param images - Each page's source file and the site path its front matter names.
 * @param outDir - The built site.
 */
export function checkImageFiles(images: Iterable<[relativePath: string, src: string]>, outDir: string) {
    const missing = [...images].filter(([, src]) => !existsSync(path.join(outDir, src)));
    if (missing.length)
        throw new Error(
            `Front matter \`image\` names files the built site does not have:\n${missing.map(([page, src]) => `- ${page}: ${src}`).join('\n')}`
        );
}

/** The Open Graph and X tags for a preview image. */
export function imageTags({ url, alt, size, type }: PageImage): HeadConfig[] {
    return [
        ['meta', { property: 'og:image', content: url }],
        ...(type ? [['meta', { property: 'og:image:type', content: type }] satisfies HeadConfig] : []),
        ...(size
            ? [
                  ['meta', { property: 'og:image:width', content: String(size.width) }] satisfies HeadConfig,
                  ['meta', { property: 'og:image:height', content: String(size.height) }] satisfies HeadConfig
              ]
            : []),
        ['meta', { property: 'og:image:alt', content: alt }],
        ['meta', { name: 'twitter:image', content: url }],
        ['meta', { name: 'twitter:image:alt', content: alt }]
    ];
}
