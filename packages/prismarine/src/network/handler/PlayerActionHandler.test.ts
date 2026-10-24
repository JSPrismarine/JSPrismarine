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
import PlayerActionPacket, { PlayerAction } from '../packet/PlayerActionPacket';
import PlayerActionHandler from './PlayerActionHandler';

const SELF = 7n;

/**
 * A player at the origin, with runtime id 7, and a world that records every block it was
 * asked to touch.
 *
 * The world generates nothing, so a position the handler should have refused shows up here
 * as a call that was made rather than as terrain that appeared. Every log line is kept too,
 * so an action the handler should have taken quietly shows up as a line.
 */
const fakeSession = (gamemode: Gametype) => {
    const broken: BlockPosition[] = [];
    const hit: BlockPosition[] = [];
    const sprinting: boolean[] = [];
    const flying: boolean[] = [];
    const logged: string[] = [];

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
        getRuntimeId: () => SELF,
        getPosition: () => new Position(0, 0, 0, world),
        getWorld: () => world,
        setSprinting: async (value) => {
            sprinting.push(value);
        },
        setFlying: async (value) => {
            flying.push(value);
        }
    });

    const logger = stub<Logger>({
        debug: (...message) => void logged.push(message[0] ?? ''),
        verbose: (...message) => void logged.push(message[0] ?? '')
    });

    return {
        broken,
        hit,
        sprinting,
        flying,
        logged,
        server: stub<Server>({ getLogger: () => logger }),
        session: stub<PlayerSession>({ getPlayer: () => player })
    };
};

const FAR_AWAY = new BlockPosition(5_000_000, 64, 5_000_000);
const NOWHERE = new BlockPosition(0, 0, 0);

/** A standalone `PlayerActionPacket`, as the client sends one that concerns a block or none. */
const packet = (runtimeEntityId: bigint, action: number, blockPosition = NOWHERE): PlayerActionPacket =>
    Object.assign(new PlayerActionPacket(), {
        runtimeEntityId,
        action,
        blockPosition,
        resultPosition: blockPosition,
        blockFace: 0
    });

describe('PlayerActionHandler', () => {
    describe('handleAction', () => {
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

            await new PlayerActionHandler().handleAction(PlayerAction.START_SPRINT, NOWHERE, 0, server, session);

            expect(sprinting).toEqual([true]);
        });

        it('toggles flight for the flying pair', async () => {
            const { flying, server, session } = fakeSession(Gametype.CREATIVE);
            const handler = new PlayerActionHandler();

            await handler.handleAction(PlayerAction.START_FLYING, NOWHERE, 0, server, session);
            await handler.handleAction(PlayerAction.STOP_FLYING, NOWHERE, 0, server, session);

            expect(flying).toEqual([true, false]);
        });

        it('accepts the actions the docs still send standalone without logging anything', async () => {
            const { logged, server, session } = fakeSession(Gametype.SURVIVAL);
            const handler = new PlayerActionHandler();

            for (const action of [
                PlayerAction.DIMENSION_CHANGE_ACK,
                PlayerAction.START_SWIMMING,
                PlayerAction.STOP_SWIMMING,
                PlayerAction.START_GLIDE,
                PlayerAction.STOP_GLIDE,
                PlayerAction.START_SPIN_ATTACK,
                PlayerAction.STOP_SPIN_ATTACK,
                PlayerAction.MISSED_SWING
            ]) {
                await handler.handleAction(action, NOWHERE, 0, server, session);
            }

            expect(logged).toEqual([]);
        });

        it('logs an action number outside the enum and does not throw', async () => {
            const { logged, server, session } = fakeSession(Gametype.SURVIVAL);

            await new PlayerActionHandler().handleAction(99, NOWHERE, 0, server, session);

            expect(logged).toEqual(['Dropped action 99 from tester: not one a client sends']);
        });
    });

    describe('handle', () => {
        it('acts on a packet that names the sender', async () => {
            const { flying, logged, server, session } = fakeSession(Gametype.CREATIVE);

            await new PlayerActionHandler().handle(packet(SELF, PlayerAction.START_FLYING), server, session);

            expect(flying).toEqual([true]);
            expect(logged).toEqual([]);
        });

        it('drops a packet whose runtime id is not the sender', async () => {
            const { flying, logged, server, session } = fakeSession(Gametype.CREATIVE);

            await new PlayerActionHandler().handle(packet(8n, PlayerAction.START_FLYING), server, session);

            expect(flying).toEqual([]);
            expect(logged).toEqual([
                `Dropped action ${PlayerAction.START_FLYING} from tester: it names runtime id 8, not their own`
            ]);
        });

        it('ignores a block action that belongs in the input packet', async () => {
            const { hit, logged, server, session } = fakeSession(Gametype.SURVIVAL);
            const nearby = new BlockPosition(1, 0, 0);

            await new PlayerActionHandler().handle(packet(SELF, PlayerAction.START_BREAK, nearby), server, session);
            await new PlayerActionHandler().handle(packet(SELF, PlayerAction.CRACK_BLOCK, nearby), server, session);

            expect(hit).toEqual([]);
            expect(logged).toEqual([
                `Ignored action ${PlayerAction.START_BREAK} from tester: block actions arrive in PlayerAuthInputPacket`,
                `Ignored action ${PlayerAction.CRACK_BLOCK} from tester: block actions arrive in PlayerAuthInputPacket`
            ]);
        });

        it('still takes a creative break from the standalone packet', async () => {
            const { broken, server, session } = fakeSession(Gametype.CREATIVE);

            await new PlayerActionHandler().handle(
                packet(SELF, PlayerAction.CREATIVE_PLAYER_DESTROY_BLOCK, new BlockPosition(1, 2, 0)),
                server,
                session
            );

            expect(broken).toEqual([new BlockPosition(1, 2, 0)]);
        });
    });
});
