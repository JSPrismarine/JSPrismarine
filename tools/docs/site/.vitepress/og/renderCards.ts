import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import path from 'node:path';

import { renderAsync } from '@resvg/resvg-js';
import satori from 'satori';

import manifest from '../../../package.json' with { type: 'json' };
import { palette } from '../theme/tokens.ts';
import { cardPath, cardSize, versionCardUrls } from './cardImage.ts';
import { type CardContent, type CardContext, type CardRequest, describeCard } from './cardContent.ts';
import { bentoCard, heroCard } from './cardLayout.ts';
import { drawableText, satoriFonts } from './typefaces.ts';

/** Renders one card to a PNG. The same content gives the same bytes on every machine. */
export async function renderCard(content: CardContent) {
    const tree = content.style === 'hero' ? heroCard(content) : bentoCard(content);
    // Satori draws text as paths from the fonts it is given, so the rasterizer needs no fonts of its own,
    // and leaving the system's out keeps the output the same on every host.
    const svg = await satori(tree, { ...cardSize, fonts: satoriFonts });
    const image = await renderAsync(svg, {
        fitTo: { mode: 'width', value: cardSize.width },
        font: { loadSystemFonts: false }
    });
    return image.asPng();
}

/** The versions of the two packages that draw a card. */
const renderers = {
    satori: manifest.devDependencies.satori,
    resvg: manifest.devDependencies['@resvg/resvg-js']
};

/**
 * What a card's pixels depend on besides its content: the renderer's code, the fonts, the brand sizes,
 * the mark and the wordmark, the palette and the versions of satori and resvg. A change to any of them
 * renders every card again; a change to any other dependency, such as TypeDoc, does not.
 */
async function rendererFingerprint() {
    const hash = createHash('sha256');
    const ownDir = new URL('.', import.meta.url);
    for (const dir of [ownDir, new URL('./fonts/', ownDir)]) {
        for (const name of (await readdir(dir)).sort()) {
            if (/\.(ts|woff)$/.test(name) && !name.includes('.test.')) hash.update(await readFile(new URL(name, dir)));
        }
    }
    for (const file of ['../theme/brand.css', '../theme/prism.ts', '../theme/tokens.ts'])
        hash.update(await readFile(new URL(file, import.meta.url)));
    // `tokens.ts` reads its colors from the console's brand file, so the colors themselves are hashed.
    hash.update(JSON.stringify(palette));
    hash.update(JSON.stringify(renderers));
    return hash.digest('hex');
}

/** What `writeCards` did, counted rather than timed. */
export interface CardStats {
    rendered: number;
    reused: number;
    bytes: number;
}

/** The cards `writeCards` wrote: its counts, and each card's version for `versionCardLinks`. */
export interface WrittenCards extends CardStats {
    /** A short digest of each card's content and renderer, by its path from `cardPath`. */
    versions: Map<string, string>;
}

/** Where `writeCards` reads the repository and writes its output. */
export interface CardTargets {
    context: CardContext;
    /** The built site, which gets `og/<page>.png` for each card. */
    outDir: string;
    /** A folder kept between builds, where a card that did not change is copied from. */
    cacheDir: string;
}

/** The last chunk of every whole PNG: `IEND`, its empty body and its checksum. */
const pngEnd = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

/** A cached card, or undefined when there is none or the file stops short of a whole PNG. */
async function readCached(file: string) {
    const png = await readFile(file).catch(() => undefined);
    return png?.subarray(-pngEnd.length).equals(pngEnd) ? png : undefined;
}

/** How many files `writeWhole` has started, which gives each partial file a name of its own. */
let writes = 0;

/**
 * Writes a file whole or not at all: to a name of its own first, then renamed into place, so a build
 * stopped halfway, or a second writer of the same card, never leaves a cut-off file under the name.
 */
async function writeWhole(file: string, data: Uint8Array) {
    const partial = `${file}.${process.pid}.${writes++}.tmp`;
    await writeFile(partial, data);
    await rename(partial, file);
}

