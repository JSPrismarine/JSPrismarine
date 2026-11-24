import { readFile } from 'node:fs/promises';

import type { ExpectedHash } from './hash.ts';

/**
 * A source the fetch step downloads: where it lives, which digest proves it
 * is the pinned content, and how it is cached.
 */
export interface SourceDescriptor {
    /** Cache key, the `<source>` segment of the cache path. */
    name: string;
    /** The `<version>` segment of the cache path. */
    version: string;
    /** Download URL for the archive or file. */
    url: string;
    /** Digest the download must match before it is unpacked or used. */
    hash: ExpectedHash;
    /** Whether the download is a zip to unpack, or a file kept as-is. */
    unpack: boolean;
    /** File name the download is stored under inside the version directory. */
    fileName: string;
    /** Environment variable that points at a local copy and skips the download. */
    envOverride: string;
    /**
     * Archive paths, relative to a GitHub archive's `<repo>-<commit>/` wrapper
     * directory, that are worth unpacking. Everything else in the archive is
     * left compressed. Absent means unpack the whole archive.
     */
    extract?: string[];
}

interface PinnedArchive {
    url: string;
    sha256: string;
}

/** One pinned Bedrock Dedicated Server zip: the server for a single protocol version. */
export interface BdsVersion extends PinnedArchive {
    /** The Minecraft version the protocol belongs to, such as `1.26.51`. */
    minecraftVersion: string;
    /** The BDS build number, such as `1.26.51.1`. */
    serverVersion: string;
    /** Mojang's build hash, kept as a cross-check of the measured sha256. */
    sha1: string;
    sizeInBytes: number;
    /**
     * Whether this is a preview build, from Mojang's `bin-linux-preview` channel. cinnabar does
     * not speak previews, so client-e2e leaves them out; `pnpm run bringup` checks them instead.
     */
    preview?: boolean;
}

/** The `bds` section: one server zip per Bedrock protocol version. */
export interface BdsData {
    /** The protocol version used when a caller does not ask for one. */
    defaultProtocolVersion: number;
    /** Pinned zips keyed by protocol version, as decimal strings. */
    versions: Record<string, BdsVersion>;
}

/** One pinned Java Edition server jar: a release, a pre-release or a snapshot. */
export interface JavaVersion extends PinnedArchive {
    /** Mojang's own checksum from piston-meta, which is also the object name in the URL. */
    sha1: string;
    sizeInBytes: number;
    /**
     * Whether this is a snapshot or pre-release tracked ahead of the default release. At most one
     * entry carries it, and it must be newer than `defaultVersion`.
     */
    preview?: boolean;
    /**
     * The Bedrock protocol the release's mapping and item tables map onto. Required on an entry
     * that is neither `defaultVersion` nor the preview, whose pair cannot be derived, and refused
     * on those two, whose pair is.
     */
    bedrockProtocol?: number;
}

/** The `javaServer` section: one server jar per Java Edition release id. */
export interface JavaServerData {
    /** The release id used when a caller does not ask for one, such as `26.3`. */
    defaultVersion: string;
    /** Pinned jars keyed by Java Edition release id. */
    versions: Record<string, JavaVersion>;
}

interface SourcesManifest {
    bds: BdsData;
    bedrockSamples: PinnedArchive & { tag: string; commit: string };
    javaServer: JavaServerData;
    geyserMappings: PinnedArchive & { commit: string };
    vanillaMcdoc: PinnedArchive & { commit: string };
}

/** Splits a Java release id into its numeric release and the suffix after the first `-`. */
const parseJavaRelease = (release: string): { numbers: number[]; suffix: string | undefined } => {
    const dash = release.indexOf('-');
    const head = dash < 0 ? release : release.slice(0, dash);
    return {
        numbers: head.split('.').map(Number),
        suffix: dash < 0 ? undefined : release.slice(dash + 1)
    };
};

/** Where a release id's suffix falls in Mojang's publishing order, the release itself last. */
const suffixKind = (suffix: string | undefined): number => {
    if (suffix === undefined) return 3;
    if (suffix.startsWith('rc')) return 2;
    if (suffix.startsWith('pre')) return 1;
    return 0;
};

/**
 * Orders two Java Edition release ids, such as `26.3`, `26.4-snapshot-8` and `26.4-pre-1`.
 *
 * The release portion before the first `-` is compared number by number, with a missing number
 * read as 0, so `26.10` is newer than `26.9`. When the release portions are equal, Mojang's
 * publishing order decides: snapshots, then pre-releases (`pre`), then release candidates
 * (`rc`), then the release itself, so `26.4` > `26.4-rc-1` > `26.4-pre-1` > `26.4-snapshot-8`.
 * Two suffixes of one kind compare with their numbers read as numbers, so `snapshot-10` is
 * newer than `snapshot-9`.
 *
 * @param a - A release id.
 * @param b - Another release id.
 * @returns A negative number when `a` is older, positive when it is newer, 0 when equal.
 */
