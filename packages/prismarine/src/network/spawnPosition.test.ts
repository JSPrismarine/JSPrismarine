import { Vector3 } from '@jsprismarine/math';
import { SpawnPositionType } from '@jsprismarine/protocol/packet/SetSpawnPositionPacket';
import { describe, expect, it } from 'vitest';

import { fakePlayer } from '../testing/fakePlayer.test.helper';
import { fakeLevel } from '../testing/level';
import { stub } from '../testing/stub.test.helper';
import { Dimensions, dimensionTypeOf, FIRST_CUSTOM_DIMENSION_ID } from '../world/Dimension';
import type { World } from '../world/World';
import { overworldSpawnOf, playerSpawnPositionPacket, spawnDimensionIdOf } from './spawnPosition';

describe('spawnDimensionIdOf', () => {
    const sky = dimensionTypeOf(Dimensions.Overworld.java, 'mypack:sky', FIRST_CUSTOM_DIMENSION_ID);
    const level = fakeLevel({
        dimensionTypes: new Map([
            [Dimensions.Overworld.id, Dimensions.Overworld],
            [sky.id, sky]
        ])
    });

    it('answers the id the level chose for a custom type', () => {
        expect(spawnDimensionIdOf(level, 'mypack:sky', 0)).toBe(FIRST_CUSTOM_DIMENSION_ID);
    });

    it('answers a vanilla dimension by either spelling, even one the level has no type for', () => {
        expect(spawnDimensionIdOf(level, 'minecraft:nether', 0)).toBe(1);
        expect(spawnDimensionIdOf(level, 'minecraft:the_nether', 0)).toBe(1);
        expect(spawnDimensionIdOf(level, 'minecraft:the_end', 0)).toBe(2);
    });

    it('falls back for a name no dimension has', () => {
        expect(spawnDimensionIdOf(level, 'mypack:gone', 7)).toBe(7);
    });
});

describe('overworldSpawnOf', () => {
    const overworld = stub<World>({
        getDimension: () => Dimensions.Overworld,
        getSpawnPosition: async () => new Vector3(4, 65, 4)
    });

    it("asks an Overworld world for its own spawn, which is the level's", async () => {
        expect(await overworldSpawnOf(overworld)).toEqual(new Vector3(4, 65, 4));
    });

    it('answers the spawn the level already knows from another dimension', async () => {
        const level = fakeLevel({ spawn: new Vector3(12, 70, -3) });
        const nether = stub<World>({ getDimension: () => Dimensions.Nether, getLevel: () => level });
        expect(await overworldSpawnOf(nether)).toEqual(new Vector3(12, 70, -3));
    });

    it("asks the level's Overworld to find one when the level knows none yet", async () => {
        const level = fakeLevel({ worlds: () => [overworld] });
        const nether = stub<World>({ getDimension: () => Dimensions.Nether, getLevel: () => level });
        expect(await overworldSpawnOf(nether)).toEqual(new Vector3(4, 65, 4));
    });
});

describe('playerSpawnPositionPacket', () => {
    it("names the level's Overworld spawn, in the Overworld, for a player with no spawn of their own", () => {
        const { player, level } = fakePlayer();
        const nether = stub<World>({ getDimension: () => Dimensions.Nether, getLevel: () => level });

        // What `Player.getRespawnPoint` lands them at without a bed: the default Overworld spawn.
        const packet = playerSpawnPositionPacket(player, nether, new Vector3(8.7, 70, -3.2));

        expect(packet.getPacketData()).toEqual({
            type: SpawnPositionType.PlayerRespawn,
            position: { x: 8, y: 70, z: -4 },
            dimension: Dimensions.Overworld.bedrockId,
            blockPosition: { x: 8, y: 70, z: -4 }
        });
    });

    it("names the player's own spawn block in its dimension, whatever world they stand in", () => {
        const { player, level } = fakePlayer();
        player.setSpawnPoint({ x: 100, y: 40, z: 7, dimension: 'minecraft:nether' });
        const overworld = stub<World>({ getDimension: () => Dimensions.Overworld, getLevel: () => level });

        const packet = playerSpawnPositionPacket(player, overworld, new Vector3(0, 64, 0));

        expect(packet.getPacketData()).toMatchObject({
            position: { x: 100, y: 40, z: 7 },
            dimension: Dimensions.Nether.bedrockId
        });
    });
});
