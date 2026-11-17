/**
 * The `terminate` pack of the `watchdog-terminate` scenario. With watchdog shutdown on, a hang and
 * a caught stack overflow each raise `system.beforeEvents.watchdogTerminate`, a beta event, and the
 * pack cancels both, so the server keeps running and so does the pack.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system } from '@minecraft/server';

const PACK = 'terminate';
let seq = 0;

/** Logs one observation, stamped with the pack's sequence number and the current tick. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick, event, ...observed })}`);
};

system.beforeEvents.watchdogTerminate.subscribe((event) => {
    record('system.beforeEvents.watchdogTerminate', { value: event.terminateReason });
    event.cancel = true;
});

system.runTimeout(() => {
    record('hang');
    while (true) {}
}, 1);

system.runTimeout(() => {
    const recurse = () => recurse() + 1;
    try {
        recurse();
    } catch (error) {
        record('caught', { error: String(error) });
    }
}, 2);

system.runTimeout(() => record('still running'), 3);

system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 20);