export const compareJavaReleases = (a: string, b: string): number => {
    const left = parseJavaRelease(a);
    const right = parseJavaRelease(b);
    for (let index = 0; index < Math.max(left.numbers.length, right.numbers.length); index++) {
        const difference = (left.numbers[index] ?? 0) - (right.numbers[index] ?? 0);
        if (difference !== 0) return difference;
    }
    const kind = suffixKind(left.suffix) - suffixKind(right.suffix);
    if (kind !== 0) return kind;
    return (left.suffix ?? '').localeCompare(right.suffix ?? '', 'en', { numeric: true });
};

/**
 * Checks the rules `sources.json` places on the `javaServer` section: the default is pinned, at
 * most one entry is a preview, a preview is newer than the default, and every other entry names a
 * pinned Bedrock protocol in `bedrockProtocol`, which the default and the preview leave out.
 *
 * @param data - The `javaServer` section.
 * @param bds - The `bds` section, whose pinned protocols `bedrockProtocol` must name.
 * @throws Error naming the broken rule.
 */
export const validateJavaServerData = (data: JavaServerData, bds: BdsData): void => {
    if (data.versions[data.defaultVersion] === undefined) {
        throw new Error(`sources.json javaServer.defaultVersion ${data.defaultVersion} is not among its versions`);
    }
    const previews = Object.keys(data.versions).filter((release) => data.versions[release]?.preview === true);
    if (previews.length > 1) {
        throw new Error(`sources.json pins more than one Java preview (${previews.join(', ')}); keep one`);
    }
    for (const preview of previews) {
        if (compareJavaReleases(preview, data.defaultVersion) <= 0) {
            throw new Error(
                `sources.json pins Java preview ${preview}, which is not newer than the default ${data.defaultVersion}`
            );
        }
    }
    for (const [release, version] of Object.entries(data.versions)) {
        const derived = release === data.defaultVersion || version.preview === true;
        if (derived && version.bedrockProtocol !== undefined) {
            throw new Error(
                `sources.json Java ${release} sets bedrockProtocol, but the default and the preview pair ` +
                    'with a Bedrock protocol derived from the bds section; remove it'
            );
        }
        if (!derived && version.bedrockProtocol === undefined) {
            throw new Error(
                `sources.json Java ${release} is neither the default nor the preview, so it needs a ` +
                    'bedrockProtocol naming the Bedrock protocol its tables map onto'
            );
        }
        if (version.bedrockProtocol !== undefined && bds.versions[String(version.bedrockProtocol)] === undefined) {
            throw new Error(
                `sources.json Java ${release} pairs with Bedrock protocol ${version.bedrockProtocol}, ` +
                    'which the bds section does not pin'
            );
        }
    }
};

const readManifest = async (manifestPath: string): Promise<SourcesManifest> => {
    // The manifest is parsed JSON, which the compiler cannot see the shape of.
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as SourcesManifest;
    validateJavaServerData(manifest.javaServer, manifest.bds);
    return manifest;
};

/** The `<source>` cache segment the Bedrock Dedicated Server zips live under. */
export const BDS_SOURCE_NAME = 'bds';

/** Reads the `bds` section of `sources.json`. */
export const loadBdsData = async (manifestPath: string): Promise<BdsData> => (await readManifest(manifestPath)).bds;

/**
 * Resolves the protocol version a caller asked for against the manifest,
 * falling back to `defaultProtocolVersion`.
 *
 * @throws Error naming the pinned protocol versions when the requested one is
 * not among them.
 */
export const selectBdsVersion = (
    data: BdsData,
    protocolVersion?: number
): { protocolVersion: number; version: BdsVersion } => {
    const wanted = protocolVersion ?? data.defaultProtocolVersion;
    const version = data.versions[String(wanted)];
    if (version === undefined) {
        const pinned = Object.keys(data.versions).join(', ');
        throw new Error(`sources.json pins no Bedrock Dedicated Server for protocol ${wanted}; pinned: ${pinned}`);
    }
    return { protocolVersion: wanted, version };
};

/**
 * The descriptor for one protocol version's server zip. Each version caches
 * under its own `v<protocol>` directory, so captures of several Bedrock
 * versions can share a cache without re-downloading.
 */
