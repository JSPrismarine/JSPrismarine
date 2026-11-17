/**
 * The second pack of the `contexts` scenario: it reads what the first pack wrote to its own
 * global object and built-ins, which a context of its own does not show.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';

const PACK = 'second';
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

attempt('the first pack global', () => typeof globalThis.writtenByFirst);
attempt('the first pack built-in member', () => typeof [].writtenByFirst);

world.afterEvents.worldLoad.subscribe(() => {
    attempt('the first pack global at worldLoad', () => typeof globalThis.writtenByFirst);
});

system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 20);
