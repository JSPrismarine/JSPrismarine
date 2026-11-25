/**
 * The update feed: one JSON file per channel that says which build is the newest, as the release
 * and nightly workflows publish it and the server reads it.
 *
 * This module imports nothing, so `.github/scripts/write-update-feed.mts` and
 * `set-build-metadata.mjs` load it under Node's type stripping and write what the server reads.
 */

/** The channels a server can follow: tagged releases, or the prereleases built from `master`. */
export const UPDATE_CHANNELS = ['release', 'nightly'] as const;

/** One of {@link UPDATE_CHANNELS}. */
export type UpdateChannel = (typeof UPDATE_CHANNELS)[number];

/** The feed layout this server reads. A breaking change gets a new number and a new folder. */
export const UPDATE_FEED_SCHEMA = 1;

/** Where JSPrismarine's own builds read the feed: a folder on the site that redirects to the files. */
export const DEFAULT_UPDATE_SOURCE = `https://jsprismarine.dev/updates/v${UPDATE_FEED_SCHEMA}`;

/** The repository whose builds read {@link DEFAULT_UPDATE_SOURCE}. A fork's builds read its own. */
export const UPSTREAM_REPOSITORY = 'JSPrismarine/JSPrismarine';

/** The tag of the GitHub release the workflows upload the feed files to. */
export const UPDATE_RELEASE_TAG = 'updates';

/** One executable a build ships, as the updater will download it. */
export interface UpdateFeedAsset {
    readonly url: string;
    /** The file's SHA-256, in lowercase hex. */
    readonly sha256: string;
    /** The file's size in bytes. */
    readonly size: number;
}

/** One channel's newest build. */
export interface UpdateFeed {
    readonly schema: typeof UPDATE_FEED_SCHEMA;
    readonly channel: UpdateChannel;
    /** The build's version, without a leading `v`. */
    readonly version: string;
    /** When the build was published, as an ISO 8601 time. */
    readonly published: string;
    /** The commit the build was made from. */
    readonly commit?: string;
    /** The build's GitHub release. */
    readonly url: string;
    /** Where its release notes are. */
    readonly notes: string;
    /** Each executable by its Bun target without the `bun-` prefix, such as `linux-x64`. */
    readonly assets: Readonly<Record<string, UpdateFeedAsset>>;
}

/** A semver version: three numbers, then an optional prerelease and build after `-` and `+`. */
const SEMVER =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;

/** Whether a string is a semver version such as `0.25.0` or `0.26.0-nightly.20261124.4484`. */
export const isUpdateVersion = (version: string): boolean => SEMVER.test(version);

/** Compares two prerelease identifiers as semver does: numbers by value and below any word. */
const compareIdentifiers = (a: string, b: string): number => {
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) return Number(a) - Number(b);
    if (aNumeric) return -1;
    if (bNumeric) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
};

/**
 * Compares two versions by semver precedence. A prerelease sorts below its release, so
 * `0.26.0-nightly.20261124.4484` is older than `0.26.0` and newer than `0.25.0`. Build metadata
 * after `+` is ignored. A string that is not a version sorts below every version.
 * @returns Negative when `a` is older than `b`, zero when they are equal, positive when newer.
 */
export const compareUpdateVersions = (a: string, b: string): number => {
    const left = SEMVER.exec(a);
    const right = SEMVER.exec(b);
    if (left === null || right === null) return (left === null ? 0 : 1) - (right === null ? 0 : 1);
    for (let part = 1; part <= 3; part++) {
        const difference = Number(left[part]) - Number(right[part]);
        if (difference !== 0) return difference;
    }
    const leftPre = left[4]?.split('.');
    const rightPre = right[4]?.split('.');
    if (leftPre === undefined || rightPre === undefined) {
        return (leftPre === undefined ? 1 : 0) - (rightPre === undefined ? 1 : 0);
    }
    for (let index = 0; index < Math.max(leftPre.length, rightPre.length); index++) {
        const l = leftPre[index];
        const r = rightPre[index];
        if (l === undefined || r === undefined) return l === undefined ? -1 : 1;
        const difference = compareIdentifiers(l, r);
        if (difference !== 0) return difference;
    }
    return 0;
};

