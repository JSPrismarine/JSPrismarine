import { Gametype } from '@jsprismarine/minecraft';
import type { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import BlockPosition from '../../world/BlockPosition';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import { PlayerAction } from '../packet/PlayerActionPacket';
import PlayerActionHandler from './PlayerActionHandler';

/**
 * A player at the origin and a world that records every block it was asked to touch.
 *
 * The world generates nothing, so a position the handler should have refused shows up here
 * as a call that was made rather than as terrain that appeared.
 */
const fakeSession = (gamemode: Gametype) => {
    const broken: BlockPosition[] = [];
    const hit: BlockPosition[] = [];
    const sprinting: boolean[] = [];

    const world = stub<World>({
        breakBlock: async (where: Vector3) => {
            broken.push(BlockPosition.fromVector3(where));
            return true;
        },
        hitBlock: async (where: Vector3) => {
            hit.push(BlockPosition.fromVector3(where));
        }
    });

    const player = stub<Player>({
        gamemode,
        getName: () => 'tester',
        getPosition: () => new Position(0, 0, 0, world),
        getWorld: () => world,
        setSprinting: async (value) => {
            sprinting.push(value);
        }
    });

    return {
        broken,
        hit,
        sprinting,
        server: stub<Server>({ getLogger: () => stub<Logger>({ verbose: () => {} }) }),
        session: stub<PlayerSession>({ getPlayer: () => player })
    };
};

const FAR_AWAY = new BlockPosition(5_000_000, 64, 5_000_000);

describe('PlayerActionHandler', () => {
    it('breaks the block for a creative player within reach', async () => {
        const { broken, server, session } = fakeSession(Gametype.CREATIVE);

        await new PlayerActionHandler().handleAction(
            PlayerAction.CREATIVE_PLAYER_DESTROY_BLOCK,
            new BlockPosition(1, 2, 0),
            0,
            server,
            session
        );

        expect(broken).toEqual([new BlockPosition(1, 2, 0)]);
    });

    it('refuses a creative break from a player who is not in creative', async () => {
        const { broken, server, session } = fakeSession(Gametype.SURVIVAL);

        await new PlayerActionHandler().handleAction(
            PlayerAction.CREATIVE_PLAYER_DESTROY_BLOCK,
            new BlockPosition(1, 2, 0),
            0,
            server,
            session
        );

        expect(broken).toEqual([]);
    });

    it('refuses a block action aimed far outside the player reach', async () => {
        const { broken, hit, server, session } = fakeSession(Gametype.CREATIVE);
        const handler = new PlayerActionHandler();

        await handler.handleAction(PlayerAction.CREATIVE_PLAYER_DESTROY_BLOCK, FAR_AWAY, 0, server, session);
        await handler.handleAction(PlayerAction.CRACK_BLOCK, FAR_AWAY, 0, server, session);

        expect(broken).toEqual([]);
        expect(hit).toEqual([]);
    });

    it('refuses every block action from a spectator', async () => {
        const { broken, hit, server, session } = fakeSession(Gametype.SPECTATOR);
        const handler = new PlayerActionHandler();
        const nearby = new BlockPosition(1, 0, 0);

        await handler.handleAction(PlayerAction.CREATIVE_PLAYER_DESTROY_BLOCK, nearby, 0, server, session);
        await handler.handleAction(PlayerAction.CRACK_BLOCK, nearby, 0, server, session);

        expect(broken).toEqual([]);
        expect(hit).toEqual([]);
    });

    it('still takes an action that carries no block, which arrives at the origin', async () => {
        const { sprinting, server, session } = fakeSession(Gametype.SURVIVAL);

        await new PlayerActionHandler().handleAction(
            PlayerAction.START_SPRINT,
            new BlockPosition(0, 0, 0),
            0,
            server,
            session
        );

        expect(sprinting).toEqual([true]);
    });
});
