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

interface SourcesManifest {
    bds: BdsData;
    bedrockSamples: PinnedArchive & { tag: string; commit: string };
    javaServer: PinnedArchive & { version: string; sha1: string };
    geyserMappings: PinnedArchive & { commit: string };
    vanillaMcdoc: PinnedArchive & { commit: string };
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
 * source. The Java server jar is pinned by Mojang's own sha1 (which is also
 * the object name in its URL); everything else by sha256.
 *
 * The Bedrock Dedicated Server is not here, because which protocol version to
 * fetch is the caller's choice: use {@link bdsDescriptor}.
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