// Not `utils/isRecord`: this module imports nothing, so the workflow scripts can load it.
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isHttpsUrl = (value: unknown): value is string =>
    typeof value === 'string' && URL.canParse(value) && new URL(value).protocol === 'https:';

const isChannel = (value: unknown): value is UpdateChannel =>
    typeof value === 'string' && (UPDATE_CHANNELS as readonly string[]).includes(value);

const isAsset = (value: unknown): value is UpdateFeedAsset =>
    isRecord(value) &&
    isHttpsUrl(value.url) &&
    typeof value.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(value.sha256) &&
    typeof value.size === 'number' &&
    Number.isSafeInteger(value.size) &&
    value.size >= 0;

/**
 * Reads a feed file's parsed JSON. Keys it does not know are dropped, so a later feed can add
 * fields without a new schema.
 * @param value - The file's parsed JSON.
 * @returns The feed, or undefined when it is not one this server reads.
 */
export const parseUpdateFeed = (value: unknown): UpdateFeed | undefined => {
    if (!isRecord(value) || value.schema !== UPDATE_FEED_SCHEMA || !isChannel(value.channel)) return undefined;
    const { version, published, commit, url, notes, assets } = value;
    if (typeof version !== 'string' || !isUpdateVersion(version)) return undefined;
    if (typeof published !== 'string' || Number.isNaN(Date.parse(published))) return undefined;
    if (commit !== undefined && typeof commit !== 'string') return undefined;
    if (!isHttpsUrl(url) || !isHttpsUrl(notes) || !isRecord(assets)) return undefined;
    if (!Object.values(assets).every(isAsset)) return undefined;
    const kept: Record<string, UpdateFeedAsset> = {};
    for (const [target, asset] of Object.entries(assets)) {
        if (isAsset(asset)) kept[target] = { url: asset.url, sha256: asset.sha256, size: asset.size };
    }
    return {
        schema: UPDATE_FEED_SCHEMA,
        channel: value.channel,
        version,
        published,
        ...(commit === undefined ? {} : { commit }),
        url,
        notes,
        assets: kept
    };
};

/** A GitHub repository as `owner/repo`, the spelling addon sources use too. */
const REPOSITORY = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

/**
 * Whether a string names a feed: a GitHub repository as `owner/repo`, whose `updates` release
 * holds the files, or the `https:` URL of a folder that holds them.
 */
export const isUpdateSource = (source: string): boolean => REPOSITORY.test(source) || isHttpsUrl(source);

/** The file a channel's feed is in. */
export const updateFeedFileName = (channel: UpdateChannel): string => `${channel}.json`;

/**
 * Where a source keeps a channel's feed.
 * @param source - `owner/repo`, or the `https:` URL of the folder.
 * @returns The file's URL, or undefined when the source is neither.
 */
export const updateFeedUrl = (source: string, channel: UpdateChannel): string | undefined => {
    if (REPOSITORY.test(source)) {
        return `https://github.com/${source}/releases/download/${UPDATE_RELEASE_TAG}/${updateFeedFileName(channel)}`;
    }
    if (!isHttpsUrl(source)) return undefined;
    return `${source.replace(/\/+$/, '')}/${updateFeedFileName(channel)}`;
};

/**
 * The feeds a server on a channel reads. A nightly server reads the release feed too, so it hears
 * about the release its nightly led up to.
 */
export const updateChannelFeeds = (channel: UpdateChannel): readonly UpdateChannel[] =>
    channel === 'nightly' ? ['nightly', 'release'] : ['release'];

/**
 * The source a build made from a repository reads by default: the site for JSPrismarine's own,
 * and the repository's own `updates` release for a fork's.
 * @param repository - The repository as `owner/repo`, such as `GITHUB_REPOSITORY`.
 */
export const defaultUpdateSourceOf = (repository: string): string =>
    repository.toLowerCase() === UPSTREAM_REPOSITORY.toLowerCase() ? DEFAULT_UPDATE_SOURCE : repository;
