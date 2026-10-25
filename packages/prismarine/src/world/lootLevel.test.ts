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

    it('leaves out what the server cannot answer truthfully yet', () => {
        const level = lootLevelOf({ getTicks: () => 0, getDimension: () => ({ name: 'minecraft:overworld' }) });

        // Blocks and biomes are Bedrock-named here and Java-named in the
        // predicates, so they are absent and report rather than lie.
        expect(level.blockAt).toBeUndefined();
        expect(level.biomeAt).toBeUndefined();
        expect(level.isRaining).toBeUndefined();
    });
});
