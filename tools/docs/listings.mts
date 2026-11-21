/**
 * The addon marketplace's snapshot of addons from other repositories. `addons/listings.json` names
 * the repositories and addons the site lists; `addons/listings.lock.json` records, for each of
 * them and for JSPrismarine's own addons, what their publisher's index said at the last refresh:
 * the newest version's entry with its listing files, every published version, and whether the
 * addon is deprecated. The docs build reads the lock and never another repository's index, so a
 * publisher being down cannot fail a deploy.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type {
    AddonIndex,
    AddonIndexEntry,
    AddonListing,
    AddonListingFile
} from '../../packages/addon-tools/src/addonIndex.ts';
import {
    ADDON_RELEASE_TAG,
    compareAddonVersions,
    isAddonInstallId,
    isAddonName,
    isAddonRepository,
    isAddonVersion,
    parseAddonIndex
} from '../../packages/addon-tools/src/addonIndex.ts';
import { fetchPublishedIndex, releaseDownloadUrl } from '../../packages/addon-tools/src/build.ts';
import { isRecord } from '../../scripts/isRecord.mts';
import { repoRoot } from './project.mts';

/** The repository JSPrismarine's own addons publish from, which `listings.json` never names. */
export const FIRST_PARTY_REPOSITORY = 'JSPrismarine/JSPrismarine';

/** The file that names the listed addons of other repositories. */
export const listingsFile = path.join(repoRoot, 'addons', 'listings.json');

/** The snapshot the docs build reads. */
export const listingsLockFile = path.join(repoRoot, 'addons', 'listings.lock.json');

/** The lock format this module writes and reads. */
export const LISTINGS_LOCK_VERSION = 1;

/**
 * The most a refresh reads of one listing file. The URL is a publisher's, so a larger body is left
 * out rather than buffered whole.
 */
export const MAX_LISTING_FILE_BYTES = 16 * 1024 * 1024;

/** How long an addon's release may be gone before the snapshot deprecates it. */
export const MISSING_DAYS_BEFORE_DEPRECATION = 7;

/** A file's type from its name or URL, in lower case, such as `.png`. */
export const extensionOf = (name: string): string =>
    path.posix.extname(new URL(name, 'https://x.invalid/').pathname).toLowerCase();

/** Whether bytes start with a signature, written as one character per byte, at an offset. */
const hasSignature = (bytes: Uint8Array, signature: string, at = 0): boolean =>
    [...signature].every((character, i) => bytes[at + i] === character.charCodeAt(0));

/**
 * The image types the marketplace serves from other repositories, each by its extensions and file
 * signature. They are formats a browser only shows: an SVG or HTML file can run a script on the
 * site's origin, so it never gets this far.
 */
const PASSIVE_IMAGES: readonly {
    readonly extensions: readonly string[];
    readonly is: (bytes: Uint8Array) => boolean;
}[] = [
    { extensions: ['.png'], is: (bytes) => hasSignature(bytes, '\x89PNG\r\n\x1a\n') },
    { extensions: ['.jpg', '.jpeg'], is: (bytes) => hasSignature(bytes, '\xff\xd8\xff') },
    { extensions: ['.webp'], is: (bytes) => hasSignature(bytes, 'RIFF') && hasSignature(bytes, 'WEBP', 8) },
    { extensions: ['.gif'], is: (bytes) => hasSignature(bytes, 'GIF87a') || hasSignature(bytes, 'GIF89a') }
];

/**
 * Whether a listing's icon or screenshot is a PNG, JPEG, WebP or GIF image: its URL's extension
 * names one of them and its bytes start with that type's signature.
 */
export function isPassiveImage(url: string, bytes: Uint8Array): boolean {
    const extension = extensionOf(url);
    return PASSIVE_IMAGES.some(({ extensions, is }) => extensions.includes(extension) && is(bytes));
}

/** One addon `listings.json` names. */
export interface ListedAddon {
    readonly name: string;
    /** A maintainer's reason for deprecating the addon, set in a reviewed pull request. */
    readonly deprecated?: string;
}

/** One repository `listings.json` names, with the addons of it the site lists. */
export interface ListedRepository {
    readonly repository: string;
    readonly addons: readonly ListedAddon[];
}

