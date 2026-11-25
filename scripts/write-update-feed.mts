/**
 * Writes a channel's update feed for the build the workflow just published, and uploads it to
 * the repository's `updates` release, which servers read through `https://jsprismarine.dev/updates/v1/`.
 *
 * The release and nightly workflows run it after uploading the executables. It reads the
 * executables in `--dist`, records each file's SHA-256 and size, and replaces `<channel>.json`
 * only with a higher version than the one there, so rebuilding an old release leaves the feed
 * alone. `--allow-older` replaces it anyway, which is how a maintainer pulls a bad nightly.
 *
 * With `UPDATE_FEED_SIGNING_KEY` set to an Ed25519 private key in PEM, it also uploads
 * `<channel>.json.sig`, the base64 signature over the file's exact bytes. Servers ignore the
 * signature for now; the updater will require it.
 *
 * Reads `GITHUB_REPOSITORY` and `GH_TOKEN`, and runs `gh`.
 *
 *     node scripts/write-update-feed.mts --channel release --version 0.25.0 --commit <sha> --dist dist
 */
import { execFileSync } from 'node:child_process';
import { createHash, createPrivateKey, sign } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import {
    compareUpdateVersions,
    parseUpdateFeed,
    UPDATE_CHANNELS,
    UPDATE_FEED_SCHEMA,
    UPDATE_RELEASE_TAG,
    updateFeedFileName,
    updateFeedUrl,
    UPSTREAM_REPOSITORY
} from '../packages/prismarine/src/updates/feed.ts';
import type { UpdateChannel, UpdateFeed, UpdateFeedAsset } from '../packages/prismarine/src/updates/feed.ts';
import { releaseAnchor } from '../tools/docs/site/.vitepress/theme/releases.ts';

/** The site page whose anchors name each release, for JSPrismarine's own release notes. */
const RELEASES_PAGE = 'https://jsprismarine.dev/releases';

/**
 * The feed's name for an executable file: its Bun target without `bun-`, as `BUILD_TARGET`
 * spells it, and `darwin-arm64-app` for the macOS app.
 * @returns The name, or undefined for a file that is not an executable, such as `highlights.md`.
 */
export const assetTargetOf = (file: string): string | undefined => {
    const app = /^JSPrismarine-(.+)\.app\.zip$/.exec(file);
    if (app !== null) return `darwin-${app[1]}-app`;
    return /^prismarine-(.+?)(?:\.exe)?$/.exec(file)?.[1];
};

/** One file of the build, as {@link buildUpdateFeed} reads it. */
export interface BuildFile {
    readonly name: string;
    readonly bytes: Uint8Array;
}

/** What {@link buildUpdateFeed} writes a feed from. */
export interface FeedInputs {
    readonly channel: UpdateChannel;
    readonly version: string;
    readonly commit: string;
    readonly repository: string;
    readonly published: string;
    readonly files: readonly BuildFile[];
}

/**
 * The feed for a build. Its GitHub release is `jsprismarine@<version>`. Release notes are the
 * site's for a JSPrismarine release, and the GitHub release for a nightly or a fork's build.
 */
export const buildUpdateFeed = ({ channel, version, commit, repository, published, files }: FeedInputs): UpdateFeed => {
    const tag = encodeURIComponent(`jsprismarine@${version}`);
    const url = `https://github.com/${repository}/releases/tag/${tag}`;
    const upstream = repository.toLowerCase() === UPSTREAM_REPOSITORY.toLowerCase();
    const assets: Record<string, UpdateFeedAsset> = {};
    for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
        const target = assetTargetOf(file.name);
        if (target === undefined) continue;
        assets[target] = {
            url: `https://github.com/${repository}/releases/download/${tag}/${file.name}`,
            sha256: createHash('sha256').update(file.bytes).digest('hex'),
            size: file.bytes.byteLength
        };
    }
    return {
        schema: UPDATE_FEED_SCHEMA,
        channel,
        version,
        published,
        commit,
        url,
        notes: upstream && channel === 'release' ? `${RELEASES_PAGE}#${releaseAnchor(version)}` : url,
        assets
    };
};

