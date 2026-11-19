/**
 * The `world-event-gaps` scenario: whether a script can subscribe to the world events whose game
 * systems JSPrismarine lacks, and read the registries `startup` hands it for them. Each attempt
 * records what it returned or what it threw.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';

const PACK = 'gaps';
let seq = 0;

/** Logs one observation, stamped with the pack's sequence number. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq, tick: 0, event, ...observed })}`);
};

/** Logs what a call returned, or what it threw. */
const attempt = (event, call) => {
    try {
        record(event, { value: call() });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

const className = (value) => (value === undefined ? 'undefined' : value.constructor.name);

system.beforeEvents.startup.subscribe((event) => {
    attempt('startup dimensionRegistry', () => className(event.dimensionRegistry));
    attempt('startup worldClockRegistry', () => className(event.worldClockRegistry));
});

world.afterEvents.worldLoad.subscribe(() => {
    const after = [
        'worldClockOnPaused',
        'worldClockOnResumed',
        'worldClockOnTimeMarker',
        'worldClockOnTimeModified',
        'packSettingChange',
        'soundCompleted',
        'tripWireTrip',
        'targetBlockHit',
        'playerInputPermissionCategoryChange',
        'entityUpgrade'
    ];
    for (const name of after) {
        attempt(`subscribe afterEvents.${name}`, () => typeof world.afterEvents[name].subscribe(() => {}));
    }
    attempt(
        'subscribe beforeEvents.worldClockOnRestart',
        () => typeof world.beforeEvents.worldClockOnRestart.subscribe(() => {})
    );
    console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`);
});
