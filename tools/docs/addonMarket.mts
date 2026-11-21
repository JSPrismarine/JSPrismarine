/**
 * The addon marketplace the docs build stages: a card for each of JSPrismarine's own addons, read
 * from `addons/`, and for each addon `addons/listings.lock.json` holds, read from the files the
 * snapshot pinned; and a page for each, with its icon, screenshots and README.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { Addon } from '../../packages/addon-tools/src/addon.ts';
import { ADDON_ICON_FILE, ADDON_TAGS, packAddon } from '../../packages/addon-tools/src/addon.ts';
import type { AddonListingFile } from '../../packages/addon-tools/src/addonIndex.ts';
import { compareAddonVersions } from '../../packages/addon-tools/src/addonIndex.ts';
import { renderAddonReadme } from './addonReadme.mts';
import type { ListingsLock, LockedListingAddon } from './listings.mts';
import { extensionOf, FIRST_PARTY_REPOSITORY, isPassiveImage, sha256Of } from './listings.mts';
import type { JsonLdFrontmatter, JsonObject } from './structuredData.mts';
import type {
    Market,
    MarketAddon,
    MarketAddonPage,
    MarketDeprecation,
    MarketVersion
} from './site/.vitepress/theme/addonMarket.ts';

/** The folder under the site's public folder that serves addon icons and screenshots. */
export const MARKET_MEDIA_DIRECTORY = 'addon-media';

/** What {@link buildMarket} reads. */
export interface MarketInput {
    /** JSPrismarine's own addons, from `addons/`. */
    readonly firstParty: readonly Addon[];
    readonly lock: ListingsLock;
    /** The current JSPrismarine release. */
    readonly serverVersion: string;
    /** JSPrismarine's repository on GitHub, `https://github.com/<owner>/<repo>`. */
    readonly repositoryUrl: string;
    /** A first-party README as the site shows it, with its docs facts filled in. */
    readonly firstPartyReadme: (addon: Addon) => string;
    /** Where a relative link in a first-party README opens. */
    readonly firstPartyLink: (addon: Addon, href: string) => string;
    /** A pinned listing file, checked against its SHA-256, or undefined when it is gone or changed. */
    readonly download: (file: AddonListingFile) => Promise<Uint8Array | undefined>;
}

/** What the docs build stages for the marketplace. */
export interface MarketBuild {
    readonly market: Market;
    readonly pages: readonly MarketAddonPage[];
    /** Icons and screenshots, by their path under the site's public folder. */
    readonly media: ReadonlyMap<string, Uint8Array>;
}

/** Whether a tag is one the filters offer. */
const isKnownTag = (tag: string): boolean => ADDON_TAGS.some((known) => known === tag);

/** The release part of a version, without a prerelease or build suffix. */
const releaseOf = (version: string): string => version.split(/[-+]/)[0] ?? version;

/** What both kinds of addon share before their page content is read. */
interface Draft {
    readonly card: Omit<MarketAddon, 'deprecated'>;
    readonly deprecated?: Omit<MarketDeprecation, 'replacedByPath' | 'replacedByTitle'>;
    /** Reads the page's screenshots and README, adding its media to the build's. */
    readonly content: (media: Map<string, Uint8Array>) => Promise<Pick<MarketAddonPage, 'screenshots' | 'readmeHtml'>>;
}

/** Fills in a deprecation's replacement when the marketplace lists it. */
const linkReplacement = (
    deprecated: Draft['deprecated'],
    cards: ReadonlyMap<string, Draft['card']>
): MarketDeprecation | undefined => {
    if (deprecated === undefined) return undefined;
    const replacement = deprecated.replacedBy === undefined ? undefined : cards.get(deprecated.replacedBy);
    return replacement === undefined
        ? deprecated
        : { ...deprecated, replacedByPath: replacement.path, replacedByTitle: replacement.title };
};

