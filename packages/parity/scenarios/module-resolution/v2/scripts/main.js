/**
 * The version 2 half of the `module-resolution` scenario: a pack that declares
 * `@minecraft/server` 2.0.0 and `@minecraft/server-ui` 2.0.0. It records which version of each
 * module it got, what a relative import loads, and what a dynamic import of a module its manifest
 * does not declare does.
 *
 * `@jsprismarine/server` is the one import that differs on purpose: BDS rejects it, as it rejects
 * every undeclared module, and JSPrismarine resolves it, so a pack can detect JSPrismarine and
 * fall back on BDS (ADR 0020). The scenario declares that difference for its row.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';
import * as ui from '@minecraft/server-ui';

import { helperValue } from './helper.js';

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

/** Logs how a dynamic import settled. */
const importing = (name) =>
    import(name).then(
        () => record(`import ${name}`, { value: 'resolved' }),
        (error) => record(`import ${name}`, { error: String(error) })
    );

// 2.8.0 added getPackSettings, so a 2.0.0 pack that sees it was served a newer 2.x.
attempt('typeof world.getPackSettings', () => typeof world.getPackSettings);
// 2.0.0 removed worldInitialize.
attempt('typeof world.afterEvents.worldInitialize', () => typeof world.afterEvents.worldInitialize);
attempt('typeof system.beforeEvents.startup', () => typeof system.beforeEvents.startup);
attempt('@minecraft/server-ui exports', () => Object.keys(ui).sort());
attempt('relative import', () => helperValue);

world.afterEvents.worldLoad.subscribe(() => {
    importing('@minecraft/server')
        .then(() => importing('@minecraft/server-net'))
        .then(() => importing('@minecraft/server-gametest'))
        .then(() => importing('@jsprismarine/server'))
        .then(() => importing('./helper.js'));
});

system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 20);
