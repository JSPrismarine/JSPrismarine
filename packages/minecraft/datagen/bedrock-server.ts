/**
 * Where the generators read an unpacked Bedrock Dedicated Server from.
 *
 * The fetch that unpacks the server owns the cache layout, so this re-exports that
 * package's answer rather than spelling the path out a second time. The two used to be
 * written out separately, and when the fetch started keying the directory by protocol
 * version instead of by server build, the recipe generator kept looking in the old place.
 *
 * This is workspace tooling and reaches another package's tooling by path. It is kept
 * out of `paths.ts` on purpose: that module is imported by packages whose TypeScript
 * configuration does not resolve `.ts` imports, and nothing but the generators needs a
 * Bedrock server. It is absent from the published package, which ships `dist` without
 * `datagen`.
 */
import { bedrockServerPath } from '../../bedrock-data/utils/fetch/bds.ts';

import { defaultProtocolVersion } from './paths.ts';

/**
 * The unpacked Bedrock Dedicated Server for one protocol version.
 *
 * `pnpm --filter @jsprismarine/bedrock-data run fetch:sources --protocol <n>` puts it
 * there. `JSP_BDS_PATH` points at a server the fetch did not place.
 *
 * @param protocol - A protocol version `sources.json` pins. Defaults to the datagen
 *   manifest's `defaultProtocolVersion`.
 * @param env - Environment to read `JSP_BDS_PATH` from. Defaults to `process.env`.
 * @throws If `sources.json` pins no server for that protocol version.
 */
export const bedrockServerCachePath = async (
    protocol: number = defaultProtocolVersion,
    env?: Record<string, string | undefined>
): Promise<string> => await bedrockServerPath(protocol, env);
