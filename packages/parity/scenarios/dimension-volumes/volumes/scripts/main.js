/**
 * The `dimension-volumes` scenario: a dimension's `fillBlocks`, `containsBlock`, `getBlocks` and
 * `containsBiomes` over block volumes, and `cloneBlocks` between two regions, on blocks the
 * scenario places at y 20 to 21, clear of the flat world's ground.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { BlockPermutation, BlockVolume, CloneMode, system, world } from '@minecraft/server';

const PACK = 'volumes';
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
        const value = call();
        record(event, { value: value === undefined ? 'undefined' : value });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

/** Runs `run` once the chunk at the origin is loaded, adding a ticking area for BDS. */
const whenLoaded = (run) => {
    world.afterEvents.worldLoad.subscribe(() => {
        const overworld = world.getDimension('overworld');
        try {
            overworld.runCommand('tickingarea add -16 0 -16 15 0 15 jsp_scenario');
        } catch {
            // A world that loads its spawn chunks without one may refuse it.
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

/** The types of the blocks a list of locations names, as `x y z type`. */
const typesAt = (dimension, locations) =>
    locations.map((at) => `${at.x} ${at.y} ${at.z} ${dimension.getBlock(at)?.typeId}`);

/** A volume's locations, sorted. */
const locationsOf = (volume) => [...volume.getBlockLocationIterator()].map((at) => `${at.x} ${at.y} ${at.z}`).sort();

whenLoaded(() => {
    const overworld = world.getDimension('overworld');
    const box = new BlockVolume({ x: 0, y: 20, z: 0 }, { x: 2, y: 21, z: 1 });
    attempt('fillBlocks', () => {
        const filled = overworld.fillBlocks(box, 'minecraft:stone');
        return [filled.constructor.name, locationsOf(filled).length];
    });
    attempt('fillBlocks of a permutation', () => {
        overworld.fillBlocks(
            new BlockVolume({ x: 0, y: 21, z: 0 }, { x: 0, y: 21, z: 1 }),
            BlockPermutation.resolve('minecraft:oak_log', { pillar_axis: 'z' })
        );
        return overworld.getBlock({ x: 0, y: 21, z: 1 }).permutation.getState('pillar_axis');
    });
    attempt('fillBlocks with a filter', () => {
        const filled = overworld.fillBlocks(box, 'minecraft:dirt', {
            blockFilter: { includeTypes: ['minecraft:stone'] }
        });
        return locationsOf(filled);
    });
    attempt('fillBlocks of an unknown type', () => overworld.fillBlocks(box, 'jsp:missing'));
    attempt('fillBlocks in an unloaded chunk', () =>
        overworld.fillBlocks(new BlockVolume({ x: 100000, y: 20, z: 0 }, { x: 100001, y: 20, z: 0 }), 'minecraft:stone')
    );
    attempt('containsBlock', () => [
        overworld.containsBlock(box, { includeTypes: ['minecraft:dirt'] }),
        overworld.containsBlock(box, { includeTypes: ['minecraft:gold_block'] }),
        overworld.containsBlock(box, { excludeTypes: ['minecraft:dirt'] })
    ]);
    attempt('containsBlock in an unloaded chunk', () =>
        overworld.containsBlock(new BlockVolume({ x: 100000, y: 20, z: 0 }, { x: 100001, y: 20, z: 0 }), {
            includeTypes: ['minecraft:stone']
        })
    );
    attempt('getBlocks', () => locationsOf(overworld.getBlocks(box, { includeTypes: ['minecraft:oak_log'] })));
    attempt('getBlocks closest', () =>
        locationsOf(
            overworld.getBlocks(box, { includeTypes: ['minecraft:dirt'], closest: 2, location: { x: 3, y: 20, z: 0 } })
        )
    );
    attempt('containsBiomes', () => [
        overworld.containsBiomes(box, { includeBiomes: ['minecraft:plains'] }, false),
        overworld.containsBiomes(box, { includeBiomes: ['minecraft:desert'] }, false),
        overworld.containsBiomes(box, { includeTags: ['plains'] }, true)
    ]);
    attempt('cloneBlocks', () => {
        overworld.cloneBlocks({ x: 0, y: 20, z: 0 }, { x: 2, y: 21, z: 1 }, { x: 5, y: 20, z: 0 }, CloneMode.Copy);
        return typesAt(overworld, [
            { x: 5, y: 20, z: 0 },
            { x: 5, y: 21, z: 1 },
            { x: 7, y: 21, z: 1 }
        ]);
    });
    attempt('cloneBlocks moving', () => {
        overworld.cloneBlocks({ x: 5, y: 21, z: 0 }, { x: 5, y: 21, z: 1 }, { x: 9, y: 21, z: 0 }, CloneMode.Move);
        return typesAt(overworld, [
            { x: 5, y: 21, z: 0 },
            { x: 9, y: 21, z: 0 },
            { x: 9, y: 21, z: 1 }
        ]);
    });
    attempt('cloneBlocks overlapping without force', () =>
        overworld.cloneBlocks({ x: 0, y: 20, z: 0 }, { x: 2, y: 20, z: 0 }, { x: 1, y: 20, z: 0 }, CloneMode.Copy)
    );
    attempt('cloneBlocks with a filter', () => {
        overworld.cloneBlocks({ x: 0, y: 20, z: 0 }, { x: 2, y: 21, z: 1 }, { x: 12, y: 20, z: 0 }, CloneMode.Copy, {
            includeTypes: ['minecraft:oak_log']
        });
        return typesAt(overworld, [
            { x: 12, y: 20, z: 0 },
            { x: 12, y: 21, z: 0 }
        ]);
    });
    attempt('cloneBlocks above the world', () =>
        overworld.cloneBlocks({ x: 0, y: 20, z: 0 }, { x: 0, y: 20, z: 0 }, { x: 0, y: 400, z: 0 }, CloneMode.Copy)
    );
    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 1);
});
