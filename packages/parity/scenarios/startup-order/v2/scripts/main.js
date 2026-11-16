/**
 * The version 2 half of the `startup-order` scenario: a pack on `@minecraft/server` 2.0.0, which
 * runs in early execution and receives `system.beforeEvents.startup` before the world loads.
 *
 * Each callback logs one observation as `DUMP record <json>` on the content log, and the pack
 * logs `DUMP end <json>` once the observed callbacks have all had their chance to run.
 * `packages/parity/src/scripting/record.ts` defines the format. A pack cannot import from the
 * repository, so the `v1` pack repeats the two helpers below.
 */

import { system, world } from '@minecraft/server';

const PACK = 'v2';
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

const overworldId = () => world.getDimension('overworld').id;

record('top-level');
attempt('top-level world.getDimension', overworldId);
Promise.resolve().then(() => record('top-level promise job'));
import('@minecraft/server').then(() => record('top-level dynamic import settled'));
system.run(() => record('top-level system.run'));
system.runTimeout(() => record('top-level system.runTimeout 0'), 0);
system.runTimeout(() => record('top-level system.runTimeout 1'), 1);

system.beforeEvents.startup.subscribe(() => {
    record('system.beforeEvents.startup');
    attempt('startup world.getDimension', overworldId);
    Promise.resolve().then(() => record('startup promise job'));
    system.run(() => record('startup system.run'));
});

world.afterEvents.worldLoad.subscribe(() => {
    record('world.afterEvents.worldLoad');
    attempt('worldLoad world.getDimension', overworldId);
    Promise.resolve().then(() => record('worldLoad promise job'));
    system.run(() => record('worldLoad system.run'));
});

system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 20);