/** `addons/listings.json`. */
export interface ListingsFile {
    readonly listings: readonly ListedRepository[];
}

/** One published version, as the page's version list shows it. */
export interface LockedVersion {
    readonly version: string;
    readonly minServer: string;
    /** The pack's SHA-256. */
    readonly sha256: string;
    /** The day the pack was attached to the release, `YYYY-MM-DD`, when the release said. */
    readonly published?: string;
}

/** Who deprecated an addon on the site, beside its author. */
export interface SiteDeprecation {
    readonly by: 'maintainer' | 'snapshot';
    readonly reason: string;
}

/**
 * A listing as the snapshot verified it. A listing file whose download did not match its hash is
 * left out, so the page shows what it can.
 */
export interface LockedListing extends Omit<AddonListing, 'readme' | 'icon' | 'screenshots'> {
    readonly readme?: AddonListingFile;
    readonly icon?: AddonListingFile;
    readonly screenshots: readonly AddonListing['screenshots'][number][];
}

/** One addon in the snapshot. */
export interface LockedListingAddon {
    readonly repository: string;
    readonly name: string;
    /** The newest version's index entry, without its listing. */
    readonly entry: Omit<AddonIndexEntry, 'listing'>;
    /** The newest version's listing, when it has one. */
    readonly listing?: LockedListing;
    /** Every published version, newest first. */
    readonly versions: readonly LockedVersion[];
    /** A maintainer's or the snapshot's deprecation; an author's is in the listing. */
    readonly deprecated?: SiteDeprecation;
    /** The day the snapshot first found the addon's release gone, `YYYY-MM-DD`. */
    readonly missingSince?: string;
}

/** `addons/listings.lock.json`. */
export interface ListingsLock {
    readonly lockVersion: typeof LISTINGS_LOCK_VERSION;
    /** Sorted by repository, then by name. */
    readonly addons: readonly LockedListingAddon[];
}

const fail = (file: string, problem: string) => new Error(`${file} is invalid: ${problem}`);

/**
 * Validates a decoded `listings.json`: each repository an `owner/repo` other than JSPrismarine's,
 * listed once, each addon an addon name or `{ name, deprecated }`, listed once.
 */
export function parseListingsFile(value: unknown): ListingsFile {
    const file = 'addons/listings.json';
    if (!isRecord(value) || !Array.isArray(value.listings)) throw fail(file, 'it has no listings array');
    const repositories = new Set<string>();
    const listings = value.listings.map((listing: unknown, i): ListedRepository => {
        const where = `listings[${i}]`;
        if (!isRecord(listing)) throw fail(file, `${where} is not an object`);
        const { repository } = listing;
        if (typeof repository !== 'string' || !isAddonRepository(repository))
            throw fail(file, `${where}.repository is not an owner/repo`);
        if (repository.toLowerCase() === FIRST_PARTY_REPOSITORY.toLowerCase())
            throw fail(file, `${where} names ${FIRST_PARTY_REPOSITORY}, whose addons the site reads from addons/`);
        if (repositories.has(repository.toLowerCase())) throw fail(file, `${repository} is listed twice`);
        repositories.add(repository.toLowerCase());
        if (!Array.isArray(listing.addons) || listing.addons.length === 0)
            throw fail(file, `${where}.addons is not a non-empty array`);
        const names = new Set<string>();
        const addons = listing.addons.map((addon: unknown, j): ListedAddon => {
            const at = `${where}.addons[${j}]`;
            const name = typeof addon === 'string' ? addon : isRecord(addon) ? addon.name : undefined;
            if (typeof name !== 'string' || !isAddonName(name)) throw fail(file, `${at} is not an addon name`);
            if (names.has(name)) throw fail(file, `${repository}/${name} is listed twice`);
            names.add(name);
            if (typeof addon === 'string') return { name };
            const deprecated = isRecord(addon) ? addon.deprecated : undefined;
            if (deprecated === undefined) return { name };
            if (typeof deprecated !== 'string' || deprecated.trim() === '' || /[\r\n]/.test(deprecated))
                throw fail(file, `${at}.deprecated is not a one-line reason`);
            return { name, deprecated };
        });
        return { repository, addons };
    });
    return { listings };
}

