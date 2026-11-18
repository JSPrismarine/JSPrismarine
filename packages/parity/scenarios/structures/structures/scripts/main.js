/**
 * The `structures` scenario: `world.structureManager` copies a 3 by 2 by 2 volume of the flat
 * world into a structure, reads and writes its blocks, places it elsewhere, rotated and not,
 * saves it under another id, lists and deletes structures, and refuses what BDS refuses.
 * Everything runs once the chunk at the origin has loaded, on the flat world's grass at y -61.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { BlockPermutation, StructureRotation, StructureSaveMode, system, world } from '@minecraft/server';

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

/** The type of the block at a location. */
const typeAt = (location) => world.getDimension('overworld').getBlock(location)?.typeId ?? null;

/** A permutation as plain data, or null for none. */
const permutation = (found) => (found === undefined ? null : { type: found.type.id, states: found.getAllStates() });

/** The structure ids this scenario made, sorted, without any BDS keeps for itself. */
const ours = () =>
    world.structureManager
        .getWorldStructureIds()
        .filter((id) => id.includes('jsp'))
        .sort();

whenLoaded(() => {
    const overworld = world.getDimension('overworld');
    const manager = world.structureManager;
    overworld.getBlock({ x: 1, y: -60, z: 1 }).setType('minecraft:stone');
    overworld.getBlock({ x: 2, y: -60, z: 1 }).setType('minecraft:oak_planks');
    overworld
        .getBlock({ x: 3, y: -60, z: 2 })
        .setPermutation(BlockPermutation.resolve('minecraft:oak_log', { pillar_axis: 'x' }));
    overworld.getBlock({ x: 1, y: -59, z: 2 }).setType('minecraft:glass');

    attempt('structureManager is the same object', () => world.structureManager === manager);
    attempt('get of an unknown id', () => manager.get('jsp:missing') ?? null);
    attempt('delete of an unknown id', () => manager.delete('jsp:missing'));
    attempt('createFromWorld', () => {
        const made = manager.createFromWorld('jsp:copy', overworld, { x: 1, y: -60, z: 1 }, { x: 3, y: -59, z: 2 });
        return { id: made.id, size: made.size, isValid: made.isValid };
    });
    attempt('createFromWorld with the corners swapped', () => {
        const made = manager.createFromWorld(
            'jsp:swapped',
            overworld,
            { x: 3, y: -59, z: 2 },
            { x: 1, y: -60, z: 1 },
            { saveMode: StructureSaveMode.Memory }
        );
        return { id: made.id, size: made.size };
    });
    attempt(
        'createFromWorld of an id in use',
        () => manager.createFromWorld('jsp:copy', overworld, { x: 1, y: -60, z: 1 }, { x: 1, y: -60, z: 1 }).id
    );
    attempt(
        'createFromWorld without a namespace',
        () => manager.createFromWorld('jspbare', overworld, { x: 1, y: -60, z: 1 }, { x: 1, y: -60, z: 1 }).id
    );
    attempt('getWorldStructureIds', () => ours());
    const copy = manager.get('jsp:copy');
    attempt('get returns a new object', () => copy !== manager.get('jsp:copy'));
    attempt('get size', () => copy.size);
    attempt('getBlockPermutation 0 0 0', () => permutation(copy.getBlockPermutation({ x: 0, y: 0, z: 0 })));
    attempt('getBlockPermutation 1 0 0', () => permutation(copy.getBlockPermutation({ x: 1, y: 0, z: 0 })));
    attempt('getBlockPermutation 2 0 1', () => permutation(copy.getBlockPermutation({ x: 2, y: 0, z: 1 })));
    attempt('getBlockPermutation 0 1 1', () => permutation(copy.getBlockPermutation({ x: 0, y: 1, z: 1 })));
    attempt('getBlockPermutation of air', () => permutation(copy.getBlockPermutation({ x: 2, y: 1, z: 0 })));
    attempt('getBlockPermutation outside', () => permutation(copy.getBlockPermutation({ x: 3, y: 0, z: 0 })));
    attempt('getBlockPermutation negative', () => permutation(copy.getBlockPermutation({ x: -1, y: 0, z: 0 })));
    attempt('getIsWaterlogged', () => copy.getIsWaterlogged({ x: 0, y: 0, z: 0 }));
    attempt('setBlockPermutation', () => {
        copy.setBlockPermutation({ x: 2, y: 1, z: 0 }, BlockPermutation.resolve('minecraft:dirt'));
        return permutation(manager.get('jsp:copy').getBlockPermutation({ x: 2, y: 1, z: 0 }));
    });
    attempt('setBlockPermutation outside', () =>
        copy.setBlockPermutation({ x: 0, y: 2, z: 0 }, BlockPermutation.resolve('minecraft:dirt'))
    );
    attempt('setBlockPermutation with none', () => {
        copy.setBlockPermutation({ x: 2, y: 1, z: 0 });
        return permutation(copy.getBlockPermutation({ x: 2, y: 1, z: 0 }));
    });
    attempt('place by id', () => {
        manager.place('jsp:copy', overworld, { x: 6, y: -60, z: 1 });
        return [
            typeAt({ x: 6, y: -60, z: 1 }),
            typeAt({ x: 7, y: -60, z: 1 }),
            typeAt({ x: 8, y: -60, z: 2 }),
            typeAt({ x: 6, y: -59, z: 2 })
        ];
    });
    attempt('place by object rotated 90', () => {
        manager.place(copy, overworld, { x: 6, y: -60, z: 6 }, { rotation: StructureRotation.Rotate90 });
        const at = (x, y, z) => {
            const block = overworld.getBlock({ x, y, z });
            return `${block.typeId}${block.typeId === 'minecraft:oak_log' ? `:${block.permutation.getState('pillar_axis')}` : ''}`;
        };
        const found = [];
        for (let x = 6; x <= 8; x++) for (let z = 6; z <= 8; z++) found.push(`${x} ${z} ${at(x, -60, z)}`);
        return found.filter((each) => !each.endsWith('minecraft:air'));
    });
    attempt('place without blocks', () => {
        overworld.getBlock({ x: 6, y: -60, z: 11 }).setType('minecraft:gold_block');
        manager.place('jsp:copy', overworld, { x: 6, y: -60, z: 11 }, { includeBlocks: false });
        return typeAt({ x: 6, y: -60, z: 11 });
    });
    attempt('place of an unknown id', () => manager.place('jsp:missing', overworld, { x: 6, y: -60, z: 1 }));
    attempt('saveAs', () => {
        const saved = copy.saveAs('jsp:saved', StructureSaveMode.Memory);
        return { id: saved.id, size: saved.size };
    });
    attempt('saveAs of an id in use', () => copy.saveAs('jsp:copy').id);
    attempt('createEmpty', () => {
        const empty = manager.createEmpty('jsp:empty', { x: 2, y: 2, z: 2 });
        return { id: empty.id, size: empty.size, block: permutation(empty.getBlockPermutation({ x: 0, y: 0, z: 0 })) };
    });
    attempt('getWorldStructureIds after saving', () => ours());
    attempt('delete by id', () => manager.delete('jsp:copy'));
    attempt('isValid after delete', () => copy.isValid);
    attempt('size after delete', () => copy.size);
    attempt('get after delete', () => manager.get('jsp:copy') ?? null);
    attempt('delete by object', () => manager.delete(manager.get('jsp:swapped')));
    attempt('getWorldStructureIds after deleting', () => ours());
    for (const id of ours()) manager.delete(id);
    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 2);
});
