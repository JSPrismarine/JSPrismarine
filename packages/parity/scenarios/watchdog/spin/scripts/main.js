/**
 * The `watchdog` scenario: what a callback that never returns and a caught stack overflow do to a
 * pack. The capture runs BDS with `script-watchdog-enable-shutdown=false`, so neither shuts the
 * server down, and with a short hang threshold, so the hang ends quickly. BDS ends a hang by the
 * wall clock and JSPrismarine by counting steps (ADR 0021), so the record holds no time, only
 * what ran.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';

const PACK = 'spin';
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

world.afterEvents.worldLoad.subscribe(() => {
    system.runTimeout(() => {
        record('before the hang');
        try {
            while (true) {}
        } catch (error) {
            record('the hang was caught', { error: String(error) });
        } finally {
            record('the hang ran its finally block');
        }
        record('after the hang');
    }, 1);
    system.runTimeout(() => record('a task after the hang'), 2);

    system.runTimeout(() => {
        const recurse = () => recurse() + 1;
        attempt('unbounded recursion', recurse);
        record('after the stack overflow');
    }, 3);
    system.runTimeout(() => record('a task after the stack overflow'), 4);
});

system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 20);
