import { describe, expect, it } from 'vitest';

import type Player from '../Player';
import { stub } from '../testing/stub.test.helper';
import type { DimensionType } from './Dimension';
import { Dimensions } from './Dimension';
import { lastPlayerRecord } from './PlayerRecords';
import type { World, WorldPlayerData } from './World';

/** A world of one dimension that answers with one record, which is all this module reads a world for. */
const worldOf = (dimension: DimensionType, data: Partial<WorldPlayerData> = {}): World =>
    stub<World>({
        getName: () => dimension.id,
        getDimension: () => dimension,
        getPlayerData: async () => data
    });

const playerIn = (world: World): Player => stub<Player>({ getWorld: () => world });

describe('where a returning player left off', () => {
    it('moves the player to the loaded world of the dimension the record names', async () => {
        const overworld = worldOf(Dimensions.Overworld, { gamemode: 'creative', dimension: 'minecraft:the_nether' });
        const nether = worldOf(Dimensions.Nether, { gamemode: 'survival' });

        const found = await lastPlayerRecord(playerIn(overworld), [overworld, nether]);

        expect(found.world).toBe(nether);
        expect(found.dimension).toBe('minecraft:the_nether');
        // One read, from the world the login built the player in; the Nether's own answer is
        // never consulted.
        expect(found.data.gamemode).toBe('creative');
    });

    it("stays in the player's own world when the record names no dimension", async () => {
        const overworld = worldOf(Dimensions.Overworld, { gamemode: 'survival' });
        const nether = worldOf(Dimensions.Nether, { gamemode: 'creative' });

        const found = await lastPlayerRecord(playerIn(overworld), [overworld, nether]);

        expect(found.world).toBe(overworld);
        expect(found.dimension).toBeUndefined();
        expect(found.data.gamemode).toBe('survival');
    });

    it("stays in the player's own world when no loaded world has the record's dimension", async () => {
        const overworld = worldOf(Dimensions.Overworld, { gamemode: 'adventure', dimension: 'minecraft:the_end' });

        const found = await lastPlayerRecord(playerIn(overworld), [overworld]);

        expect(found.world).toBe(overworld);
        expect(found.dimension).toBe('minecraft:the_end');
        expect(found.data.gamemode).toBe('adventure');
    });

    it("reads the player's own world even when it is not among the loaded ones", async () => {
        const orphan = worldOf(Dimensions.Overworld, { gamemode: 'adventure' });

        const found = await lastPlayerRecord(playerIn(orphan), []);

        expect(found.world).toBe(orphan);
        expect(found.data.gamemode).toBe('adventure');
    });
});
