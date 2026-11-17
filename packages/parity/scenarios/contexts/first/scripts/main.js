/**
 * The first pack of the `contexts` scenario. BDS gives each pack a script context of its own, so
 * what this pack writes to its global object, and to the built-ins it shares a name with, the
 * second pack must not see. It also records what `Math.random` and `Date` give a script, which
 * JSPrismarine seeds and feeds as inputs rather than reading the host.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';

const PACK = 'first';
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

globalThis.writtenByFirst = 'first';
Array.prototype.writtenByFirst = 'first';
attempt('own global', () => globalThis.writtenByFirst);

world.afterEvents.worldLoad.subscribe(() => {
    attempt('Math.random is a number in [0, 1)', () => {
        const value = Math.random();
        return typeof value === 'number' && value >= 0 && value < 1;
    });
    attempt('Date.now is a whole number', () => Number.isInteger(Date.now()));
    attempt('new Date is a Date', () => new Date() instanceof Date);
    attempt('Date called as a function is a string', () => typeof Date());
    attempt('Date with an argument keeps it', () => new Date(0).toISOString());
});

system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 20);