/** Whether a lock value is a maintainer's or the snapshot's deprecation. */
const isSiteDeprecation = (value: unknown): value is SiteDeprecation =>
    isRecord(value) && (value.by === 'maintainer' || value.by === 'snapshot') && typeof value.reason === 'string';

/** Reads a listing file's link from the lock. */
const parseFile = (value: unknown, where: string): AddonListingFile => {
    if (!isRecord(value) || typeof value.url !== 'string' || typeof value.sha256 !== 'string')
        throw fail('addons/listings.lock.json', `${where} has no url and sha256`);
    return { url: value.url, sha256: value.sha256 };
};

/**
 * Validates a decoded `listings.lock.json`. The entries it holds came through
 * {@link parseAddonIndex} when the snapshot wrote them, and are checked the same way here.
 */
export function parseListingsLock(value: unknown): ListingsLock {
    const file = 'addons/listings.lock.json';
    if (!isRecord(value) || value.lockVersion !== LISTINGS_LOCK_VERSION || !Array.isArray(value.addons))
        throw fail(file, `it is not a version ${LISTINGS_LOCK_VERSION} lock with an addons array`);
    const addons = value.addons.map((addon: unknown, i): LockedListingAddon => {
        const where = `addons[${i}]`;
        if (!isRecord(addon)) throw fail(file, `${where} is not an object`);
        const { repository, name } = addon;
        if (typeof repository !== 'string' || !isAddonRepository(repository) || typeof name !== 'string')
            throw fail(file, `${where} has no repository and name`);
        // The entry and the listing's text fields go through the index's own checks.
        const [entry] = parseAddonIndex({ schemaVersion: 1, addons: [addon.entry] }).addons;
        if (entry === undefined || entry.name !== name) throw fail(file, `${where}.entry is not ${name}'s`);
        const { listing: _none, ...plain } = entry;
        if (!Array.isArray(addon.versions) || addon.versions.length === 0)
            throw fail(file, `${where}.versions is not a non-empty array`);
        const versions = addon.versions.map((version: unknown, j): LockedVersion => {
            if (
                !isRecord(version) ||
                typeof version.version !== 'string' ||
                !isAddonVersion(version.version) ||
                typeof version.minServer !== 'string' ||
                typeof version.sha256 !== 'string'
            )
                throw fail(file, `${where}.versions[${j}] is not a version, minServer and sha256`);
            const { published } = version;
            return {
                version: version.version,
                minServer: version.minServer,
                sha256: version.sha256,
                ...(typeof published === 'string' ? { published } : {})
            };
        });
        let listing: LockedListing | undefined;
        if (isRecord(addon.listing)) {
            const raw = addon.listing;
            const text = (key: string) => {
                const field = raw[key];
                if (typeof field !== 'string') throw fail(file, `${where}.listing.${key} is not a string`);
                return field;
            };
            const strings = (key: string) => {
                const field = raw[key];
                if (!Array.isArray(field) || !field.every((item) => typeof item === 'string'))
                    throw fail(file, `${where}.listing.${key} is not an array of strings`);
                return field;
            };
            const replacedBy = raw.replacedBy === undefined ? undefined : text('replacedBy');
            if (replacedBy !== undefined && !isAddonInstallId(replacedBy))
                throw fail(file, `${where}.listing.replacedBy is not an install id`);
            const screenshots = Array.isArray(raw.screenshots) ? raw.screenshots : [];
            listing = {
                title: text('title'),
                license: text('license'),
                tags: strings('tags'),
                authors: strings('authors'),
                ...(raw.deprecated === undefined ? {} : { deprecated: text('deprecated') }),
                ...(replacedBy === undefined ? {} : { replacedBy }),
                ...(raw.readme === undefined ? {} : { readme: parseFile(raw.readme, `${where}.listing.readme`) }),
                ...(raw.icon === undefined ? {} : { icon: parseFile(raw.icon, `${where}.listing.icon`) }),
                screenshots: screenshots.map((shot: unknown, j) => {
                    const at = `${where}.listing.screenshots[${j}]`;
                    if (!isRecord(shot) || typeof shot.alt !== 'string') throw fail(file, `${at} has no alt`);
                    return {
                        ...parseFile(shot, at),
                        alt: shot.alt,
                        ...(typeof shot.file === 'string' ? { file: shot.file } : {})
                    };
                })
            };
        }
        const { deprecated } = addon;
        if (deprecated !== undefined && !isSiteDeprecation(deprecated))
            throw fail(file, `${where}.deprecated is not a maintainer's or the snapshot's reason`);
        return {
            repository,
            name,
            entry: plain,
            ...(listing === undefined ? {} : { listing }),
            versions,
            ...(deprecated === undefined ? {} : { deprecated }),
            ...(typeof addon.missingSince === 'string' ? { missingSince: addon.missingSince } : {})
        };
    });
    return { lockVersion: LISTINGS_LOCK_VERSION, addons };
}

