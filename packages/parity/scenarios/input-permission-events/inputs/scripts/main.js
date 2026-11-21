/**
 * The `inputs` pack of the `input-permission-events` scenario. Once the scenario's client has
 * joined, the pack turns its input permission categories off and on, the same one twice in a row
 * too, and records each `playerInputPermissionCategoryChange` it hears: the category, whether it
 * is enabled, whose it is, and in which step it arrived.
 *
 * Every observation is stamped with tick 0, since when the client joins depends on the network.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { InputPermissionCategory, system, world } from '@minecraft/server';

const PACK = 'inputs';
/** How long the pack waits after the client appears, so it has finished joining. */
const JOIN_TICKS = 20;
let seq = 0;
let step = 'before';

/** Logs one observation, stamped with the pack's sequence number and tick 0. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq, tick: 0, event, ...observed })}`);
};

/** Records what a call returns, or the error it throws. */
const attempt = (event, call) => {
    try {
        const value = call();
        record(event, { value: value === undefined ? 'undefined' : value });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

attempt('subscribe', () => {
    world.afterEvents.playerInputPermissionCategoryChange.subscribe((event) => {
        record('playerInputPermissionCategoryChange', {
            value: {
                step,
                category: event.category,
                enabled: event.enabled,
                player: event.player.typeId,
                playerValid: event.player.isValid
            }
        });
    });
    return 'subscribed';
});

/** The steps, one a tick, each setting one category. */
const STEPS = [
    ['movement off', InputPermissionCategory.Movement, false],
    ['movement off again', InputPermissionCategory.Movement, false],
    ['jump off', InputPermissionCategory.Jump, false],
    ['movement on', InputPermissionCategory.Movement, true],
    ['camera on while on', InputPermissionCategory.Camera, true],
    ['jump on', InputPermissionCategory.Jump, true]
];

const run = (player) => {
    let at = 0;
    const tick = system.runInterval(() => {
        const next = STEPS[at++];
        if (next === undefined) {
            system.clearRun(tick);
            system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 10);
            return;
        }
        const [name, category, enabled] = next;
        step = name;
        attempt(name, () => {
            player.inputPermissions.setPermissionCategory(category, enabled);
            return player.inputPermissions.isPermissionCategoryEnabled(category);
        });
    }, 2);
};

record('ready for the client');
const waiting = system.runInterval(() => {
    const [player] = world.getAllPlayers();
    if (player === undefined) return;
    system.clearRun(waiting);
    system.runTimeout(() => {
        record('client joined');
        run(player);
    }, JOIN_TICKS);
}, 1);
