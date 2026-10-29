/**
 * Fetches the pinned CloudburstMC/Data dump for one Bedrock protocol version
 * and links it to `src/resources`, which is what the generators and the
 * parity goldens read.
 *
 * Run as `pnpm --filter @jsprismarine/bedrock-data run fetch:cloudburst`, with
 * `--protocol <n>` to pick a version other than the manifest default.
 * `JSP_CLOUDBURST_DATA_PATH` points at a local checkout for offline work.
 */
import { ensureCloudburstData, linkResources, parseProtocolArgument, resourcesLink } from './cloudburst.ts';

const resolved = await ensureCloudburstData(parseProtocolArgument(process.argv));
const state = resolved.fromOverride ? 'override' : resolved.fromCache ? 'cached' : 'downloaded';
console.log(
    `cloudburst-data protocol ${resolved.protocolVersion} (Minecraft ${resolved.minecraftVersion}): ` +
        `${state} (${resolved.path})`
);

const linked = await linkResources(resolved.path);
console.log(`${resourcesLink}: ${linked}`);
