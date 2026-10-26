import { describe, expect, it } from 'vitest';

import { Gametype } from '@jsprismarine/minecraft';

import type { ContentLookup } from '../content/world/views';
import Player from '../Player';
import { stub, stubOf } from '../testing/stub.test.helper';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import { worldEntityAccess } from './worldContentAdapter';

describe('the live entity content adapter', () => {
    it('reports the player’s current creative and spectator state', () => {
        const world = stub<World>();
        const player = stubOf(Player, {
            getRuntimeId: () => 7n,
            getType: () => 'minecraft:player',
            getPosition: () => new Position(2.5, 64, -1.5, world),
            gamemode: Gametype.CREATIVE
        });
        Object.assign(world, { getPlayers: () => [player] });
        const access = worldEntityAccess({
            world: () => world,
            content: (() => {
                throw new Error('player reads do not need entity content');
            }) satisfies ContentLookup
        });

        expect(access.players()).toMatchObject([{ creative: true, spectator: false }]);

        player.gamemode = Gametype.SURVIVAL;

        expect(access.players()).toMatchObject([{ creative: false, spectator: false }]);

        player.gamemode = Gametype.SPECTATOR;

        expect(access.players()).toMatchObject([{ creative: false, spectator: true }]);
    });
});
