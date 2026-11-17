/**
 * The version 1 half of the `module-resolution` scenario: a pack that declares
 * `@minecraft/server` 1.3.0, which BDS serves the newest 1.x to.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';

const PACK = 'v1';
let seq = 0;

/** Logs one observation, stamped with the pack's sequence number and the current tick. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick, event, ...observed })}`);
};

/** Logs what a call returned, or what it threw. */
const attempt = (event, call) => {
    try {
        record(event, { value: call() });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

// 1.19.0 is the newest 1.x and still has worldInitialize; 1.3.0 had no beforeEvents.
attempt('typeof world.afterEvents.worldInitialize', () => typeof world.afterEvents.worldInitialize);
attempt('typeof world.beforeEvents', () => typeof world.beforeEvents);
attempt('typeof world.getPackSettings', () => typeof world.getPackSettings);
attempt('typeof system.beforeEvents', () => typeof system.beforeEvents);

system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 20);
