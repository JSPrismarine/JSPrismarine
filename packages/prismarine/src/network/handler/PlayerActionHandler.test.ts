import { Gametype } from '@jsprismarine/minecraft';
import { PlayerActionPacket, PlayerActionType } from '@jsprismarine/protocol';
import type { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import type { Block } from '../../block/Block';
import type { Config } from '../../config/Config';
import type HumanInventory from '../../inventory/HumanInventory';
import { Item } from '../../item/Item';
import type { BlockMining } from '../../world/BlockMining';
import BlockPosition from '../../world/BlockPosition';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import PlayerActionHandler from './PlayerActionHandler';

const SELF = 7n;

/** What the player holds, so a test can see the break time is read for it. */
const PICKAXE = new Item({ name: 'minecraft:iron_pickaxe' });

/**
 * A player at the origin, with runtime id 7 and a pickaxe in hand, and a world that records
 * every block it was asked to touch.
 *
 * The world generates nothing, so a position the handler should have refused shows up here
 * as a call that was made rather than as terrain that appeared. Every log line is kept too,
 * so an action the handler should have taken quietly shows up as a line.
 */
const fakeSession = (gamemode: Gametype, { serverAuthoritativeBreaking = false } = {}) => {
    const broken: BlockPosition[] = [];
    const hit: BlockPosition[] = [];
    /** Whom each hit named as its striker, who is left out of the sound. */
    const strikers: Array<Player | undefined> = [];
    const resent: BlockPosition[] = [];
    const sprinting: boolean[] = [];
    const flying: boolean[] = [];
    const logged: string[] = [];
    /** Cracking calls in order, as `start x,y,z (previous)`, `stop x,y,z` and `event x,y,z`. */
    const cracking: string[] = [];
    /** The tool each crack animation was started for. */
    const tools: Array<Item | null> = [];
    const state: { mining: BlockMining | null } = { mining: null };
    const at = (where: Vector3) => `${where.getX()},${where.getY()},${where.getZ()}`;

    const world = stub<World>({
        breakBlock: async (where: Vector3) => {
            broken.push(BlockPosition.fromVector3(where));
            return true;
        },
        hitBlock: async (where: Vector3, _face: number, striker?: Player) => {
            hit.push(BlockPosition.fromVector3(where));
            strikers.push(striker);
        },
        resendBlock: (x, y, z) => void resent.push(new BlockPosition(x, y, z)),
        getBlock: async () => stub<Block>({ getBreakTime: () => 1 }),
        sendWorldEvent: async (where: Vector3 | null) => {
            if (where) cracking.push(`event ${at(where)}`);
        },
        startBlockCracking: async (where: Vector3, face: number, tool: Item | null, previous: BlockMining | null) => {
            cracking.push(`start ${at(where)} (${previous === null ? 'none' : at(previous.position)})`);
            tools.push(tool);
            return { position: where, face, runtimeId: 1, progressPerTick: 5461 };
        },
        stopBlockCracking: async (where: Vector3) => {
            cracking.push(`stop ${at(where)}`);
        }
    });

    const player = stub<Player>({
        gamemode,
        getName: () => 'tester',
        getRuntimeId: () => SELF,
        getPosition: () => new Position(0, 0, 0, world),
        getWorld: () => world,
        getInventory: () => stub<HumanInventory>({ getItemInHand: () => PICKAXE }),
        setSprinting: async (value) => {
            sprinting.push(value);
        },
        setFlying: async (value) => {
            flying.push(value);
        },
        getMining: () => state.mining,
        setMining: (mining) => {
            state.mining = mining;
        }
    });

    const logger = stub<Logger>({
        debug: (...message) => void logged.push(message[0] ?? ''),
        verbose: (...message) => void logged.push(message[0] ?? '')
    });

    return {
        broken,
        hit,
        strikers,
        resent,
        sprinting,
        flying,
        logged,
        cracking,
        tools,
        state,
        player,
        server: stub<Server>({
            getLogger: () => logger,
            getConfig: () => stub<Config>({ getServerAuthoritativeBlockBreaking: () => serverAuthoritativeBreaking })
        }),
        session: stub<PlayerSession>({ getPlayer: () => player })
    };
};

const FAR_AWAY = new BlockPosition(5_000_000, 64, 5_000_000);
const NOWHERE = new BlockPosition(0, 0, 0);

/** A standalone `PlayerActionPacket`, as the client sends one that concerns a block or none. */
const packet = (runtimeEntityId: bigint, action: PlayerActionType, blockPosition = NOWHERE): PlayerActionPacket =>
    new PlayerActionPacket({
        runtimeEntityId,
        action,
        blockPosition: { x: blockPosition.getX(), y: blockPosition.getY(), z: blockPosition.getZ() },
        resultPosition: { x: blockPosition.getX(), y: blockPosition.getY(), z: blockPosition.getZ() },
        blockFace: 0
    });

describe('PlayerActionHandler', () => {
    describe('handleAction', () => {
        it('breaks the block for a creative player within reach', async () => {
            const { broken, server, session } = fakeSession(Gametype.CREATIVE);

            await new PlayerActionHandler().handleAction(
                PlayerActionType.CreativeDestroyBlock,
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
                PlayerActionType.CreativeDestroyBlock,
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

            await handler.handleAction(PlayerActionType.CreativeDestroyBlock, FAR_AWAY, 0, server, session);
            await handler.handleAction(PlayerActionType.CrackBlock, FAR_AWAY, 0, server, session);

            expect(broken).toEqual([]);
            expect(hit).toEqual([]);
        });

        it('refuses every block action from a spectator', async () => {
            const { broken, hit, server, session } = fakeSession(Gametype.SPECTATOR);
            const handler = new PlayerActionHandler();
            const nearby = new BlockPosition(1, 0, 0);

            await handler.handleAction(PlayerActionType.CreativeDestroyBlock, nearby, 0, server, session);
            await handler.handleAction(PlayerActionType.CrackBlock, nearby, 0, server, session);

            expect(broken).toEqual([]);
            expect(hit).toEqual([]);
        });

        it('still takes an action that carries no block, which arrives at the origin', async () => {
            const { sprinting, server, session } = fakeSession(Gametype.SURVIVAL);

            await new PlayerActionHandler().handleAction(PlayerActionType.StartSprinting, NOWHERE, 0, server, session);

            expect(sprinting).toEqual([true]);
        });

        it('toggles flight for the flying pair', async () => {
            const { flying, server, session } = fakeSession(Gametype.CREATIVE);
            const handler = new PlayerActionHandler();

            await handler.handleAction(PlayerActionType.StartFlying, NOWHERE, 0, server, session);
            await handler.handleAction(PlayerActionType.StopFlying, NOWHERE, 0, server, session);

            expect(flying).toEqual([true, false]);
        });

        it('accepts the actions the docs still send standalone without logging anything', async () => {
            const { logged, server, session } = fakeSession(Gametype.SURVIVAL);
            const handler = new PlayerActionHandler();

            for (const action of [
                PlayerActionType.ChangeDimensionAck,
                PlayerActionType.StartSwimming,
                PlayerActionType.StopSwimming,
                PlayerActionType.StartGliding,
                PlayerActionType.StopGliding,
                PlayerActionType.StartSpinAttack,
                PlayerActionType.StopSpinAttack,
                PlayerActionType.MissedSwing
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

            await new PlayerActionHandler().handle(packet(SELF, PlayerActionType.StartFlying), server, session);

            expect(flying).toEqual([true]);
            expect(logged).toEqual([]);
        });

        it('drops a packet whose runtime id is not the sender', async () => {
            const { flying, logged, server, session } = fakeSession(Gametype.CREATIVE);

            await new PlayerActionHandler().handle(packet(8n, PlayerActionType.StartFlying), server, session);

            expect(flying).toEqual([]);
            expect(logged).toEqual([
                `Dropped action ${PlayerActionType.StartFlying} from tester: it names runtime id 8, not their own`
            ]);
        });

        it('ignores a block action that belongs in the input packet', async () => {
            const { hit, logged, server, session } = fakeSession(Gametype.SURVIVAL);
            const nearby = new BlockPosition(1, 0, 0);

            await new PlayerActionHandler().handle(
                packet(SELF, PlayerActionType.StartDestroyBlock, nearby),
                server,
                session
            );
            await new PlayerActionHandler().handle(packet(SELF, PlayerActionType.CrackBlock, nearby), server, session);

            expect(hit).toEqual([]);
            expect(logged).toEqual([
                `Ignored action ${PlayerActionType.StartDestroyBlock} from tester: block actions arrive in PlayerAuthInputPacket`,
                `Ignored action ${PlayerActionType.CrackBlock} from tester: block actions arrive in PlayerAuthInputPacket`
            ]);
        });

        it('still takes a creative break from the standalone packet', async () => {
            const { broken, server, session } = fakeSession(Gametype.CREATIVE);

            await new PlayerActionHandler().handle(
                packet(SELF, PlayerActionType.CreativeDestroyBlock, new BlockPosition(1, 2, 0)),
                server,
                session
            );

            expect(broken).toEqual([new BlockPosition(1, 2, 0)]);
        });
    });

    describe('with server-authoritative block breaking', () => {
        const near = (x: number) => new BlockPosition(x, 1, 0);
        const serverTimed = (gamemode = Gametype.SURVIVAL) =>
            fakeSession(gamemode, { serverAuthoritativeBreaking: true });

        it('breaks the block a survival player predicts gave way', async () => {
            const { broken, state, server, session } = serverTimed();
            const handler = new PlayerActionHandler();

            await handler.handleAction(PlayerActionType.ContinueDestroyBlock, near(2), 5, server, session);
            await handler.handleAction(PlayerActionType.PredictDestroyBlock, near(2), 5, server, session);

            expect(broken).toEqual([near(2)]);
            // Nothing is being mined any more, so the cracks stop being animated.
            expect(state.mining).toBeNull();
        });

        it('breaks nothing for an adventure player, and puts the block back on their screen', async () => {
            const { broken, resent, server, session } = serverTimed(Gametype.ADVENTURE);

            await new PlayerActionHandler().handleAction(
                PlayerActionType.PredictDestroyBlock,
                near(2),
                5,
                server,
                session
            );

            expect(broken).toEqual([]);
            expect(resent).toEqual([near(2)]);
        });

        it('refuses a predicted break out of reach', async () => {
            const { broken, server, session } = serverTimed();

            await new PlayerActionHandler().handleAction(
                PlayerActionType.PredictDestroyBlock,
                FAR_AWAY,
                5,
                server,
                session
            );

            expect(broken).toEqual([]);
        });

        it('starts the cracks for the tool in hand and remembers the block, without a hit sound', async () => {
            // The client sounds its own hits while it predicts a break; BDS sends none.
            const { hit, cracking, tools, state, server, session } = serverTimed();

            await new PlayerActionHandler().handleAction(
                PlayerActionType.StartDestroyBlock,
                near(2),
                1,
                server,
                session
            );

            expect(cracking).toEqual(['start 2,1,0 (none)']);
            expect(tools).toEqual([PICKAXE]);
            expect(state.mining).toMatchObject({ position: near(2), face: 1 });
            expect(hit).toEqual([]);
        });

        it('starts no cracks in creative, where a block breaks at once', async () => {
            const { cracking, state, server, session } = serverTimed(Gametype.CREATIVE);

            await new PlayerActionHandler().handleAction(
                PlayerActionType.StartDestroyBlock,
                near(2),
                1,
                server,
                session
            );

            expect(cracking).toEqual([]);
            expect(state.mining).toBeNull();
        });

        it('moves the cracks along when the player drags onto the next block', async () => {
            const { cracking, state, server, session } = serverTimed();
            const handler = new PlayerActionHandler();

            await handler.handleAction(PlayerActionType.StartDestroyBlock, near(2), 1, server, session);
            await handler.handleAction(PlayerActionType.ContinueDestroyBlock, near(3), 1, server, session);

            expect(cracking).toEqual(['start 2,1,0 (none)', 'start 3,1,0 (2,1,0)']);
            expect(state.mining).toMatchObject({ position: near(3) });
        });

        it('stops the cracks when the player lets go', async () => {
            const { cracking, state, server, session } = serverTimed();
            const handler = new PlayerActionHandler();

            await handler.handleAction(PlayerActionType.StartDestroyBlock, near(2), 1, server, session);
            await handler.handleAction(PlayerActionType.AbortDestroyBlock, near(2), 1, server, session);

            expect(cracking).toEqual(['start 2,1,0 (none)', 'stop 2,1,0']);
            expect(state.mining).toBeNull();
        });

        it('leaves the player out of the sound of each swing', async () => {
            const { hit, strikers, player, server, session } = serverTimed();

            await new PlayerActionHandler().handleAction(PlayerActionType.CrackBlock, near(2), 1, server, session);

            expect(hit).toEqual([near(2)]);
            expect(strikers).toEqual([player]);
        });
    });

    describe('with the client timing breaks', () => {
        const near = (x: number) => new BlockPosition(x, 1, 0);

        it('starts the crack animation once, with a hit, and leaves the ticking to the client', async () => {
            const { hit, strikers, player, cracking, state, server, session } = fakeSession(Gametype.SURVIVAL);

            await new PlayerActionHandler().handleAction(
                PlayerActionType.StartDestroyBlock,
                near(2),
                1,
                server,
                session
            );

            // Heard by everyone near but the player, whose client plays its own hits.
            expect(hit).toEqual([near(2)]);
            expect(strikers).toEqual([player]);
            expect(cracking).toEqual(['event 2,1,0']);
            expect(state.mining).toBeNull();
        });

        it('breaks nothing on a predicted break, which only a server-timed client sends', async () => {
            const { broken, server, session } = fakeSession(Gametype.SURVIVAL);

            await new PlayerActionHandler().handleAction(
                PlayerActionType.PredictDestroyBlock,
                near(2),
                5,
                server,
                session
            );

            expect(broken).toEqual([]);
        });
    });
});