/** One of JSPrismarine's own addons. */
function firstPartyDraft(addon: Addon, input: MarketInput, locked: LockedListingAddon | undefined): Draft {
    const id = addon.name;
    const mediaDir = `${MARKET_MEDIA_DIRECTORY}/${id}`;
    const published = locked?.versions ?? [];
    // A version in addons/ newer than the release's is released when its change reaches master.
    const unreleased =
        published[0] === undefined || compareAddonVersions(addon.version, published[0].version) > 0
            ? [{ version: addon.version, unreleased: true as const }]
            : [];
    const versions: MarketVersion[] = [
        ...unreleased,
        ...published.map(({ version, published: day }) => ({
            version,
            ...(day === undefined ? {} : { published: day })
        }))
    ];
    const icon = addon.files.get(ADDON_ICON_FILE);
    return {
        card: {
            id,
            name: addon.name,
            repository: FIRST_PARTY_REPOSITORY,
            firstParty: true,
            path: `/addons/${id}`,
            title: addon.title,
            description: addon.description,
            version: addon.version,
            minServer: addon.minServer,
            needsNewerServer: compareAddonVersions(addon.minServer, releaseOf(input.serverVersion)) > 0,
            license: addon.license,
            tags: (addon.tags ?? []).filter(isKnownTag),
            authors: addon.authors ?? [],
            ...(icon === undefined ? {} : { icon: `/${mediaDir}/icon.png` }),
            sha256: packAddon(addon).sha256,
            versions,
            sourceUrl: `${input.repositoryUrl}/tree/master/addons/${addon.name}`,
            issuesUrl: `${input.repositoryUrl}/issues`
        },
        // The author's notice comes first; the snapshot's covers an addon its release stopped listing.
        ...(addon.deprecated !== undefined
            ? {
                  deprecated: {
                      by: 'author' as const,
                      reason: addon.deprecated,
                      ...(addon.replacedBy === undefined ? {} : { replacedBy: addon.replacedBy })
                  }
              }
            : locked?.deprecated === undefined
              ? {}
              : { deprecated: locked.deprecated }),
        content: async (media) => {
            if (icon !== undefined) media.set(`${mediaDir}/icon.png`, icon);
            const sources = new Map<string, string>();
            const shots = (addon.screenshots ?? []).map(({ file, alt }, i) => {
                const name = `screenshot-${i + 1}${extensionOf(file)}`;
                media.set(`${mediaDir}/${name}`, addon.media.get(file)!);
                sources.set(file, `/${mediaDir}/${name}`);
                return { file, src: `/${mediaDir}/${name}`, alt };
            });
            const readme = renderAddonReadme(input.firstPartyReadme(addon), {
                community: false,
                screenshots: sources,
                resolveLink: (href) => input.firstPartyLink(addon, href)
            });
            return {
                screenshots: shots.filter(({ file }) => !readme.shown.has(file)).map(({ src, alt }) => ({ src, alt })),
                readmeHtml: readme.html
            };
        }
    };
}

/** An addon from another repository, from the snapshot. */
function communityDraft(locked: LockedListingAddon, input: MarketInput): Draft {
    const { repository, name, entry, listing } = locked;
    const id = `${repository}/${name}`;
    const mediaDir = `${MARKET_MEDIA_DIRECTORY}/${id}`;
    const author = listing?.deprecated;
    const deprecated: Draft['deprecated'] =
        author !== undefined
            ? {
                  by: 'author',
                  reason: author,
                  ...(listing?.replacedBy === undefined ? {} : { replacedBy: listing.replacedBy })
              }
            : locked.deprecated;
    const icon = listing?.icon;
    return {
        card: {
            id,
            name,
            repository,
            firstParty: false,
            path: `/addons/${id}`,
            title: listing?.title ?? name,
            description: entry.description,
            version: entry.version,
            minServer: entry.minServer,
            needsNewerServer: compareAddonVersions(entry.minServer, releaseOf(input.serverVersion)) > 0,
            license: listing?.license ?? '',
            tags: (listing?.tags ?? []).filter(isKnownTag),
            authors: listing?.authors ?? [],
            ...(icon === undefined ? {} : { icon: `/${mediaDir}/icon${extensionOf(icon.url)}` }),
            sha256: entry.sha256,
            versions: locked.versions.map(({ version, published }) => ({
                version,
                ...(published === undefined ? {} : { published })
            })),
            sourceUrl: `https://github.com/${repository}`,
            issuesUrl: `https://github.com/${repository}/issues`
        },
        ...(deprecated === undefined ? {} : { deprecated }),
        content: async (media) => {
            // The snapshot checked these are images, but the build serves them, so it checks again.
            const image = async (file: AddonListingFile) => {
                const bytes = await input.download(file);
                return bytes !== undefined && isPassiveImage(file.url, bytes) ? bytes : undefined;
            };
            if (icon !== undefined) {
                const bytes = await image(icon);
                if (bytes !== undefined) media.set(`${mediaDir}/icon${extensionOf(icon.url)}`, bytes);
            }
            const sources = new Map<string, string>();
            const shots: { file?: string; src: string; alt: string }[] = [];
            for (const [i, shot] of (listing?.screenshots ?? []).entries()) {
                const bytes = await image(shot);
                if (bytes === undefined) continue;
                const src = `/${mediaDir}/screenshot-${i + 1}${extensionOf(shot.url)}`;
                media.set(src.slice(1), bytes);
                if (shot.file !== undefined) sources.set(shot.file, src);
                shots.push({ ...(shot.file === undefined ? {} : { file: shot.file }), src, alt: shot.alt });
            }
            const bytes = listing?.readme === undefined ? undefined : await input.download(listing.readme);
            if (bytes === undefined)
                return { screenshots: shots.map(({ src, alt }) => ({ src, alt })), readmeHtml: '' };
            const readme = renderAddonReadme(new TextDecoder().decode(bytes), {
                community: true,
                screenshots: sources,
                // Relative links resolve from the addon's folder, which the release workflow reads from addons/.
                resolveLink: (href) => new URL(href, `https://github.com/${repository}/blob/HEAD/addons/${name}/`).href
            });
            return {
                screenshots: shots
                    .filter(({ file }) => file === undefined || !readme.shown.has(file))
                    .map(({ src, alt }) => ({ src, alt })),
                readmeHtml: readme.html
            };
        }
    };
}

