import type { GeneratorDefinition, LevelStem } from '@jsprismarine/worldgen';
import { describe, expect, it } from 'vitest';

import type Server from '../../Server';
import { EYE_HEIGHT } from '../../entity/playerEyes';
import { stub } from '../../testing/stub.test.helper';
import { sessionOnPrototype } from '../../testing/storePlayer.test.helper';
import { Dimensions } from '../../world/DimensionType';
import type { DimensionType } from '../../world/DimensionType';
import type { Level } from '../../world/Level';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type WorldManager from '../../world/WorldManager';
import {
    dimensionIdOf,
    dimensionInLevelOf,
    entityRefOf,
    javaDimensionIdOf,
    loadedDimensions,
    splitCommandDimension,
    worldOf
} from './support';

/**
 * A world of a dimension in a level, which the server answers as its default level or not. A
 * command reads which level a world is in off the world itself.
 */
const worldIn = (dimension: DimensionType, { named = 'world', isDefault = true } = {}) => {
    const level = stub<Level>({ name: named });
    const defaultLevel = isDefault ? level : stub<Level>({ name: 'world' });
    const server = stub<Server>({ getWorldManager: () => stub<WorldManager>({ getEntryLevel: () => defaultLevel }) });
    return stub<World>({ getDimension: () => dimension, getLevel: () => level, getServer: () => server });
};

describe('command entity references', () => {
    it('uses a player’s feet as the command position', () => {
        const world = worldIn(Dimensions.Overworld);
        const player = sessionOnPrototype({
            getRuntimeId: () => 1n,
            getType: () => 'minecraft:player',
            getName: () => 'TestPlayer',
            getPosition: () => new Position(2.5, 64 + EYE_HEIGHT, -1.5, world),
            getFeetY: () => 64,
            getWorld: () => world,
            yaw: 0,
            pitch: 0
        });

        expect(entityRefOf(player).position).toEqual({ x: 2.5, y: 64, z: -1.5 });
    });

    it('resolves `/execute in nether` against the default level, and falls back only for an unknown dimension', () => {
        const overworld = stub<World>({ getDimension: () => Dimensions.Overworld });
        const nether = stub<World>({ getDimension: () => Dimensions.Nether });
        const worldManager = stub<WorldManager>({
            // The Nether is a stem nobody has entered: started, and answered while it enables.
            startWorld: (dimension) => (dimension === 'minecraft:the_nether' ? nether : undefined),
            getEntryWorld: () => overworld
        });
        const server = stub<Server>({ getWorldManager: () => worldManager });

        expect(worldOf(server, 'minecraft:the_nether')).toBe(nether);
        expect(worldOf(server, 'mypack:sky')).toBe(overworld);
    });

    it('offers every stem of the level as a dimension, built or not', () => {
        const debug: GeneratorDefinition = { type: 'minecraft:debug' };
        const level = stub<Level>({
            getStems: () =>
                new Map<string, LevelStem>([
                    ['minecraft:overworld', { type: 'minecraft:overworld', generator: debug }],
                    ['minecraft:the_nether', { type: 'minecraft:the_nether', generator: debug }],
                    ['mypack:sky', { type: 'minecraft:overworld', generator: debug }]
                ])
        });
        expect(loadedDimensions(level)).toEqual(['minecraft:overworld', 'minecraft:the_nether']);
    });

    it('reads a dimension argument in either spelling as its Java id', () => {
        expect(javaDimensionIdOf('minecraft:nether')).toBe('minecraft:the_nether');
        expect(javaDimensionIdOf('the_end')).toBe('minecraft:the_end');
        expect(javaDimensionIdOf('mypack:sky')).toBe('mypack:sky');
    });

    it('reports the Java id of a world as its dimension', () => {
        expect(dimensionIdOf(worldIn(Dimensions.Nether))).toBe('minecraft:the_nether');
    });

    it('names a level other than the default in the dimension, and keeps it through `execute in` (#3024)', () => {
        const other = worldIn(Dimensions.Overworld, { named: 'e2e_other', isDefault: false });

        expect(dimensionIdOf(other)).toBe('minecraft:overworld@e2e_other');
        expect(splitCommandDimension('minecraft:overworld@e2e_other')).toEqual({
            dimension: 'minecraft:overworld',
            level: 'e2e_other'
        });
        expect(javaDimensionIdOf('minecraft:nether@e2e_other')).toBe('minecraft:the_nether@e2e_other');
        expect(dimensionInLevelOf('minecraft:overworld@e2e_other', 'minecraft:the_nether')).toBe(
            'minecraft:the_nether@e2e_other'
        );
        expect(dimensionInLevelOf('minecraft:overworld', 'minecraft:the_nether')).toBe('minecraft:the_nether');
    });

    it("starts the named level's world for a dimension that carries a level", () => {
        const levelWorld = stub<World>({ getDimension: () => Dimensions.Overworld });
        const started: [string, string | undefined][] = [];
        const worldManager = stub<WorldManager>({
            startWorld: (dimension, level) => {
                started.push([dimension, level]);
                return levelWorld;
            },
            getEntryWorld: () => stub<World>({})
        });
        const server = stub<Server>({ getWorldManager: () => worldManager });

        expect(worldOf(server, 'minecraft:overworld@e2e_other')).toBe(levelWorld);
        expect(started).toEqual([['minecraft:overworld', 'e2e_other']]);
    });
});
