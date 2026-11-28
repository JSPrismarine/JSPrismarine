/**
 * The `pack-dimensions` scenario: the custom dimensions a behavior pack defines in
 * `dimensions/*.json`. One document sets every component, the others leave out all of them, all
 * but the generator or all but the height, and the script registers the first one's id from
 * `startup` too, which the document then replaces.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';

const PACK = 'dimensions';
let seq = 0;

/** Logs one observation, stamped with the pack's sequence number and the tick. */
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

/** A dimension's id and height range. */
const describe = (id) => {
    const dimension = world.getDimension(id);
    const { min, max } = dimension.heightRange;
    return { id: dimension.id, min, max };
};

system.beforeEvents.startup.subscribe((event) => {
    attempt('register the pack dimension from a script', () =>
        event.dimensionRegistry.registerCustomDimension('jsp:pack_void')
    );
});

world.afterEvents.worldLoad.subscribe(() => {
    attempt('pack dimension', () => describe('jsp:pack_void'));
    attempt('pack dimension with no components', () => describe('jsp:pack_defaults'));
    attempt('pack dimension with only a generator', () => describe('jsp:pack_generation_only'));
    attempt('pack dimension with only a height', () => describe('jsp:pack_height_only'));
    attempt('pack dimension without the namespace', () => world.getDimension('pack_void').id);
    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 5);
});
