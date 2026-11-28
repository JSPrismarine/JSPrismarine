/**
 * The `pack-structures` scenario: the structures this pack ships in `structures/`, as
 * `world.structureManager` lists, reads, places and deletes them. `structures/jsp/pad.mcstructure`
 * is a 2 by 2 by 1 box of stone, an oak log on the x axis, air and one position that changes
 * nothing, and `structures/jsp/pad2.mcstructure` the same box in `format_version` 2, which keeps
 * one block layer as an int array; `structures/top.mcstructure` is one glass block, in no
 * namespace folder. Everything
 * runs once the chunk at the origin has loaded, on the flat world's grass at y -61.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';

const PACK = 'structures';
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

/** A permutation as plain data, or null for none. */
const permutation = (found) => (found === undefined ? null : { type: found.type.id, states: found.getAllStates() });

/** The type of the block at a location, with its pillar axis when it has one. */
const blockAt = (location) => {
    const block = world.getDimension('overworld').getBlock(location);
    return block === undefined ? null : permutation(block.permutation);
};

whenLoaded(() => {
    const overworld = world.getDimension('overworld');
    const manager = world.structureManager;
    attempt('getPackStructureIds', () =>
        manager
            .getPackStructureIds()
            .filter((id) => id.includes('jsp') || id.includes('top'))
            .sort()
    );
    attempt('getWorldStructureIds', () => manager.getWorldStructureIds().filter((id) => id.includes('jsp')));
    attempt('get the namespaced pack structure', () => {
        const found = manager.get('jsp:pad');
        return found === undefined ? null : { id: found.id, size: found.size, isValid: found.isValid };
    });
    attempt('get the pack structure in no namespace folder', () => manager.get('mystructure:top')?.id ?? null);
    attempt('get the same file under a namespace it is not in', () => manager.get('jsp:top')?.id ?? null);
    const pad = manager.get('jsp:pad');
    attempt('getBlockPermutation 0 0 0', () => permutation(pad.getBlockPermutation({ x: 0, y: 0, z: 0 })));
    attempt('getBlockPermutation 1 0 0', () => permutation(pad.getBlockPermutation({ x: 1, y: 0, z: 0 })));
    attempt('getBlockPermutation 0 1 0', () => permutation(pad.getBlockPermutation({ x: 0, y: 1, z: 0 })));
    attempt('getBlockPermutation 1 1 0', () => permutation(pad.getBlockPermutation({ x: 1, y: 1, z: 0 })));
    const pad2 = manager.get('jsp:pad2');
    attempt('format 2 size', () => pad2?.size ?? null);
    attempt('format 2 blocks', () =>
        [
            { x: 0, y: 0, z: 0 },
            { x: 1, y: 0, z: 0 },
            { x: 0, y: 1, z: 0 },
            { x: 1, y: 1, z: 0 }
        ].map((at) => permutation(pad2.getBlockPermutation(at)))
    );
    attempt('place by id', () => {
        overworld.getBlock({ x: 5, y: -59, z: 5 }).setType('minecraft:dirt');
        manager.place('jsp:pad', overworld, { x: 4, y: -60, z: 5 });
        return [
            blockAt({ x: 4, y: -60, z: 5 }),
            blockAt({ x: 5, y: -60, z: 5 }),
            blockAt({ x: 4, y: -59, z: 5 }),
            blockAt({ x: 5, y: -59, z: 5 })
        ];
    });
    attempt('delete the pack structure', () => manager.delete('jsp:pad'));
    attempt('get after the delete', () => manager.get('jsp:pad')?.id ?? null);
    attempt('getWorldStructureIds after the get', () =>
        manager.getWorldStructureIds().filter((id) => id.includes('jsp') || id.includes('top'))
    );
    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 5);
});
