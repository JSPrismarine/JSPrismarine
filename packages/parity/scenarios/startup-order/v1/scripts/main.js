/**
 * The version 1 half of the `startup-order` scenario: a pack on `@minecraft/server` 1.0.0, which
 * BDS serves the newest 1.x to. It starts after the world loads and receives `worldInitialize`
 * where a version 2 pack receives `startup` and `worldLoad`.
 *
 * Each callback logs one observation as `DUMP record <json>` on the content log, and the pack
 * logs `DUMP end <json>` once the observed callbacks have all had their chance to run.
 * `packages/parity/src/scripting/record.ts` defines the format. A pack cannot import from the
 * repository, so the `v2` pack repeats the two helpers below.
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

const overworldId = () => world.getDimension('overworld').id;

record('top-level');
attempt('top-level world.getDimension', overworldId);
Promise.resolve().then(() => record('top-level promise job'));
system.run(() => record('top-level system.run'));
system.runTimeout(() => record('top-level system.runTimeout 0'), 0);
system.runTimeout(() => record('top-level system.runTimeout 1'), 1);

world.beforeEvents.worldInitialize.subscribe(() => {
    record('world.beforeEvents.worldInitialize');
    Promise.resolve().then(() => record('beforeEvents.worldInitialize promise job'));
    attempt('beforeEvents.worldInitialize queue system.run', () => {
        system.run(() => record('beforeEvents.worldInitialize system.run'));
    });
});

world.afterEvents.worldInitialize.subscribe(() => {
    record('world.afterEvents.worldInitialize');
    attempt('afterEvents.worldInitialize world.getDimension', overworldId);
    Promise.resolve().then(() => record('afterEvents.worldInitialize promise job'));
    system.run(() => record('afterEvents.worldInitialize system.run'));
});

system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 20);
