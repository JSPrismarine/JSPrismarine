import { describe, expect, it } from 'vitest';

import Player from '../../Player';
import type Server from '../../Server';
import { EYE_HEIGHT } from '../../entity/Human';
import { stub, stubOf } from '../../testing/stub.test.helper';
import { Dimensions } from '../../world/Dimension';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type WorldManager from '../../world/WorldManager';
import { entityRefOf, worldOf } from './support';

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

    it('resolves `/execute in nether` against the loaded Nether world', () => {
        const overworld = stub<World>({ getDimension: () => Dimensions.Overworld });
        const nether = stub<World>({ getDimension: () => Dimensions.Nether });
        const worldManager = stub<WorldManager>({
            getWorlds: () => [overworld, nether],
            getDefaultWorld: () => overworld
        });
        const server = stub<Server>({ getWorldManager: () => worldManager });

        expect(worldOf(server, 'minecraft:the_nether')).toBe(nether);
    });
});