/**
 * Builds the marketplace: a card for each addon, JSPrismarine's first and then by title, and a
 * page for each with its media. A listing file that cannot be downloaded or no longer matches its
 * hash is left out of its page.
 */
export async function buildMarket(input: MarketInput): Promise<MarketBuild> {
    const firstPartyLocks = new Map(
        input.lock.addons
            .filter(({ repository }) => repository === FIRST_PARTY_REPOSITORY)
            .map((locked) => [locked.name, locked])
    );
    const drafts = [
        ...input.firstParty.map((addon) => firstPartyDraft(addon, input, firstPartyLocks.get(addon.name))),
        ...input.lock.addons
            .filter(({ repository }) => repository !== FIRST_PARTY_REPOSITORY)
            .map((locked) => communityDraft(locked, input))
    ].sort(
        (a, b) =>
            Number(b.card.firstParty) - Number(a.card.firstParty) ||
            a.card.title.localeCompare(b.card.title, 'en') ||
            a.card.id.localeCompare(b.card.id, 'en')
    );
    const cards = new Map(drafts.map(({ card }) => [card.id, card]));
    const addons: MarketAddon[] = drafts.map(({ card, deprecated }) => {
        const linked = linkReplacement(deprecated, cards);
        return linked === undefined ? card : { ...card, deprecated: linked };
    });

    const media = new Map<string, Uint8Array>();
    const pages: MarketAddonPage[] = [];
    for (const [i, draft] of drafts.entries()) pages.push({ ...addons[i]!, ...(await draft.content(media)) });
    return {
        market: {
            addons,
            tags: [...ADDON_TAGS],
            repositories: new Set(addons.map(({ repository }) => repository)).size
        },
        pages,
        media
    };
}

/**
 * Downloads pinned listing files through a cache folder keyed by SHA-256, so a build downloads each
 * file once. A file that is gone or no longer matches its hash gives undefined and a warning.
 */
export function cachedDownloader(
    cacheDirectory: string,
    warn: (message: string) => void,
    fetcher: typeof fetch = fetch
): MarketInput['download'] {
    return async ({ url, sha256 }) => {
        const cached = path.join(cacheDirectory, sha256);
        // A build stopped mid-write can leave a partial file, so a hit counts only when it matches.
        if (existsSync(cached)) {
            const hit = new Uint8Array(readFileSync(cached));
            if (sha256Of(hit) === sha256) return hit;
        }
        let bytes: Uint8Array;
        try {
            const response = await fetcher(url);
            if (!response.ok) {
                warn(`${url} answered ${response.status}, so its addon page goes without it`);
                return undefined;
            }
            bytes = new Uint8Array(await response.arrayBuffer());
        } catch (error) {
            warn(`${url} could not be downloaded, so its addon page goes without it: ${String(error)}`);
            return undefined;
        }
        if (sha256Of(bytes) !== sha256) {
            warn(`${url} no longer matches its SHA-256, so its addon page goes without it`);
            return undefined;
        }
        mkdirSync(cacheDirectory, { recursive: true });
        writeFileSync(cached, bytes);
        return bytes;
    };
}

/** An addon page's structured data: a `SoftwareApplication` the page is about. */
export function addonJsonLd(page: MarketAddon): JsonLdFrontmatter {
    const latest = page.versions[0];
    const application: JsonObject = {
        '@id': '#addon',
        '@type': 'SoftwareApplication',
        name: page.title,
        description: page.description,
        applicationCategory: 'GameApplication',
        applicationSubCategory: 'JSPrismarine addon',
        operatingSystem: 'JSPrismarine',
        softwareVersion: page.version,
        softwareRequirements: `JSPrismarine ${page.minServer} or newer`,
        keywords: [...page.tags],
        codeRepository: page.sourceUrl,
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        ...(page.license === '' ? {} : { license: page.license }),
        ...(page.authors.length === 0
            ? {}
            : { author: page.authors.map((name) => ({ '@type': page.firstParty ? 'Organization' : 'Person', name })) }),
        ...(page.firstParty ? { publisher: { '@id': '/#organization' } } : {}),
        ...(latest?.published === undefined ? {} : { datePublished: latest.published })
    };
    return { main: { about: { '@id': '#addon' } }, graph: [application] };
}
