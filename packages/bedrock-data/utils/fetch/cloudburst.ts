/**
 * Resolves the CloudburstMC/Data dump for a Bedrock protocol version and
 * exposes it at one stable path.
 *
 * The dumps used to be a Git submodule checked out at `src/resources`, which
 * could only ever hold one Bedrock version. They are now pinned archives in
 * `sources.json`, cached per protocol version, and the selected version is
 * linked back to `src/resources` so generators and tests keep reading one
 * path.
 */
import { cp, lstat, mkdir, readlink, rm, symlink } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchSource, resolveContentRoot } from './fetch.ts';
import { cloudburstDescriptor, loadCloudburstData, type CloudburstVersion } from './manifest.ts';

/** The bedrock-data package directory. */
export const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Where the pinned downloads are cached, shared with the other sources. */
export const cacheRoot = resolve(packageDir, '../../node_modules/.cache/jsprismarine');

/** The path every consumer reads the dumps from. */
export const resourcesLink = join(packageDir, 'src/resources');

/** One resolved dump: which version it is and where its files are. */
export interface ResolvedCloudburstData {
    protocolVersion: number;
    minecraftVersion: string;
    /** Directory holding the dump files, such as `entity_identifiers.dat`. */
    path: string;
    /** True when `JSP_CLOUDBURST_DATA_PATH` supplied the files. */
    fromOverride: boolean;
    /** True when the verified archive was already cached and nothing was downloaded. */
    fromCache: boolean;
}

const OFFLINE_HINT =
    'Set JSP_CLOUDBURST_DATA_PATH to a local CloudburstMC/Data checkout to work offline, or run ' +
    '`pnpm --filter @jsprismarine/bedrock-data run fetch:cloudburst` while online.';

/**
 * Downloads and verifies the dump for one protocol version, or returns the
 * local copy `JSP_CLOUDBURST_DATA_PATH` points at.
 *
 * @param protocolVersion - Protocol to resolve. Defaults to the manifest's
 *   `defaultProtocolVersion`.
 * @throws Error naming the override variable when the archive is neither
 * cached nor reachable.
 */
export const ensureCloudburstData = async (protocolVersion?: number): Promise<ResolvedCloudburstData> => {
    const data = await loadCloudburstData(join(packageDir, 'sources.json'));
    const descriptor = cloudburstDescriptor(data, protocolVersion);
    const resolved = Number(descriptor.version.slice(1));
    // `cloudburstDescriptor` already rejected an unpinned protocol version.
    const pinned = data.versions[String(resolved)] as CloudburstVersion;

    let fetched;
    try {
        fetched = await fetchSource(descriptor, { cacheRoot });
    } catch (cause) {
        throw new Error(`Could not obtain CloudburstMC/Data for protocol ${resolved}. ${OFFLINE_HINT}`, { cause });
    }

    return {
        protocolVersion: resolved,
        minecraftVersion: pinned.minecraftVersion,
        path: fetched.fromOverride ? fetched.contentPath : await resolveContentRoot(fetched.contentPath),
        fromOverride: fetched.fromOverride,
        fromCache: fetched.fromCache
    };
};

const currentLinkTarget = async (linkPath: string): Promise<string | undefined> => {
    try {
        const info = await lstat(linkPath);
        return info.isSymbolicLink() ? await readlink(linkPath) : undefined;
    } catch {
        return undefined;
    }
};

/**
 * Points `src/resources` at a resolved dump, so consumers that join onto the
 * package directory keep working.
 *
 * A relative symlink is used where the platform allows one, which makes
 * switching versions free. Windows without developer mode refuses symlinks,
 * so the files are copied there instead.
 *
 * @param linkPath - Where the dump is exposed. Defaults to `src/resources`.
 * @returns How the link was made, for the caller to log.
 */
export const linkResources = async (
    dataPath: string,
    linkPath: string = resourcesLink
): Promise<'symlink' | 'copy' | 'unchanged'> => {
    const target = relative(dirname(linkPath), dataPath);
    if ((await currentLinkTarget(linkPath)) === target) return 'unchanged';

    await rm(linkPath, { recursive: true, force: true });
    try {
        await symlink(target, linkPath, 'dir');
        return 'symlink';
    } catch {
        await mkdir(linkPath, { recursive: true });
        await cp(dataPath, linkPath, { recursive: true });
        return 'copy';
    }
};

/**
 * Reads a `--protocol <n>` argument, as the fetch and generate scripts accept
 * it.
 *
 * @throws Error when the flag is present without a number.
 */
export const parseProtocolArgument = (argv: readonly string[]): number | undefined => {
    const index = argv.indexOf('--protocol');
    if (index < 0) return undefined;
    const value = Number(argv[index + 1]);
    if (!Number.isInteger(value))
        throw new Error('--protocol needs a Bedrock protocol version, such as --protocol 2193');
    return value;
};
