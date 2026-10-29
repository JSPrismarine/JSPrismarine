import { describe, expect, it } from 'vitest';

import { Gametype } from '@jsprismarine/minecraft';

import { EYE_HEIGHT } from './Human';
import type { ContentLookup } from '../content/world/views';
import Player from '../Player';
import { stub, stubOf } from '../testing/stub.test.helper';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import { worldEntityAccess } from './worldContentAdapter';

describe('the live entity content adapter', () => {
    it('reports player mode and feet-level position', () => {
        const world = stub<World>();
        const position = new Position(2.5, 64 + EYE_HEIGHT, -1.5, world);
        const player = Object.assign(
            stubOf(Player, {
                getRuntimeId: () => 7n,
                getType: () => 'minecraft:player',
                getPosition: () => position,
                getTags: () => [],
                gamemode: Gametype.CREATIVE
            }),
            { position }
        );
        Object.assign(world, { getPlayers: () => [player] });
        const access = worldEntityAccess({
            world: () => world,
            content: (() => {
                throw new Error('player reads do not need entity content');
            }) satisfies ContentLookup
        });

        expect(access.players()).toMatchObject([
            { creative: true, spectator: false, position: { x: 2.5, y: 64, z: -1.5 } }
        ]);

        player.gamemode = Gametype.SURVIVAL;

        expect(access.players()).toMatchObject([{ creative: false, spectator: false }]);

        player.gamemode = Gametype.SPECTATOR;

        expect(access.players()).toMatchObject([{ creative: false, spectator: true }]);
    });
});
