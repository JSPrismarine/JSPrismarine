/**
 * The `privileges` scenario: what a version 2 pack may call in early execution, at its top level
 * and in `system.beforeEvents.startup`, and what it may call once the world has loaded. Each
 * member's metadata lists the privileges it allows, and BDS refuses the rest with a fixed message.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';

const PACK = 'early';
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

/** The same calls, made under whatever privilege the caller runs with. */
const probe = (when) => {
    attempt(`${when} world.sendMessage`, () => world.sendMessage('probe'));
    attempt(`${when} world.getAllPlayers`, () => world.getAllPlayers().length);
    attempt(`${when} world.gameRules`, () => typeof world.gameRules);
    attempt(`${when} system.currentTick`, () => typeof system.currentTick);
    attempt(`${when} system.run`, () => typeof system.run(() => {}));
    attempt(`${when} world.afterEvents`, () => typeof world.afterEvents);
};

probe('top level');
system.beforeEvents.startup.subscribe(() => probe('startup'));
world.afterEvents.worldLoad.subscribe(() => probe('worldLoad'));

system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 20);
