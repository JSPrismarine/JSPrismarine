import { describe, expect, it } from 'vitest';

import { lootLevelOf } from './lootLevel';

describe('the loot level view', () => {
    it('answers the clock and the dimension off the world', () => {
        let ticks = 6000;
        const level = lootLevelOf({ getTicks: () => ticks, getDimension: () => ({ name: 'minecraft:nether' }) });

        expect(level.clockTicks?.('minecraft:overworld')).toBe(6000);
        expect(level.dimension?.()).toBe('minecraft:nether');

        // Read through rather than snapshotted: a roll can happen ticks after
        // the view was made for it.
        ticks = 18000;
        expect(level.clockTicks?.('minecraft:overworld')).toBe(18000);
    });

    it("searches the world's structures and hands out the level's map ids for an explorer map", () => {
        const searches: unknown[] = [];
        let lastMapId = 4;
        const level = lootLevelOf({
            getTicks: () => 0,
            getDimension: () => ({ name: 'minecraft:overworld' }),
            locateStructure: (name, origin, radius, options) => {
                searches.push({ name, origin: { x: origin.x, z: origin.z }, radius, ...options });
                return { x: 320, y: 40, z: -96 };
            },
            nextMapId: () => ++lastMapId
        });

        expect(level.nearestStructure?.('#minecraft:on_treasure_maps', { x: 1, y: 2, z: 3 }, 50, true)).toEqual({
            x: 320,
            y: 40,
            z: -96
        });
        // The radius and the skip go through as the loot function stated them.
        expect(searches).toEqual([
            { name: '#minecraft:on_treasure_maps', origin: { x: 1, z: 3 }, radius: 50, skipKnownStructures: true }
        ]);
        expect([level.newMapId?.(), level.newMapId?.()]).toEqual([5, 6]);
    });

    it('leaves out what the server cannot answer truthfully yet', () => {
        const level = lootLevelOf({ getTicks: () => 0, getDimension: () => ({ name: 'minecraft:overworld' }) });

        // Blocks and biomes are Bedrock-named here and Java-named in the
        // predicates, so they are absent and report rather than lie.
        expect(level.blockAt).toBeUndefined();
        expect(level.biomeAt).toBeUndefined();
        expect(level.isRaining).toBeUndefined();
    });
});
