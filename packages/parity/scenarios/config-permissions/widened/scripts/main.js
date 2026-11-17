/**
 * The `widened` pack of the `config-permissions` scenario. BDS reads `config/default/permissions.json`
 * for every pack and `config/<script module uuid>/permissions.json` for one pack, and refuses to
 * load a pack that declares a module neither allows it. A pack it refuses runs no line, so only
 * the packs it loads record anything.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system } from '@minecraft/server';

const PACK = 'widened';
let seq = 0;

/** Logs one observation, stamped with the pack's sequence number and the current tick. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick, event, ...observed })}`);
};

record('loaded');

system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 20);
