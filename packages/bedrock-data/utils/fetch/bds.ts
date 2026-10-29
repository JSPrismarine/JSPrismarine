/**
 * Where the unpacked Bedrock Dedicated Server for a protocol version is.
 *
 * `fetch:sources` unpacks the pinned zip into the shared fetch cache, and
 * several things downstream read it back: the Bedrock capture in
 * `utils/bedrock-dump/run.ts`, `packages/minecraft/datagen`, and the suites
 * that run against real game data. They used to each spell the cache path out,
 * which is how the writer and a reader came to disagree about whether the
 * directory was keyed by protocol version or by server build. They ask here
 * instead, so the layout is decided once.
 */
import { join } from 'node:path';

import { cacheRoot, packageDir } from './cloudburst.ts';
import { sourceCachePath } from './fetch.ts';
import { bdsDescriptor, loadBdsData } from './manifest.ts';

/** The environment variable that points at a server the fetch did not place. */
export const BDS_PATH_OVERRIDE = 'JSP_BDS_PATH';

/**
 * Resolves the unpacked server directory for one protocol version.
 *
 * `JSP_BDS_PATH` wins when it is set and non-empty, for a server the fetch did
 * not place.
 *
 * @param protocolVersion - Protocol to resolve. Defaults to the manifest's
 *   `defaultProtocolVersion`.
 * @param env - Environment to read the override from. Defaults to `process.env`.
 * @throws Error naming the pinned versions when the protocol is not pinned.
 */
export const bedrockServerPath = async (
    protocolVersion?: number,
    env: Record<string, string | undefined> = process.env
): Promise<string> => {
    const override = env[BDS_PATH_OVERRIDE];
    if (override !== undefined && override !== '') return override;

    const data = await loadBdsData(join(packageDir, 'sources.json'));
    return sourceCachePath(bdsDescriptor(data, protocolVersion), cacheRoot);
};
