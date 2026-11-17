/**
 * The `blocks` scenario: reading blocks of the flat world, whose grass is at y -61, and setting
 * them by type and by permutation. Everything runs once the chunk at the origin has loaded.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { Block, BlockPermutation, system, world } from '@minecraft/server';

const PACK = 'blocks';
let seq = 0;
let start = 0;

/** Logs one observation, stamped with the pack's sequence number and the tick since the chunks loaded. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(
        `DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick - start, event, ...observed })}`
    );
};

/** Logs what a call returned, or what it threw. */
const attempt = (event, call) => {
    try {
        record(event, { value: call() });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

/** A vector as plain data, which the record can hold. */
const vector = ({ x, y, z }) => ({ x, y, z });

/**
 * Runs `run` once the chunk at the origin is loaded. With no player, BDS loads no chunk, so the
 * pack adds a ticking area over it first. Ticks are counted from the tick `run` starts.
 */
const whenLoaded = (run) => {
    world.afterEvents.worldLoad.subscribe(() => {
        const overworld = world.getDimension('overworld');
        try {
            overworld.runCommand('tickingarea add -16 0 -16 15 0 15 jsp_scenario');
        } catch {
            // A world that loads its spawn chunks without one, as JSPrismarine's does, may refuse it.
        }
        const waiting = system.runInterval(() => {
            let loaded = false;
            try {
                loaded = overworld.getBlock({ x: 0, y: -61, z: 0 }) !== undefined;
            } catch {
                // Not loaded yet.
            }
            if (!loaded) return;
            system.clearRun(waiting);
            start = system.currentTick;
            run();
        }, 1);
    });
};

/** What the record keeps of a permutation: its type and its states, sorted by name. */
const permutation = (value) => ({
    type: value.type.id,
    states: Object.fromEntries(Object.entries(value.getAllStates()).sort(([a], [b]) => (a < b ? -1 : 1)))
});

whenLoaded(() => {
    const overworld = world.getDimension('overworld');
    const grass = overworld.getBlock({ x: 0, y: -61, z: 0 });
    attempt('a Block instance', () => grass instanceof Block);
    attempt('typeId', () => grass.typeId);
    attempt('location', () => vector(grass.location));
    attempt('location of a fractional position', () =>
        vector(overworld.getBlock({ x: 1.7, y: -61.2, z: -0.5 }).location)
    );
    attempt('dimension', () => grass.dimension.id);
    attempt('dimension is the same object', () => grass.dimension === overworld);
    attempt('permutation', () => permutation(grass.permutation));
    attempt('permutation is a BlockPermutation', () => grass.permutation instanceof BlockPermutation);
    attempt('air above', () => overworld.getBlock({ x: 0, y: -60, z: 0 }).typeId);
    attempt('bedrock below', () => overworld.getBlock({ x: 0, y: -64, z: 0 }).typeId);
    attempt('the same Block object', () => overworld.getBlock({ x: 0, y: -61, z: 0 }) === grass);
    attempt('getBlock in an unloaded chunk', () => overworld.getBlock({ x: 100000, y: 0, z: 100000 }) === undefined);
    attempt('getBlock above the world', () => overworld.getBlock({ x: 0, y: 320, z: 0 }).typeId);
    attempt('getBlock below the world', () => overworld.getBlock({ x: 0, y: -65, z: 0 }).typeId);

    attempt('setType', () => grass.setType('minecraft:stone'));
    attempt('typeId after setType', () => grass.typeId);
    attempt('getBlock after setType', () => overworld.getBlock({ x: 0, y: -61, z: 0 }).typeId);
    attempt('setType without a namespace', () => {
        grass.setType('dirt');
        return grass.typeId;
    });
    attempt('setType an unknown type', () => grass.setType('minecraft:jsp_no_such_block'));

    attempt('BlockPermutation.resolve', () => permutation(BlockPermutation.resolve('minecraft:oak_log')));
    attempt('BlockPermutation.resolve with states', () =>
        permutation(BlockPermutation.resolve('minecraft:oak_log', { pillar_axis: 'x' }))
    );
    attempt('BlockPermutation.resolve without a namespace', () => permutation(BlockPermutation.resolve('stone')));
    attempt('BlockPermutation.resolve an unknown type', () => BlockPermutation.resolve('minecraft:jsp_no_such_block'));
    attempt('BlockPermutation.resolve an unknown state', () =>
        BlockPermutation.resolve('minecraft:oak_log', { jsp_no_such_state: 1 })
    );
    attempt('BlockPermutation.resolve a bad state value', () =>
        permutation(BlockPermutation.resolve('minecraft:oak_log', { pillar_axis: 'w' }))
    );
    attempt('getState', () =>
        BlockPermutation.resolve('minecraft:oak_log', { pillar_axis: 'z' }).getState('pillar_axis')
    );
    attempt(
        'getState of a state it lacks',
        () => BlockPermutation.resolve('minecraft:stone').getState('pillar_axis') === undefined
    );
    attempt('setPermutation', () =>
        grass.setPermutation(BlockPermutation.resolve('minecraft:oak_log', { pillar_axis: 'x' }))
    );
    attempt('permutation after setPermutation', () => permutation(grass.permutation));
    attempt('getBlock after setPermutation', () => permutation(overworld.getBlock({ x: 0, y: -61, z: 0 }).permutation));
    attempt('setPermutation air', () => {
        overworld.getBlock({ x: 1, y: -61, z: 0 }).setPermutation(BlockPermutation.resolve('minecraft:air'));
        return overworld.getBlock({ x: 1, y: -61, z: 0 }).typeId;
    });
    record('blocks set');
    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 5);
});
