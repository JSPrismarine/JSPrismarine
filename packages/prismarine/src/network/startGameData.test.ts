import { Vector3 } from '@jsprismarine/math';
import { Gametype, Generator } from '@jsprismarine/minecraft';
import type { LevelStem } from '@jsprismarine/worldgen';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';
import { describe, expect, it } from 'vitest';

import type Player from '../Player';
import type Server from '../Server';
import type { Config } from '../config/Config';
import { fakeLevel, TEST_GENERATOR_KIND } from '../testing/level';
import { stub } from '../testing/stub.test.helper';
import { Dimensions } from '../world/Dimension';
import type { DimensionType } from '../world/Dimension';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import { createStartGameData, startGameGenerator } from './startGameData';

/** The vanilla Nether stem's key, which `@jsprismarine/worldgen` names only for the Overworld. */
const NETHER_STEM_ID = 'minecraft:the_nether';

const FLAT: LevelStem = {
    type: Dimensions.Overworld.id,
    generator: {
        type: 'minecraft:flat',
        settings: {
            layers: [{ block: 'minecraft:stone', height: 1 }],
            biome: 'minecraft:plains',
            lakes: false,
            features: false
        }
    }
};

const NOISE: LevelStem = {
    type: Dimensions.Overworld.id,
    generator: {
        type: 'minecraft:noise',
        settings: 'minecraft:overworld',
        biomeSource: { type: 'minecraft:fixed', biome: 'minecraft:plains' }
    }
};

const NETHER: LevelStem = {
    type: Dimensions.Nether.id,
    generator: { type: TEST_GENERATOR_KIND, settings: undefined }
};

/** A world of one dimension in a level with the given stems. */
const worldOf = (dimension: DimensionType, stem: LevelStem, stems: ReadonlyMap<string, LevelStem>): World => {
    const level = fakeLevel({ stems });
    const world = stub<World>({
        getLevel: () => level,
        getStem: () => stem,
        getDimension: () => dimension,
        getTicks: () => 0,
        getName: () => 'test',
        getUUID: () => 'uuid',
        getSeed: () => 1n,
        getGameRuleManager: () => level.getGameRuleManager()
    });
    return world;
};

const startGameFor = (world: World) =>
    createStartGameData({
        server: stub<Server>({
            getConfig: () =>
                stub<Config>({
                    getGamemode: () => 'survival',
                    getDifficulty: () => 1,
                    getServerAuthoritativeBlockBreaking: () => true
                }),
            getTick: () => 0
        }),
        player: stub<Player>({
            getRuntimeId: () => 1n,
            getJoinSpawn: () => null,
            getPosition: () => new Position(0, 64, 0, world),
            gamemode: Gametype.SURVIVAL,
            pitch: 0,
            yaw: 0
        }),
        world,
        worldSpawnPosition: new Vector3(0, 64, 0),
        serverVersion: '1.26.51',
        blockProperties: []
    });

describe('startGameData', () => {
    describe('generator', () => {
        it('is Flat for a flat Overworld stem', () => {
            const world = worldOf(Dimensions.Overworld, FLAT, new Map([[OVERWORLD_STEM_ID, FLAT]]));

            expect(startGameFor(world).generator).toBe(Generator.FLAT);
        });

        it('is Overworld for a noise Overworld stem', () => {
            const world = worldOf(Dimensions.Overworld, NOISE, new Map([[OVERWORLD_STEM_ID, NOISE]]));

            expect(startGameFor(world).generator).toBe(Generator.OVERWORLD);
        });

        it('describes the Overworld stem when the player joins in the Nether', () => {
            // The field is the world type, not the join dimension: a Nether join in a flat
            // level still says Flat.
            const stems = new Map([
                [OVERWORLD_STEM_ID, FLAT],
                [NETHER_STEM_ID, NETHER]
            ]);

            expect(startGameGenerator(worldOf(Dimensions.Nether, NETHER, stems))).toBe(Generator.FLAT);
        });

        it('reads the join world when the level has no Overworld stem', () => {
            const world = worldOf(Dimensions.Nether, NETHER, new Map([[NETHER_STEM_ID, NETHER]]));

            expect(startGameGenerator(world)).toBe(Generator.NETHER);
        });
    });

    describe('dimension', () => {
        it('is the join world dimension', () => {
            const stems = new Map([
                [OVERWORLD_STEM_ID, NOISE],
                [NETHER_STEM_ID, NETHER]
            ]);

            expect(startGameFor(worldOf(Dimensions.Nether, NETHER, stems)).dimension).toBe(1);
            expect(startGameFor(worldOf(Dimensions.Overworld, NOISE, stems)).dimension).toBe(0);
        });
    });
});