/** The lock as the snapshot writes it: four-space indented, ending in a newline. */
export const serializeListingsLock = (lock: ListingsLock): string => `${JSON.stringify(lock, null, 4)}\n`;

/** Reads a JSON file from the repository. */
const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));

/** The checked-in `listings.json`. */
export const loadListingsFile = (): ListingsFile => parseListingsFile(readJson(listingsFile));

/** The checked-in snapshot. */
export const loadListingsLock = (): ListingsLock => parseListingsLock(readJson(listingsLockFile));

/** A lock addon's key, `<repository>/<name>`. */
export const lockKey = ({ repository, name }: { repository: string; name: string }): string => `${repository}/${name}`;

/**
 * What a lock should hold for a listings file without a refresh: the problems that make the
 * checked-in lock stale, empty when it matches. Every listed addon is in the lock, each community
 * addon in the lock is listed, and each maintainer's deprecation is the one `listings.json` gives.
 */
export function lockProblems(listings: ListingsFile, lock: ListingsLock): string[] {
    const problems: string[] = [];
    const locked = new Map(lock.addons.map((addon) => [lockKey(addon), addon]));
    const listed = new Set<string>();
    for (const { repository, addons } of listings.listings) {
        for (const { name, deprecated } of addons) {
            const key = lockKey({ repository, name });
            listed.add(key);
            const addon = locked.get(key);
            if (addon === undefined) {
                problems.push(`${key} is listed but not in the lock`);
                continue;
            }
            const maintainer = addon.deprecated?.by === 'maintainer' ? addon.deprecated.reason : undefined;
            if (maintainer !== deprecated)
                problems.push(`${key}'s maintainer deprecation in the lock differs from listings.json`);
        }
    }
    for (const addon of lock.addons) {
        if (addon.repository !== FIRST_PARTY_REPOSITORY && !listed.has(lockKey(addon)))
            problems.push(`${lockKey(addon)} is in the lock but not listed`);
    }
    return problems;
}

/** What the snapshot reads from GitHub about a repository. */
export interface RepositoryState {
    /** Whether the repository is archived, or undefined when GitHub did not say. */
    readonly archived?: boolean;
    /** The day each release asset was attached, by its file name. */
    readonly assetDates: ReadonlyMap<string, string>;
    /** The release's index, or undefined when the release or its index is gone. */
    readonly index?: AddonIndex;
}

/** What a refresh needs from outside: GitHub, the downloads, and the day. */
export interface SnapshotSources {
    readonly repository: (repository: string) => Promise<RepositoryState>;
    /** Downloads a listing file, or undefined when it is gone or larger than {@link MAX_LISTING_FILE_BYTES}. */
    readonly download: (url: string) => Promise<Uint8Array | undefined>;
    /** Today, `YYYY-MM-DD`. */
    readonly today: string;
    readonly warn: (message: string) => void;
}

/** Whole days from one `YYYY-MM-DD` to another. */
const daysBetween = (from: string, to: string): number =>
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** A file's SHA-256, as an index pins it. */
export const sha256Of = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** What is wrong with a downloaded listing file, or undefined when nothing is. */
const fileProblem = (file: AddonListingFile, bytes: Uint8Array | undefined, image: boolean): string | undefined => {
    if (bytes === undefined) return 'is gone or too large';
    if (sha256Of(bytes) !== file.sha256) return 'does not match its SHA-256';
    if (image && !isPassiveImage(file.url, bytes)) return 'is not a PNG, JPEG, WebP or GIF image';
    return undefined;
};