/**
 * A card's text with the characters no card font draws left out, so a card shows no empty boxes. Each
 * page that loses some is logged, rather than failing the build: the API reference's descriptions
 * come from code comments, written with no card in mind.
 */
function drawable(content: CardContent, relativePath: string): CardContent {
    const missing = new Set<string>();
    const keep = (value: string) => {
        const drawn = drawableText(value);
        for (const character of drawn.missing) missing.add(character);
        return drawn.text;
    };
    const figure = content.figure && {
        ...content.figure,
        value: keep(content.figure.value),
        label: keep(content.figure.label)
    };
    const result: CardContent = {
        ...content,
        title: keep(content.title),
        description: content.description === undefined ? undefined : keep(content.description) || undefined,
        section: keep(content.section),
        figure,
        eyebrow: content.eyebrow.map((group) => group.map((run) => ({ ...run, text: keep(run.text) })))
    };
    if (missing.size) {
        const message = `${relativePath}: the link preview card leaves out ${[...missing].join(' ')}, which its fonts do not have.`;
        console.warn(process.env.GITHUB_ACTIONS ? `::warning::${message}` : message);
    }
    return result;
}

/**
 * Renders every requested card into the built site. A card whose content and renderer match a
 * cached one is copied instead, and cache entries this build did not use are removed. Rendering runs
 * a few cards at a time: satori lays out on this thread while resvg rasterizes on the thread pool.
 */
export async function writeCards(
    requests: Iterable<CardRequest>,
    { context, outDir, cacheDir }: CardTargets
): Promise<WrittenCards> {
    await mkdir(cacheDir, { recursive: true });
    const fingerprint = await rendererFingerprint();
    const queue = [...requests].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    const used = new Set<string>();
    const stats: CardStats = { rendered: 0, reused: 0, bytes: 0 };
    const versions = new Map<string, string>();

    const writeCard = async (request: CardRequest) => {
        const content = drawable(describeCard(request, context), request.relativePath);
        const key = createHash('sha256').update(fingerprint).update(JSON.stringify(content)).digest('hex');
        const cached = path.join(cacheDir, `${key}.png`);
        const target = path.join(outDir, cardPath(request.relativePath));
        versions.set(cardPath(request.relativePath), key.slice(0, 16));
        await mkdir(path.dirname(target), { recursive: true });
        used.add(`${key}.png`);
        const reused = await readCached(cached);
        if (reused) {
            await writeFile(target, reused);
            stats.reused++;
            stats.bytes += reused.byteLength;
            return;
        }
        const png = await renderCard(content);
        await Promise.all([writeFile(target, png), writeWhole(cached, png)]);
        stats.rendered++;
        stats.bytes += png.byteLength;
    };
    const work = async () => {
        for (let request = queue.shift(); request; request = queue.shift()) {
            await writeCard(request).catch((error: unknown) => {
                throw new Error(`The link preview card for ${request?.relativePath} did not render.`, { cause: error });
            });
        }
    };
    await Promise.all(Array.from({ length: Math.min(4, availableParallelism()) }, work));

    // Leftover partial files from a stopped build go too, since no build uses them.
    for (const name of await readdir(cacheDir))
        if (!used.has(name)) await rm(path.join(cacheDir, name), { force: true });
    return { ...stats, versions };
}

/**
 * Versions the card links in every page of the built site with `versionCardUrls`.
 *
 * @param versions - From `writeCards`.
 * @returns How many pages linked to a card.
 */
export async function versionCardLinks(outDir: string, versions: ReadonlyMap<string, string>, siteUrl: string) {
    let pages = 0;
    const files = (await readdir(outDir, { recursive: true })).filter((file) => file.endsWith('.html'));
    for (const file of files) {
        const html = await readFile(path.join(outDir, file), 'utf8');
        const versioned = versionCardUrls(html, versions, siteUrl);
        if (versioned === html) continue;
        await writeFile(path.join(outDir, file), versioned);
        pages++;
    }
    return pages;
}
