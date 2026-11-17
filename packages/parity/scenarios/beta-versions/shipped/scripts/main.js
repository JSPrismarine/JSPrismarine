/**
 * The `shipped` pack of the `beta-versions` scenario. It declares `@minecraft/server` 2.11.0-beta, the beta the pinned server ships.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import * as server from '@minecraft/server';
import { system, world } from '@minecraft/server';

const PACK = 'shipped';
let seq = 0;

/** Logs one observation, stamped with the pack's sequence number and the current tick. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick, event, ...observed })}`);
};

record('@minecraft/server exports', { value: Object.keys(server).length });
// Both are beta only in the pinned server, so a pack that sees them was served the beta.
record("'chatSend' in world.beforeEvents", { value: 'chatSend' in world.beforeEvents });
record("'watchdogTerminate' in system.beforeEvents", { value: 'watchdogTerminate' in system.beforeEvents });

system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 20);