export const bdsDescriptor = (data: BdsData, protocolVersion?: number): SourceDescriptor => {
    const { protocolVersion: resolved, version } = selectBdsVersion(data, protocolVersion);
    return {
        name: BDS_SOURCE_NAME,
        version: `v${resolved}`,
        url: version.url,
        hash: { algorithm: 'sha256', value: version.sha256 },
        unpack: true,
        fileName: `bedrock-server-${version.serverVersion}.zip`,
        envOverride: 'JSP_BDS_PATH'
    };
};

/** The `<source>` cache segment the Java Edition server jars live under. */
export const JAVA_SOURCE_NAME = 'java-server';

/**
 * Reads the `javaServer` section of `sources.json`.
 *
 * @throws Error when the section breaks a rule {@link validateJavaServerData} checks.
 */
export const loadJavaServerData = async (manifestPath: string): Promise<JavaServerData> =>
    (await readManifest(manifestPath)).javaServer;

/**
 * Resolves the Java Edition release a caller asked for against the manifest, falling back to
 * `defaultVersion`.
 *
 * @throws Error naming the pinned releases when the requested one is not among them.
 */
export const selectJavaVersion = (
    data: JavaServerData,
    release?: string
): { release: string; version: JavaVersion } => {
    const wanted = release ?? data.defaultVersion;
    const version = data.versions[wanted];
    if (version === undefined) {
        const pinned = Object.keys(data.versions).join(', ');
        throw new Error(`sources.json pins no Java Edition server for ${wanted}; pinned: ${pinned}`);
    }
    return { release: wanted, version };
};

/**
 * The descriptor for one Java Edition release's server jar, cached as
 * `java-server/<release>/server.jar` and pinned by Mojang's own sha1.
 */
export const javaServerDescriptor = (data: JavaServerData, release?: string): SourceDescriptor => {
    const { release: resolved, version } = selectJavaVersion(data, release);
    return {
        name: JAVA_SOURCE_NAME,
        version: resolved,
        url: version.url,
        hash: { algorithm: 'sha1', value: version.sha1 },
        unpack: false,
        fileName: 'server.jar',
        envOverride: 'JSP_JAVA_JAR_PATH'
    };
};

/**
 * Reads a `--java <release>` argument, as the Java scripts accept it.
 *
 * @throws Error when the flag is present without a release id.
 */
export const parseJavaArgument = (argv: readonly string[]): string | undefined => {
    const index = argv.indexOf('--java');
    if (index < 0) return undefined;
    const value = argv[index + 1];
    if (value === undefined || value === '' || value.startsWith('--'))
        throw new Error('--java needs a Java Edition release id, such as --java 26.3');
    return value;
};

/**
 * Reads a `--protocol <n>` argument, as the fetch scripts accept it.
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

/**
 * Reads `sources.json` and returns one descriptor per version-independent
 * source, each pinned by sha256.
 *
 * The Bedrock Dedicated Server and the Java server jar are not here, because
 * which version to fetch is the caller's choice: use {@link bdsDescriptor} and
 * {@link javaServerDescriptor}.
 */
export const loadSourceDescriptors = async (manifestPath: string): Promise<SourceDescriptor[]> => {
    const manifest = await readManifest(manifestPath);
    return [
        {
            name: 'bedrock-samples',
            version: manifest.bedrockSamples.tag,
            url: manifest.bedrockSamples.url,
            hash: { algorithm: 'sha256', value: manifest.bedrockSamples.sha256 },
            unpack: true,
            fileName: `bedrock-samples-${manifest.bedrockSamples.commit}.zip`,
            envOverride: 'JSP_BEDROCK_SAMPLES_PATH'
        },
        {
            name: 'vanilla-mcdoc',
            version: manifest.vanillaMcdoc.commit,
            url: manifest.vanillaMcdoc.url,
            hash: { algorithm: 'sha256', value: manifest.vanillaMcdoc.sha256 },
            unpack: true,
            fileName: `vanilla-mcdoc-${manifest.vanillaMcdoc.commit}.zip`,
            envOverride: 'JSP_VANILLA_MCDOC_PATH'
        },
        {
            name: 'geyser-mappings',
            version: manifest.geyserMappings.commit,
            url: manifest.geyserMappings.url,
            hash: { algorithm: 'sha256', value: manifest.geyserMappings.sha256 },
            unpack: true,
            fileName: `mappings-${manifest.geyserMappings.commit}.zip`,
            envOverride: 'JSP_GEYSER_MAPPINGS_PATH'
        }
    ];
};
