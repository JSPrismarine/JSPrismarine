import type { Logger } from '@jsprismarine/logger';
import type { LevelStem } from '@jsprismarine/worldgen';
import { describe, expect, it } from 'vitest';

import type Player from '../Player';
import type Server from '../Server';
import { stub } from '../testing/stub.test.helper';
import type { DimensionType } from './Dimension';
import { Dimensions } from './Dimension';
import type { Level } from './Level';
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

/**
 * A level whose stems are the given worlds' dimensions, building each world on the first
 * `world(id)` and counting the builds, as a real level does for a lazy stem.
 */
const levelOf = (worlds: readonly World[]) => {
    const warnings: string[] = [];
    const built: string[] = [];
    const stems = new Map<string, LevelStem>(
        worlds.map((world) => [world.getDimension().id, stub<LevelStem>({ type: world.getDimension().id })])
    );
    const level = stub<Level>({
        getStems: () => stems,
        world: async (id) => {
            built.push(id);
            const found = worlds.find((world) => world.getDimension().id === id);
            if (found === undefined) throw new Error(`no ${id} stem`);
            return found;
        },
        getServer: () =>
            stub<Server>({ getLogger: () => stub<Logger>({ warn: (line) => void warnings.push(String(line)) }) })
    });
    return { level, warnings, built };
};

describe('where a returning player left off', () => {
    it('moves the player to the world of the dimension the record names, building it if need be', async () => {
        const overworld = worldOf(Dimensions.Overworld, { gamemode: 'creative', dimension: 'minecraft:the_nether' });
        const nether = worldOf(Dimensions.Nether, { gamemode: 'survival' });
        const { level, warnings, built } = levelOf([overworld, nether]);

        const found = await lastPlayerRecord(playerIn(overworld), level);

        expect(found.world).toBe(nether);
        expect(found.dimension).toBe('minecraft:the_nether');
        // The level built the Nether for this login: a player who logged out there comes back
        // there, however lazy its stem is.
        expect(built).toEqual(['minecraft:the_nether']);
        // One read, from the world the login built the player in; the Nether's own answer is
        // never consulted.
        expect(found.data.gamemode).toBe('creative');
        expect(warnings).toEqual([]);
    });

    it("stays in the player's own world when the record names no dimension", async () => {
        const overworld = worldOf(Dimensions.Overworld, { gamemode: 'survival' });
        const nether = worldOf(Dimensions.Nether, { gamemode: 'creative' });
        const { level, built } = levelOf([overworld, nether]);

        const found = await lastPlayerRecord(playerIn(overworld), level);

        expect(found.world).toBe(overworld);
        expect(found.dimension).toBeUndefined();
        expect(found.data.gamemode).toBe('survival');
        expect(built).toEqual([]);
    });

    it("stays in the player's own world, and says so, when the level has no stem for the record's dimension", async () => {
        const overworld = worldOf(Dimensions.Overworld, { gamemode: 'adventure', dimension: 'minecraft:the_end' });
        const { level, warnings, built } = levelOf([overworld]);

        const found = await lastPlayerRecord(playerIn(overworld), level);

        expect(found.world).toBe(overworld);
        expect(found.dimension).toBe('minecraft:the_end');
        expect(found.data.gamemode).toBe('adventure');
        expect(built).toEqual([]);
        expect(warnings).toEqual([
            "The record for minecraft:overworld's player names the dimension minecraft:the_end, which the level has no stem for; keeping the player in minecraft:overworld"
        ]);
    });
});