/**
 * The listing with each file whose download does not match its hash left out, and each icon or
 * screenshot that is not a PNG, JPEG, WebP or GIF image.
 */
async function verifiedListing(key: string, listing: AddonListing, sources: SnapshotSources): Promise<LockedListing> {
    const check = async <T extends AddonListingFile>(file: T, image: boolean): Promise<T | undefined> => {
        const problem = fileProblem(file, await sources.download(file.url), image);
        if (problem === undefined) return file;
        sources.warn(`${key}: ${file.url} ${problem}`);
        return undefined;
    };
    const { readme, icon, screenshots, ...text } = listing;
    const checkedReadme = await check(readme, false);
    const checkedIcon = icon === undefined ? undefined : await check(icon, true);
    const checkedScreenshots = [];
    for (const shot of screenshots) {
        const checked = await check(shot, true);
        if (checked) checkedScreenshots.push(checked);
    }
    return {
        ...text,
        ...(checkedReadme ? { readme: checkedReadme } : {}),
        ...(checkedIcon ? { icon: checkedIcon } : {}),
        screenshots: checkedScreenshots
    };
}

/**
 * Refreshes the snapshot: for each listed addon and each of JSPrismarine's own, reads its
 * repository's release and index, takes the newest version's entry, verifies its listing files and
 * records every published version. An addon whose release or entry has gone keeps what the last
 * lock recorded, and becomes deprecated once it has been gone for
 * {@link MISSING_DAYS_BEFORE_DEPRECATION} days; one whose repository is archived is deprecated at
 * once. A maintainer's deprecation in `listings.json` comes first.
 *
 * @param firstParty - The names of JSPrismarine's own addons, from `addons/`.
 * @param previous - The lock the refresh replaces.
 */
export async function refreshListings(
    listings: ListingsFile,
    firstParty: readonly string[],
    previous: ListingsLock,
    sources: SnapshotSources
): Promise<ListingsLock> {
    const before = new Map(previous.addons.map((addon) => [lockKey(addon), addon]));
    const wanted: { repository: string; addon: ListedAddon }[] = [
        ...firstParty.map((name) => ({ repository: FIRST_PARTY_REPOSITORY, addon: { name } })),
        ...listings.listings.flatMap(({ repository, addons }) => addons.map((addon) => ({ repository, addon })))
    ];
    const states = new Map<string, RepositoryState>();
    const addons: LockedListingAddon[] = [];

    for (const { repository, addon } of wanted) {
        const key = lockKey({ repository, name: addon.name });
        const state = states.get(repository) ?? (await sources.repository(repository));
        states.set(repository, state);
        const published = (state.index?.addons ?? [])
            .filter((entry) => entry.name === addon.name)
            .sort((a, b) => compareAddonVersions(b.version, a.version));
        const last = before.get(key);
        const newest = published[0];

        let locked: LockedListingAddon | undefined;
        if (newest !== undefined) {
            const { listing, ...entry } = newest;
            // A version's files are fixed, so a lock that verified all of them needs no new download.
            const complete =
                last?.listing !== undefined &&
                last.listing.readme !== undefined &&
                (last.listing.icon !== undefined) === (listing?.icon !== undefined) &&
                last.listing.screenshots.length === listing?.screenshots.length;
            const sameListing = last?.entry.sha256 === entry.sha256 && complete;
            locked = {
                repository,
                name: addon.name,
                entry,
                ...(listing === undefined
                    ? {}
                    : { listing: sameListing ? last.listing : await verifiedListing(key, listing, sources) }),
                versions: published.map(({ version, minServer, sha256, url }) => {
                    const day = state.assetDates.get(path.posix.basename(new URL(url).pathname));
                    return { version, minServer, sha256, ...(day === undefined ? {} : { published: day }) };
                })
            };
        } else if (last !== undefined) {
            // Gone: keep the text the last refresh saw, so the page still renders.
            const missingSince = last.missingSince ?? sources.today;
            sources.warn(`${key}: its release no longer lists it, so the snapshot keeps the last one`);
            locked = { ...last, missingSince };
        } else {
            sources.warn(`${key}: its release does not list it yet, so it stays off the site`);
            continue;
        }

        const { deprecated: _old, missingSince: _since, ...rest } = locked;
        const missingSince = newest === undefined ? locked.missingSince : undefined;
        const deprecated: SiteDeprecation | undefined =
            addon.deprecated !== undefined
                ? { by: 'maintainer', reason: addon.deprecated }
                : state.archived === true
                  ? { by: 'snapshot', reason: 'Its repository is archived.' }
                  : missingSince !== undefined &&
                      daysBetween(missingSince, sources.today) >= MISSING_DAYS_BEFORE_DEPRECATION
                    ? {
                          by: 'snapshot',
                          reason: `Its release has been gone since ${missingSince}.`
                      }
                    : undefined;
        addons.push({
            ...rest,
            ...(deprecated === undefined ? {} : { deprecated }),
            ...(missingSince === undefined ? {} : { missingSince })
        });
    }

    addons.sort((a, b) => (lockKey(a) < lockKey(b) ? -1 : lockKey(a) > lockKey(b) ? 1 : 0));
    return { lockVersion: LISTINGS_LOCK_VERSION, addons };
}

