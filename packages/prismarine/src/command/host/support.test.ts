import type { GeneratorDefinition, LevelStem } from '@jsprismarine/worldgen';
import { describe, expect, it } from 'vitest';

import Player from '../../Player';
import type Server from '../../Server';
import { EYE_HEIGHT } from '../../entity/Human';
import { stub, stubOf } from '../../testing/stub.test.helper';
import { Dimensions } from '../../world/Dimension';
import type { Level } from '../../world/Level';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type WorldManager from '../../world/WorldManager';
import { dimensionIdOf, entityRefOf, javaDimensionIdOf, loadedDimensions, worldOf } from './support';

describe('command entity references', () => {
    it('uses a player’s feet as the command position', () => {
        const world = stub<World>({ getDimension: () => Dimensions.Overworld });
        const player = stubOf(Player, {
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

    it('resolves `/execute in nether` against the default level, and falls back to the default world', () => {
        const overworld = stub<World>({ getDimension: () => Dimensions.Overworld });
        const nether = stub<World>({ getDimension: () => Dimensions.Nether });
        const worldManager = stub<WorldManager>({
            getWorldByDimension: (dimension) => (dimension === 'minecraft:the_nether' ? nether : undefined),
            getDefaultWorld: () => overworld
        });
        const server = stub<Server>({ getWorldManager: () => worldManager });

        expect(worldOf(server, 'minecraft:the_nether')).toBe(nether);
        expect(worldOf(server, 'mypack:sky')).toBe(overworld);
    });

    it('offers every stem of the default level as a dimension, built or not', () => {
        const debug: GeneratorDefinition = { type: 'minecraft:debug' };
        const level = stub<Level>({
            getStems: () =>
                new Map<string, LevelStem>([
                    ['minecraft:overworld', { type: 'minecraft:overworld', generator: debug }],
                    ['minecraft:the_nether', { type: 'minecraft:the_nether', generator: debug }],
                    ['mypack:sky', { type: 'minecraft:overworld', generator: debug }]
                ])
        });
        const server = stub<Server>({ getWorldManager: () => stub<WorldManager>({ getDefaultLevel: () => level }) });

        expect(loadedDimensions(server)).toEqual(['minecraft:overworld', 'minecraft:the_nether']);
    });

    it('reads a dimension argument in either spelling as its Java id', () => {
        expect(javaDimensionIdOf('minecraft:nether')).toBe('minecraft:the_nether');
        expect(javaDimensionIdOf('the_end')).toBe('minecraft:the_end');
        expect(javaDimensionIdOf('mypack:sky')).toBe('mypack:sky');
    });

    it('reports the Java id of a world as its dimension', () => {
        const nether = stub<World>({ getDimension: () => Dimensions.Nether });
        expect(dimensionIdOf(nether)).toBe('minecraft:the_nether');
    });
});
