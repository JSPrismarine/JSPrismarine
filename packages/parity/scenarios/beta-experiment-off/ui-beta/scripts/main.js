/**
 * The `ui-beta` pack of the `beta-experiment-off` scenario. It declares a stable `@minecraft/server` and `@minecraft/server-ui` 2.3.0-beta in a world without the Beta APIs experiment. BDS refuses it, so it records nothing, and the content log says why.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system } from '@minecraft/server';

const PACK = 'ui-beta';
let seq = 0;

/** Logs one observation, stamped with the pack's sequence number and the current tick. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick, event, ...observed })}`);
};

record('loaded');

system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 20);
