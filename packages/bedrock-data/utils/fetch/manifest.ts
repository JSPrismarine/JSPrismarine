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
}

/** The `bds` section: one server zip per Bedrock protocol version. */
export interface BdsData {
    /** The protocol version used when a caller does not ask for one. */
    defaultProtocolVersion: number;
    /** Pinned zips keyed by protocol version, as decimal strings. */
    versions: Record<string, BdsVersion>;
}

/** One pinned CloudburstMC/Data archive: the game data for a single protocol version. */
export interface CloudburstVersion extends PinnedArchive {
    /** The Minecraft version the dump was taken from, such as `1.26.51`. */
    minecraftVersion: string;
    commit: string;
}

/** The `cloudburstData` section: one archive per Bedrock protocol version. */
export interface CloudburstData {
    repo: string;
    /** The protocol version used when a caller does not ask for one. */
    defaultProtocolVersion: number;
    /** The files the fetch unpacks, by name at the archive root. */
    extract: string[];
    /** Pinned archives keyed by protocol version, as decimal strings. */
    versions: Record<string, CloudburstVersion>;
}

interface SourcesManifest {
    bds: BdsData;
    bedrockSamples: PinnedArchive & { tag: string; commit: string };
    javaServer: PinnedArchive & { version: string; sha1: string };
    geyserMappings: PinnedArchive & { commit: string };
    vanillaMcdoc: PinnedArchive & { commit: string };
    cloudburstData: CloudburstData;
}

const readManifest = async (manifestPath: string): Promise<SourcesManifest> =>
    // The manifest is parsed JSON, which the compiler cannot see the shape of.
    JSON.parse(await readFile(manifestPath, 'utf8')) as SourcesManifest;

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

/** The `<source>` cache segment the CloudburstMC/Data archives live under. */
export const CLOUDBURST_SOURCE_NAME = 'cloudburst-data';

/** Reads the `cloudburstData` section of `sources.json`. */
export const loadCloudburstData = async (manifestPath: string): Promise<CloudburstData> =>
    (await readManifest(manifestPath)).cloudburstData;

/**
 * Resolves the protocol version a caller asked for against the manifest,
 * falling back to `defaultProtocolVersion`.
 *
 * @throws Error naming the pinned protocol versions when the requested one is
 * not among them.
 */
export const selectCloudburstVersion = (
    data: CloudburstData,
    protocolVersion?: number
): { protocolVersion: number; version: CloudburstVersion } => {
    const wanted = protocolVersion ?? data.defaultProtocolVersion;
    const version = data.versions[String(wanted)];
    if (version === undefined) {
        const pinned = Object.keys(data.versions).join(', ');
        throw new Error(`sources.json pins no CloudburstMC/Data archive for protocol ${wanted}; pinned: ${pinned}`);
    }
    return { protocolVersion: wanted, version };
};

/**
 * The descriptor for one protocol version's CloudburstMC/Data archive. Each
 * version caches under its own `v<protocol>` directory, so several Bedrock
 * versions' data coexist without colliding.
 */
export const cloudburstDescriptor = (data: CloudburstData, protocolVersion?: number): SourceDescriptor => {
    const { protocolVersion: resolved, version } = selectCloudburstVersion(data, protocolVersion);
    return {
        name: CLOUDBURST_SOURCE_NAME,
        version: `v${resolved}`,
        url: version.url,
        hash: { algorithm: 'sha256', value: version.sha256 },
        unpack: true,
        fileName: `Data-${version.commit}.zip`,
        envOverride: 'JSP_CLOUDBURST_DATA_PATH',
        extract: data.extract
    };
};

/**
 * Reads `sources.json` and returns one descriptor per version-independent
 * source. The Java server jar is pinned by Mojang's own sha1 (which is also
 * the object name in its URL); everything else by sha256.
 *
 * The two per-protocol sources are not here, because which version to fetch
 * is the caller's choice: use {@link bdsDescriptor} and
 * {@link cloudburstDescriptor}.
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
            name: 'java-server',
            version: manifest.javaServer.version,
            url: manifest.javaServer.url,
            hash: { algorithm: 'sha1', value: manifest.javaServer.sha1 },
            unpack: false,
            fileName: 'server.jar',
            envOverride: 'JSP_JAVA_JAR_PATH'
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
