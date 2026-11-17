/**
 * The `older` pack of the `beta-versions` scenario. It declares `@minecraft/server` 2.9.0-beta, an older beta than the pinned server ships. BDS refuses it, so it records nothing, and the content log says why.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system } from '@minecraft/server';

const PACK = 'older';
let seq = 0;

/** Logs one observation, stamped with the pack's sequence number and the current tick. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick, event, ...observed })}`);
};

record('loaded');

system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 20);
