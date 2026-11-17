/**
 * The `v1beta` pack of the `beta-versions` scenario. It declares `@minecraft/server` 1.17.0-beta, a beta of the first major version, so BDS reaches it with the version 1 packs. BDS refuses it, so it records nothing, and the content log says why.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system } from '@minecraft/server';

const PACK = 'v1beta';
let seq = 0;

/** Logs one observation, stamped with the pack's sequence number and the current tick. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick, event, ...observed })}`);
};

record('loaded');

system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 20);
