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
