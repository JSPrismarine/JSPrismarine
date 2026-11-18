/**
 * Where `fetch:sources` caches the pinned upstream sources, by the folder names it gives them.
 *
 * The fetch cache can hold several versions of one source: every pinned Bedrock Dedicated Server
 * caches under `bds/v<protocol>/`, and a bumped `bedrock-samples` pin lands beside the old one. A
 * reader that takes the first folder it lists runs on whichever version the file system lists
 * first. These name the folder of the version `sources.json` pins as the default, so a reader
 * can prefer it.
 */
import sources from '../sources.json' with { type: 'json' };

/** The `bds/` cache folder of the default Bedrock Dedicated Server, such as `v2225`. */
export const defaultBdsCacheFolder: string = `v${sources.bds.defaultProtocolVersion}`;

/** The `bedrock-samples/` cache folder of the pinned `Mojang/bedrock-samples` release. */
export const bedrockSamplesCacheFolder: string = sources.bedrockSamples.tag;

/**
 * The Java Edition release `sources.json` pins, such as `26.3`, which names its folder under
 * `java-server/`, `vanilla-datapack/` and `java-reports/`.
 */
export const javaServerCacheFolder: string = sources.javaServer.version;
