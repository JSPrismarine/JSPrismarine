import { describe, expect, it } from 'vitest';

import { Gametype } from '@jsprismarine/minecraft';

import { EYE_HEIGHT } from './playerEyes';
import type { ContentLookup } from '../content/world/views';
import { stub } from '../testing/stub.test.helper';
import { playerOnPrototype } from '../testing/storePlayer.test.helper';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import { worldEntityAccess } from './worldContentAdapter';

describe('the live entity content adapter', () => {
    it('reports player mode and feet-level position', () => {
        const world = stub<World>();
        const position = new Position(2.5, 64 + EYE_HEIGHT, -1.5, world);
        const player = playerOnPrototype(
            { gamemode: Gametype.CREATIVE },
            // The actor, which is what the adapter reads the id, the position and the tags off.
            { runtimeId: 7n, actor: { getPosition: () => position, getFeetY: () => 64, getTags: () => [] } }
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
