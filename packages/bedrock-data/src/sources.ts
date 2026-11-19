/**
 * Where `fetch:sources` caches the pinned upstream sources, by the folder names it gives them.
 *
 * The fetch cache can hold several versions of one source: every pinned Bedrock Dedicated Server
 * caches under `bds/v<protocol>/`, and a bumped `bedrock-samples` pin lands beside the old one. A
 * reader that takes the first folder it lists runs on whichever version the file system lists
 * first. These name the folder of the version `sources.json` pins as the default, so a reader
 * can prefer it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import sources from '../sources.json' with { type: 'json' };

/** The `bds/` cache folder of the default Bedrock Dedicated Server, such as `v2225`. */
export const defaultBdsCacheFolder: string = `v${sources.bds.defaultProtocolVersion}`;

/** The `bedrock-samples/` cache folder of the pinned `Mojang/bedrock-samples` release. */
export const bedrockSamplesCacheFolder: string = sources.bedrockSamples.tag;

/**
 * The default Java Edition release `sources.json` pins, such as `26.3`, which names its folder
 * under `java-server/`, `vanilla-datapack/` and `java-reports/`.
 */
export const javaServerCacheFolder: string = sources.javaServer.defaultVersion;

/**
 * Every Java Edition release `sources.json` pins, the default and any preview, in manifest order.
 * The server runs one of these; `content-java-version` in its config picks which.
 */
export const pinnedJavaReleases: readonly string[] = Object.keys(sources.javaServer.versions);

/** One (Java release, Bedrock protocol) pair that mapping and item tables are generated for. */
export interface JavaBedrockPair {
    /** The Java Edition release id, the name of the tables' release directory. */
    java: string;
    /** The Bedrock protocol whose capture the tables map onto. */
    protocol: number;
}

/** The parts of `sources.json` a pair is derived from. */
export interface PairedSources {
    readonly bds: {
        readonly defaultProtocolVersion: number;
        readonly versions: Readonly<Record<string, { readonly url: string; readonly preview?: boolean }>>;
    };
    readonly javaServer: {
        readonly defaultVersion: string;
        readonly versions: Readonly<
            Record<string, { readonly url: string; readonly preview?: boolean; readonly bedrockProtocol?: number }>
        >;
    };
}

/**
 * The (Java release, Bedrock protocol) pairs the manifest implies. Mojang ships one game drop to
 * both editions, so the default Java release pairs with `bds.defaultProtocolVersion` and a Java
 * preview pairs with the Bedrock preview. A Java preview pinned before its Bedrock counterpart
 * pairs with the default protocol, and its new identifiers show up as mapping losses until the
 * Bedrock preview is pinned. A Bedrock preview with no Java preview pairs with nothing.
 *
 * Any other pinned release, such as a release brought up before it becomes the default, pairs
 * with the protocol its entry names in `bedrockProtocol`. Which Bedrock drop matches it is a
 * maintainer's call, so it is declared rather than derived; loading the manifest fails when such
 * an entry lacks one.
 *
 * @param manifest - The `bds` and `javaServer` sections of `sources.json`.
 * @returns The default pair first, then the preview pair when a Java preview is pinned, then each
 * other release that declares `bedrockProtocol`, in manifest order.
 */
export const javaBedrockPairs = (manifest: PairedSources): JavaBedrockPair[] => {
    const { bds, javaServer } = manifest;
    const pairs: JavaBedrockPair[] = [{ java: javaServer.defaultVersion, protocol: bds.defaultProtocolVersion }];
    const javaPreview = Object.keys(javaServer.versions).find((release) => javaServer.versions[release]?.preview);
    if (javaPreview !== undefined) {
        const bedrockPreview = Object.keys(bds.versions).find((protocol) => bds.versions[protocol]?.preview);
        pairs.push({
            java: javaPreview,
            protocol: bedrockPreview === undefined ? bds.defaultProtocolVersion : Number(bedrockPreview)
        });
    }
    for (const [release, entry] of Object.entries(javaServer.versions)) {
        if (release === javaServer.defaultVersion || release === javaPreview) continue;
        if (entry.bedrockProtocol !== undefined) pairs.push({ java: release, protocol: entry.bedrockProtocol });
    }
    return pairs;
};

/**
 * The (Java release, Bedrock protocol) pair the mapping and item tables of one Java release are
 * generated for, as {@link javaBedrockPairs} derives it from `sources.json`: the default release with
 * the default protocol, a Java preview with the Bedrock preview or, lacking one, the default
 * protocol, and any other release with the `bedrockProtocol` its entry declares.
 *
 * @param release - A Java release id, such as the value of `--java`. Defaults to
 * {@link javaServerCacheFolder}.
 * @returns The pair, or `undefined` when `sources.json` pins no such release.
 */
export const javaBedrockPair = (release: string = javaServerCacheFolder): JavaBedrockPair | undefined =>
    javaBedrockPairs(sources).find((pair) => pair.java === release);

/** The file `datagen:java` writes beside a generated datapack's `pack.mcmeta`. */
export const GENERATED_JAVA_VERSION_FILE = 'version.json';

/** What the server jar a datapack was generated from declares about its release. */
export interface GeneratedJavaVersion {
    /** The release id, such as `26.3` or `26.4-snapshot-8`. */
    readonly release: string;
    /** The lowest JDK feature release that runs the jar. */
    readonly javaVersion: number;
    /** The data pack format as `[major, minor]`, which a datapack must declare to load. */
    readonly dataPackFormat: readonly [number, number];
    /** The world data version a save written by this release records. */
    readonly dataVersion: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Reads the `version.json` that `datagen:java` writes into a generated vanilla datapack, such as
 * `node_modules/.cache/jsprismarine/vanilla-datapack/26.3/`.
 *
 * @param datapackDir - The datapack root, the directory holding `pack.mcmeta`.
 * @returns The release record, or `undefined` when the file is missing or not in this shape, as
 * in a cache generated before the file existed; `ensure:worldgen` fills it in.
 */
export const readGeneratedJavaVersion = (datapackDir: string): GeneratedJavaVersion | undefined => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(readFileSync(join(datapackDir, GENERATED_JAVA_VERSION_FILE), 'utf8'));
    } catch {
        return undefined;
    }
    if (!isRecord(parsed)) return undefined;
    const { release, javaVersion, dataPackFormat, dataVersion } = parsed;
    if (typeof release !== 'string' || typeof javaVersion !== 'number' || typeof dataVersion !== 'number')
        return undefined;
    if (!Array.isArray(dataPackFormat) || dataPackFormat.length !== 2) return undefined;
    const [major, minor]: unknown[] = dataPackFormat;
    if (typeof major !== 'number' || typeof minor !== 'number') return undefined;
    return { release, javaVersion, dataPackFormat: [major, minor], dataVersion };
};
