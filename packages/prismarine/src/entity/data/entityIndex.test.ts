import { describe, expect, it } from 'vitest';

import { EntityIndex } from './entityIndex';
import { FLOOR_Y, TestEntityWorld, entityFixture } from './testing';

const Y = FLOOR_Y + 1;

/** A fixture whose one extra entity is wider than the index's ordinary boxes. */
const withWideEntity = () =>
    entityFixture(
        new TestEntityWorld(),
        {},
        {
            'jsprismarine:wide': {
                components: {
                    'minecraft:collision_box': { width: 4, height: 1 },
                    'minecraft:health': { value: 20, max: 20 },
                    'minecraft:physics': { has_gravity: false }
                }
            }
        }
    );

/** How many candidates one query reads out of the index's cells. */
const examinedBy = (index: EntityIndex, query: () => unknown): number => {
    const before = index.candidatesExamined();
    query();
    return index.candidatesExamined() - before;
};

describe('EntityIndex', () => {
    it('answers in ascending runtime id order, whatever order entities were filed in', () => {
        const { runtime } = entityFixture();
        const lower = runtime.spawn('minecraft:cow', { x: 0.5, y: Y, z: 0.5 });
        const higher = runtime.spawn('minecraft:cow', { x: 1.5, y: Y, z: 0.5 });
        if (lower === undefined || higher === undefined) throw new Error('the fixture declares no cow');

        const index = new EntityIndex();
        index.add(higher);
        index.add(lower);

        const center = { x: 1, y: Y, z: 0.5 };
        expect(index.within(center, 4)).toEqual([lower, higher]);
        expect(index.withinBox({ x: -1, y: FLOOR_Y, z: -1 }, { x: 3, y: FLOOR_Y + 3, z: 2 })).toEqual([lower, higher]);
    });

    it('reports each chunk a store entity enters, moves within and leaves, and lists it there', () => {
        const { runtime } = entityFixture();
        const { index } = runtime;
        const reported: string[] = [];
        index.chunkChanged = (chunkX, chunkZ) => reported.push(`${chunkX},${chunkZ}`);

        const cow = runtime.spawn('minecraft:cow', { x: 0.5, y: Y, z: 0.5 });
        if (cow === undefined) throw new Error('the fixture declares no cow');
        expect(reported).toEqual(['0,0']);
        expect(index.storeInChunk(0, 0)).toEqual([cow]);

        reported.length = 0;
        cow.position = { x: 3.5, y: Y, z: 0.5 };
        expect(reported).toEqual(['0,0']);

        reported.length = 0;
        cow.position = { x: -0.5, y: Y, z: -16.5 };
        expect(reported).toEqual(['0,0', '-1,-2']);
        expect(index.storeInChunk(0, 0)).toEqual([]);
        expect(index.storeInChunk(-1, -2)).toEqual([cow]);

        reported.length = 0;
        runtime.remove(cow.id, 'test');
        expect(reported).toEqual(['-1,-2']);
        expect(index.storeInChunk(-1, -2)).toEqual([]);
    });

    it('reports each chunk a dropped stack enters and leaves, and lists it there', () => {
        const { runtime } = entityFixture();
        const { index } = runtime;
        const reported: string[] = [];
        index.chunkChanged = (chunkX, chunkZ) => reported.push(`${chunkX},${chunkZ}`);

        const item = runtime.droppedItems.spawn(
            { x: 15.5, y: Y, z: 0.5 },
            { stack: { name: 'minecraft:dirt', count: 1 } }
        );
        if (item === undefined) throw new Error('the fixture declares no dropped item');
        expect(reported).toEqual(['0,0']);
        expect(index.itemsInChunk(0, 0)).toEqual([item]);
        expect(index.storeInChunk(0, 0)).toEqual([]);

        reported.length = 0;
        item.position = { x: -0.5, y: Y, z: -16.5 };
        expect(reported).toEqual(['0,0', '-1,-2']);
        expect(index.itemsInChunk(0, 0)).toEqual([]);
        expect(index.itemsInChunk(-1, -2)).toEqual([item]);

        reported.length = 0;
        runtime.remove(item.id, 'test');
        expect(reported).toEqual(['-1,-2']);
        expect(index.itemsInChunk(-1, -2)).toEqual([]);
    });

    it('examines at most the candidates in the cells a query touches', () => {
        const { runtime } = entityFixture();
        // Three cows in each of ten cells along x, sixteen blocks apart.
        for (let cell = 0; cell < 10; cell += 1)
            for (let cow = 0; cow < 3; cow += 1) runtime.spawn('minecraft:cow', { x: cell * 16 + 4 + cow, y: Y, z: 8 });
        const { index } = runtime;
        expect(index.size).toBe(30);

        // Inside one cell, so it reads that cell's three cows and nothing else.
        expect(examinedBy(index, () => index.within({ x: 8, y: Y, z: 8 }, 2))).toBe(3);
        // Across the boundary of cells 2 and 3, so it reads those two.
        expect(examinedBy(index, () => index.within({ x: 48, y: Y, z: 8 }, 6))).toBe(6);
        // A box inside cell 5, widened by the widest ordinary box, still reads one cell.
        expect(examinedBy(index, () => index.withinBox({ x: 84, y: Y, z: 7 }, { x: 86, y: Y + 1, z: 9 }))).toBe(3);
    });

    it('files an ordinary box in one cell and a large box in each cell its footprint overlaps', () => {
        const { runtime } = withWideEntity();
        // On the boundary of cells 0 and 1: an ordinary box is filed in cell 0 only.
        const cow = runtime.spawn('minecraft:cow', { x: 15.9, y: Y, z: 8 });
        // Four blocks wide around x = 15, so its footprint covers both cells and not cell 2.
        const wide = runtime.spawn('jsprismarine:wide', { x: 15, y: Y, z: 8 });
        if (cow === undefined || wide === undefined) throw new Error('the fixture declares no cow or wide entity');
        const { index } = runtime;

        expect(examinedBy(index, () => index.within({ x: 24, y: Y, z: 8 }, 0.5))).toBe(0);
        expect(examinedBy(index, () => index.within({ x: 8, y: Y, z: 8 }, 0.5))).toBe(2);
        expect(index.withinBox({ x: 16.05, y: Y, z: 7.5 }, { x: 16.3, y: Y + 0.5, z: 8.5 })).toEqual([cow, wide]);
        expect(examinedBy(index, () => index.withinBox({ x: 40, y: Y, z: 7 }, { x: 41, y: Y + 1, z: 9 }))).toBe(0);
    });

    it('sees a data entity where its last write put it, within the same tick', () => {
        const { runtime } = entityFixture();
        const cow = runtime.spawn('minecraft:cow', { x: 0.5, y: Y, z: 0.5 });
        if (cow === undefined) throw new Error('the fixture declares no cow');

        cow.body.position = { x: 100.5, y: Y, z: 0.5 };

        expect(runtime.near({ x: 0.5, y: Y, z: 0.5 }, 4)).toEqual([]);
        expect(runtime.near({ x: 100.5, y: Y, z: 0.5 }, 4)).toEqual([cow]);
    });

    it('leaves nothing behind when entities die, despawn or unload with their chunk', () => {
        const { runtime } = entityFixture();
        const dying = runtime.spawn('minecraft:cow', { x: 0.5, y: Y, z: 0.5 });
        const despawning = runtime.spawn('minecraft:cow', { x: 20.5, y: Y, z: 0.5 });
        const unloading = runtime.spawn('minecraft:cow', { x: 40.5, y: Y, z: 0.5 });
        if (dying === undefined || despawning === undefined || unloading === undefined)
            throw new Error('the fixture declares no cow');
        const { index } = runtime;

        runtime.hurt(dying, undefined, 'entity_attack', 1000);
        runtime.tick(1);
        expect(dying.removed).toBeDefined();
        runtime.remove(despawning.id, 'despawn');
        runtime.remove(unloading.id, 'chunk unload');

        expect(index.size).toBe(0);
        expect(index.occupiedCells).toBe(0);
    });
});