/** GitHub's API, with the token in `GITHUB_TOKEN` when there is one. */
const githubJson = async (fetcher: typeof fetch, url: string): Promise<unknown> => {
    const token = process.env.GITHUB_TOKEN;
    const response = await fetcher(url, {
        headers: {
            accept: 'application/vnd.github+json',
            'user-agent': 'jsprismarine-docs',
            ...(token ? { authorization: `Bearer ${token}` } : {})
        }
    });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return response.json();
};

/**
 * A response's body, or undefined once it passes `limit` bytes. It reads the body as a stream and
 * stops there, so a large body is never held whole.
 */
export async function readCapped(response: Response, limit: number): Promise<Uint8Array | undefined> {
    const declared = Number(response.headers.get('content-length'));
    if (declared > limit) {
        await response.body?.cancel();
        return undefined;
    }
    const chunks: Uint8Array[] = [];
    let length = 0;
    for await (const chunk of response.body ?? []) {
        length += chunk.byteLength;
        // Leaving the loop cancels the stream.
        if (length > limit) return undefined;
        chunks.push(chunk);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

/** The sources a refresh reads on the network. */
export function networkSources(fetcher: typeof fetch = fetch): SnapshotSources {
    return {
        today: new Date().toISOString().slice(0, 10),
        warn: (message) => console.warn(message),
        download: async (url) => {
            const response = await fetcher(url);
            if (response.status === 404) return undefined;
            if (!response.ok) throw new Error(`${url} answered ${response.status}`);
            const bytes = await readCapped(response, MAX_LISTING_FILE_BYTES);
            if (bytes === undefined) console.warn(`${url} is larger than ${MAX_LISTING_FILE_BYTES} bytes`);
            return bytes;
        },
        repository: async (repository) => {
            const info = await githubJson(fetcher, `https://api.github.com/repos/${repository}`);
            const release = await githubJson(
                fetcher,
                `https://api.github.com/repos/${repository}/releases/tags/${ADDON_RELEASE_TAG}`
            );
            const assetDates = new Map<string, string>();
            const assets = isRecord(release) && Array.isArray(release.assets) ? release.assets : [];
            for (const asset of assets) {
                if (isRecord(asset) && typeof asset.name === 'string' && typeof asset.created_at === 'string')
                    assetDates.set(asset.name, asset.created_at.slice(0, 10));
            }
            // Only a 404 for both index files means the index is gone. Any other failure stops the
            // refresh, so a publisher that is down for a day does not start an addon's seven days.
            const index: AddonIndex | undefined =
                release === undefined ? undefined : await fetchPublishedIndex(releaseDownloadUrl(repository), fetcher);
            return {
                ...(isRecord(info) && typeof info.archived === 'boolean' ? { archived: info.archived } : {}),
                assetDates,
                ...(index === undefined ? {} : { index })
            };
        }
    };
}
