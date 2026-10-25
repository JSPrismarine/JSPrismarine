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
}

interface PinnedArchive {
    url: string;
    sha256: string;
}

interface SourcesManifest {
    bds: PinnedArchive & { version: string };
    bedrockSamples: PinnedArchive & { tag: string; commit: string };
    javaServer: PinnedArchive & { version: string; sha1: string };
    geyserMappings: PinnedArchive & { commit: string };
    vanillaMcdoc: PinnedArchive & { commit: string };
    cloudburstData: { repo: string; commit: string; path: string };
}

/**
 * Reads `sources.json` and returns one descriptor per fetched source. The
 * Java server jar is pinned by Mojang's own sha1 (which is also the object
 * name in its URL); everything else by sha256. The CloudburstMC entry is a
 * cross-reference to the Git submodule, not a download, so it has no
 * descriptor.
 */
export const loadSourceDescriptors = async (manifestPath: string): Promise<SourceDescriptor[]> => {
    // The manifest is parsed JSON, which the compiler cannot see the shape of.
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as SourcesManifest;
    return [
        {
            name: 'bds',
            version: manifest.bds.version,
            url: manifest.bds.url,
            hash: { algorithm: 'sha256', value: manifest.bds.sha256 },
            unpack: true,
            fileName: `bedrock-server-${manifest.bds.version}.zip`,
            envOverride: 'JSP_BDS_PATH'
        },
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
