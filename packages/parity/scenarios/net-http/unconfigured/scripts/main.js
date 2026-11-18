/**
 * The `unconfigured` pack of the `net-http` scenario. BDS's shipped `config/default/permissions.json`
 * leaves `@minecraft/server-net` out, so BDS refuses a pack that declares it without a config
 * folder of its own, and this line never runs.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system } from '@minecraft/server';

const PACK = 'unconfigured';

console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq: 1, tick: system.currentTick, event: 'loaded' })}`);
console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: 1 })}`);