/**
 * Whether a new feed may replace the published one: when nothing is published, or the new
 * version is the same or higher. The same version is a rerun of the run that published it.
 */
export const replaces = (next: UpdateFeed, published: UpdateFeed | undefined, allowOlder = false): boolean =>
    allowOlder || published === undefined || compareUpdateVersions(next.version, published.version) >= 0;

/** The feed file's bytes: the JSON the server reads, with a final newline. */
export const feedBytes = (feed: UpdateFeed): Buffer => Buffer.from(`${JSON.stringify(feed, null, 4)}\n`);

/** The base64 Ed25519 signature over a feed file's bytes. */
export const signFeed = (bytes: Uint8Array, privateKeyPem: string): string =>
    sign(null, bytes, createPrivateKey(privateKeyPem)).toString('base64');

const gh = (args: readonly string[]): string => execFileSync('gh', args, { encoding: 'utf8' });

/** The channel's feed as the `updates` release holds it now, or undefined when it has none. */
const publishedFeed = async (repository: string, channel: UpdateChannel): Promise<UpdateFeed | undefined> => {
    const url = updateFeedUrl(repository, channel);
    if (url === undefined) return undefined;
    const response = await fetch(url);
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    // Parsed JSON, checked by `parseUpdateFeed`.
    return parseUpdateFeed(await response.json());
};

const main = async (): Promise<void> => {
    const { values } = parseArgs({
        options: {
            channel: { type: 'string' },
            version: { type: 'string' },
            commit: { type: 'string' },
            dist: { type: 'string' },
            'allow-older': { type: 'boolean', default: false }
        }
    });
    const channel = UPDATE_CHANNELS.find((each) => each === values.channel);
    const repository = process.env.GITHUB_REPOSITORY;
    if (channel === undefined || !values.version || !values.commit || !values.dist || !repository) {
        throw new Error(
            'Usage: write-update-feed.mts --channel release|nightly --version <v> --commit <sha> --dist <dir>, with GITHUB_REPOSITORY set'
        );
    }
    const files = fs
        .readdirSync(values.dist)
        .map((name) => ({ name, bytes: fs.readFileSync(path.join(values.dist!, name)) }));
    const feed = buildUpdateFeed({
        channel,
        version: values.version,
        commit: values.commit,
        repository,
        published: new Date().toISOString(),
        files
    });
    if (Object.keys(feed.assets).length === 0) throw new Error(`${values.dist} holds no executables`);

    const published = await publishedFeed(repository, channel);
    if (!replaces(feed, published, values['allow-older'])) {
        console.log(
            `The ${channel} feed already names ${published?.version}, newer than ${feed.version}; left as it is.`
        );
        return;
    }

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'update-feed-'));
    const file = path.join(directory, updateFeedFileName(channel));
    const bytes = feedBytes(feed);
    fs.writeFileSync(file, bytes);
    const uploads = [file];
    const key = process.env.UPDATE_FEED_SIGNING_KEY;
    if (key) {
        fs.writeFileSync(`${file}.sig`, `${signFeed(bytes, key)}\n`);
        uploads.push(`${file}.sig`);
    } else {
        console.log('::warning::UPDATE_FEED_SIGNING_KEY is not set, so the feed goes up unsigned.');
    }

    try {
        gh(['release', 'view', UPDATE_RELEASE_TAG, '--repo', repository]);
    } catch {
        gh([
            'release',
            'create',
            UPDATE_RELEASE_TAG,
            '--repo',
            repository,
            '--latest=false',
            '--title',
            'Update feed',
            '--notes',
            'The update feed servers read to learn about new builds: one file per channel. The release and nightly workflows replace them; see docs/guide/updates.md.'
        ]);
    }
    gh(['release', 'upload', UPDATE_RELEASE_TAG, ...uploads, '--repo', repository, '--clobber']);
    console.log(`Published the ${channel} feed for ${feed.version}.`);
};

if (import.meta.main) await main();
