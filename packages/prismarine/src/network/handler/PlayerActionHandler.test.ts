import { Gametype } from '@jsprismarine/minecraft';
import { Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';
import { PlayerActionPacket, PlayerActionType } from '@jsprismarine/protocol';
import type { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type HumanInventory from '../../inventory/HumanInventory';
import { Item } from '../../item/Item';
import type { EntityRuntime } from '../../entity/data/EntityRuntime';
import type { LiveEntityRuntime } from '../../entity/data/live';
import { PlayerComponents } from '../../entity/playerComponents';
import type { BlockMining } from '../../world/BlockMining';
import { blockMiningOf } from '../../world/BlockMining';
import BlockPosition from '../../world/BlockPosition';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type Chunk from '../../world/chunk/Chunk';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
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
const fakeSession = (gamemode: Gametype, { serverAuthoritativeBreaking = false, chunksLoaded = true } = {}) => {
    const broken: BlockPosition[] = [];
    const hit: BlockPosition[] = [];
    /** Whom each hit named as its striker, who is left out of the sound. */
    const strikers: Array<Parameters<World['hitBlock']>[2]> = [];
    const resent: BlockPosition[] = [];
    const sprinting: boolean[] = [];
    const flying: boolean[] = [];
    const logged: string[] = [];
    /** Cracking calls in order, as `start x,y,z (previous)`, `stop x,y,z` and `event x,y,z`. */
    const cracking: string[] = [];
    /** The tool each crack animation was started for. */
    const tools: Array<Item | null> = [];
    /** What the client reported that the store player keeps: the block it mines, the sneak, the sleep and the jumps. */
    const components = new PlayerComponents(new Attributes(Attributes.getPlayerDefaults()), () => {});
    const jumps: number[] = [];
    const state = {
        get mining(): BlockMining | null {
            const held = components.get('mining.block');
            return blockMiningOf(held);
        }
    };
    const at = (where: Vector3) => `${where.getX()},${where.getY()},${where.getZ()}`;

    const world = stub<World>({
        breakBlock: async (where: Vector3) => {
            broken.push(BlockPosition.fromVector3(where));
            return true;
        },
        hitBlock: async (where: Vector3, _face: number, striker?: Parameters<World['hitBlock']>[2]) => {
            hit.push(BlockPosition.fromVector3(where));
            strikers.push(striker);
        },
        resendBlock: (x, y, z) => void resent.push(new BlockPosition(x, y, z)),
        // Every chunk near the player is loaded unless the test says otherwise, and every
        // block in it is stone.
        getLoadedChunk: () => (chunksLoaded ? stub<Chunk>({}) : null),
        loadedBlockAt: () => ({ name: 'minecraft:stone', states: {} }),
        sendWorldEvent: (where: Vector3 | null) => {
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

    const player = stubPlayerPort({
        gamemode,
        getPosition: () => new Position(0, 0, 0, world),
        getInventory: () => stub<HumanInventory>({ getItemInHand: () => PICKAXE }),
        getComponents: () => components
    });
    // The runtime's answer for a player in no store: each input lands on the components.
    const inputs = stub<EntityRuntime>({
        setPlayerMining: (_player, mining) => components.set('mining.block', mining),
        setPlayerSneaking: (_player, sneaking) => components.set('movement.sneaking', sneaking),
        playerJumped: () => void jumps.push(1)
    });
    Object.assign(world, { dataEntities: () => stub<LiveEntityRuntime>({ runtime: inputs }) });

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
        log: logger,
        config: { getServerAuthoritativeBlockBreaking: () => serverAuthoritativeBreaking },
        components,
        jumps,
        session: stub<PlayerSession>({
            runtimeId: SELF,
            identity: identityNamed('tester'),
            getPlayer: () => player,
            getWorld: () => world,
            inputs: () => inputs,
            setSprinting: async (value: boolean) => {
                sprinting.push(value);
            },
            setFlying: async (value: boolean) => {
                flying.push(value);
            }
        })
    };
};

type Scene = ReturnType<typeof fakeSession>;

/** Applies one action as the input step does: the handler, then what it deferred and sent. */
const act = async ({ session, log, config }: Scene, action: number, position: BlockPosition, face: number) => {
    const { context, settled } = inputContext(session, { log, config });
    new PlayerActionHandler().handleAction(action, position, face, context);
    await settled();
};

/** Applies one standalone packet as the input step does. */
const handle = async ({ session, log, config }: Scene, received: PlayerActionPacket) => {
    const { context, settled } = inputContext(session, { log, config });
    new PlayerActionHandler().handle(received, context);
    await settled();
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
            const scene = fakeSession(Gametype.CREATIVE);
            const { broken } = scene;

            await act(scene, PlayerActionType.CreativeDestroyBlock, new BlockPosition(1, 2, 0), 0);

            expect(broken).toEqual([new BlockPosition(1, 2, 0)]);
        });

        it('refuses a creative break from a player who is not in creative', async () => {
            const scene = fakeSession(Gametype.SURVIVAL);
            const { broken } = scene;

            await act(scene, PlayerActionType.CreativeDestroyBlock, new BlockPosition(1, 2, 0), 0);

            expect(broken).toEqual([]);
        });

        it('refuses a block action aimed far outside the player reach', async () => {
            const scene = fakeSession(Gametype.CREATIVE);
            const { broken, hit } = scene;

            await act(scene, PlayerActionType.CreativeDestroyBlock, FAR_AWAY, 0);
            await act(scene, PlayerActionType.CrackBlock, FAR_AWAY, 0);

            expect(broken).toEqual([]);
            expect(hit).toEqual([]);
        });

        it('refuses a block action in a chunk that is not loaded, and reads no block for it', async () => {
            // The input step cannot wait for a chunk, and a client cannot act on terrain it was
            // never sent.
            const scene = fakeSession(Gametype.CREATIVE, { chunksLoaded: false });
            const nearby = new BlockPosition(1, 0, 0);

            await act(scene, PlayerActionType.CreativeDestroyBlock, nearby, 0);
            await act(scene, PlayerActionType.CrackBlock, nearby, 0);
            await act(scene, PlayerActionType.StartDestroyBlock, nearby, 0);

            expect(scene.broken).toEqual([]);
            expect(scene.hit).toEqual([]);
            expect(scene.cracking).toEqual([]);
            expect(scene.logged).toHaveLength(3);
        });

        it('defers a break, which still waits on the world, and writes nothing before the step runs it', async () => {
            const scene = fakeSession(Gametype.CREATIVE);
            const { context, deferred, settled } = inputContext(scene.session, scene);

            new PlayerActionHandler().handleAction(
                PlayerActionType.CreativeDestroyBlock,
                new BlockPosition(1, 2, 0),
                0,
                context
            );

            expect(deferred).toHaveLength(1);
            expect(scene.broken).toEqual([]);
            await settled();
            expect(scene.broken).toEqual([new BlockPosition(1, 2, 0)]);
        });

        it('takes a jump, a sneak and a sprint in the handler, with nothing deferred', () => {
            const scene = fakeSession(Gametype.SURVIVAL);
            const { context, deferred } = inputContext(scene.session, scene);
            const handler = new PlayerActionHandler();

            handler.handleAction(PlayerActionType.StartJump, NOWHERE, 0, context);
            handler.handleAction(PlayerActionType.StartSneaking, NOWHERE, 0, context);
            handler.handleAction(PlayerActionType.StartSprinting, NOWHERE, 0, context);

            expect(scene.jumps).toEqual([1]);
            expect(scene.components.get('movement.sneaking')).toBe(true);
            expect(scene.sprinting).toEqual([true]);
            expect(deferred).toHaveLength(0);
        });

        it('refuses every block action from a spectator', async () => {
            const scene = fakeSession(Gametype.SPECTATOR);
            const { broken, hit } = scene;
            const nearby = new BlockPosition(1, 0, 0);

            await act(scene, PlayerActionType.CreativeDestroyBlock, nearby, 0);
            await act(scene, PlayerActionType.CrackBlock, nearby, 0);

            expect(broken).toEqual([]);
            expect(hit).toEqual([]);
        });

        it('still takes an action that carries no block, which arrives at the origin', async () => {
            const scene = fakeSession(Gametype.SURVIVAL);
            const { sprinting } = scene;

            await act(scene, PlayerActionType.StartSprinting, NOWHERE, 0);

            expect(sprinting).toEqual([true]);
        });

        it('toggles flight for the flying pair', async () => {
            const scene = fakeSession(Gametype.CREATIVE);
            const { flying } = scene;

            await act(scene, PlayerActionType.StartFlying, NOWHERE, 0);
            await act(scene, PlayerActionType.StopFlying, NOWHERE, 0);

            expect(flying).toEqual([true, false]);
        });

        it('accepts the actions the docs still send standalone without logging anything', async () => {
            const scene = fakeSession(Gametype.SURVIVAL);
            const { logged } = scene;

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
                await act(scene, action, NOWHERE, 0);
            }

            expect(logged).toEqual([]);
        });

        it('logs an action number outside the enum and does not throw', async () => {
            const scene = fakeSession(Gametype.SURVIVAL);
            const { logged } = scene;

            await act(scene, 99, NOWHERE, 0);

            expect(logged).toEqual(['Dropped action 99 from tester: not one a client sends']);
        });
    });

    describe('handle', () => {
        it('acts on a packet that names the sender', async () => {
            const scene = fakeSession(Gametype.CREATIVE);
            const { flying, logged } = scene;

            await handle(scene, packet(SELF, PlayerActionType.StartFlying));

            expect(flying).toEqual([true]);
            expect(logged).toEqual([]);
        });

        it('drops a packet whose runtime id is not the sender', async () => {
            const scene = fakeSession(Gametype.CREATIVE);
            const { flying, logged } = scene;

            await handle(scene, packet(8n, PlayerActionType.StartFlying));

            expect(flying).toEqual([]);
            expect(logged).toEqual([
                `Dropped action ${PlayerActionType.StartFlying} from tester: it names runtime id 8, not their own`
            ]);
        });

        it('ignores a block action that belongs in the input packet', async () => {
            const scene = fakeSession(Gametype.SURVIVAL);
            const { hit, logged } = scene;
            const nearby = new BlockPosition(1, 0, 0);

            await handle(scene, packet(SELF, PlayerActionType.StartDestroyBlock, nearby));
            await handle(scene, packet(SELF, PlayerActionType.CrackBlock, nearby));

            expect(hit).toEqual([]);
            expect(logged).toEqual([
                `Ignored action ${PlayerActionType.StartDestroyBlock} from tester: block actions arrive in PlayerAuthInputPacket`,
                `Ignored action ${PlayerActionType.CrackBlock} from tester: block actions arrive in PlayerAuthInputPacket`
            ]);
        });

        it('still takes a creative break from the standalone packet', async () => {
            const scene = fakeSession(Gametype.CREATIVE);
            const { broken } = scene;

            await handle(scene, packet(SELF, PlayerActionType.CreativeDestroyBlock, new BlockPosition(1, 2, 0)));

            expect(broken).toEqual([new BlockPosition(1, 2, 0)]);
        });
    });

    describe('with server-authoritative block breaking', () => {
        const near = (x: number) => new BlockPosition(x, 1, 0);
        const serverTimed = (gamemode = Gametype.SURVIVAL) =>
            fakeSession(gamemode, { serverAuthoritativeBreaking: true });

        it('breaks the block a survival player predicts gave way', async () => {
            const scene = serverTimed();
            const { broken, state } = scene;

            await act(scene, PlayerActionType.ContinueDestroyBlock, near(2), 5);
            await act(scene, PlayerActionType.PredictDestroyBlock, near(2), 5);

            expect(broken).toEqual([near(2)]);
            // Nothing is being mined any more, so the cracks stop being animated.
            expect(state.mining).toBeNull();
        });

        it('breaks nothing for an adventure player, and puts the block back on their screen', async () => {
            const scene = serverTimed(Gametype.ADVENTURE);
            const { broken, resent } = scene;

            await act(scene, PlayerActionType.PredictDestroyBlock, near(2), 5);

            expect(broken).toEqual([]);
            expect(resent).toEqual([near(2)]);
        });

        it('refuses a predicted break out of reach', async () => {
            const scene = serverTimed();
            const { broken } = scene;

            await act(scene, PlayerActionType.PredictDestroyBlock, FAR_AWAY, 5);

            expect(broken).toEqual([]);
        });

        it('starts the cracks for the tool in hand and remembers the block, without a hit sound', async () => {
            // The client sounds its own hits while it predicts a break; BDS sends none.
            const scene = serverTimed();
            const { hit, cracking, tools, state } = scene;

            await act(scene, PlayerActionType.StartDestroyBlock, near(2), 1);

            expect(cracking).toEqual(['start 2,1,0 (none)']);
            expect(tools).toEqual([PICKAXE]);
            expect(state.mining).toMatchObject({ position: near(2), face: 1 });
            expect(hit).toEqual([]);
        });

        it('starts no cracks in creative, where a block breaks at once', async () => {
            const scene = serverTimed(Gametype.CREATIVE);
            const { cracking, state } = scene;

            await act(scene, PlayerActionType.StartDestroyBlock, near(2), 1);

            expect(cracking).toEqual([]);
            expect(state.mining).toBeNull();
        });

        it('moves the cracks along when the player drags onto the next block', async () => {
            const scene = serverTimed();
            const { cracking, state } = scene;

            await act(scene, PlayerActionType.StartDestroyBlock, near(2), 1);
            await act(scene, PlayerActionType.ContinueDestroyBlock, near(3), 1);

            expect(cracking).toEqual(['start 2,1,0 (none)', 'start 3,1,0 (2,1,0)']);
            expect(state.mining).toMatchObject({ position: near(3) });
        });

        it('stops the cracks when the player lets go', async () => {
            const scene = serverTimed();
            const { cracking, state } = scene;

            await act(scene, PlayerActionType.StartDestroyBlock, near(2), 1);
            await act(scene, PlayerActionType.AbortDestroyBlock, near(2), 1);

            expect(cracking).toEqual(['start 2,1,0 (none)', 'stop 2,1,0']);
            expect(state.mining).toBeNull();
        });

        it('leaves the player out of the sound of each swing', async () => {
            const scene = serverTimed();
            const { hit, strikers, player } = scene;

            await act(scene, PlayerActionType.CrackBlock, near(2), 1);

            expect(hit).toEqual([near(2)]);
            expect(strikers).toEqual([player]);
        });
    });

    describe('with the client timing breaks', () => {
        const near = (x: number) => new BlockPosition(x, 1, 0);

        it('starts the crack animation once, with a hit, and leaves the ticking to the client', async () => {
            const scene = fakeSession(Gametype.SURVIVAL);
            const { hit, strikers, player, cracking, state } = scene;

            await act(scene, PlayerActionType.StartDestroyBlock, near(2), 1);

            // Heard by everyone near but the player, whose client plays its own hits.
            expect(hit).toEqual([near(2)]);
            expect(strikers).toEqual([player]);
            expect(cracking).toEqual(['event 2,1,0']);
            expect(state.mining).toBeNull();
        });

        it('breaks nothing on a predicted break, which only a server-timed client sends', async () => {
            const scene = fakeSession(Gametype.SURVIVAL);
            const { broken } = scene;

            await act(scene, PlayerActionType.PredictDestroyBlock, near(2), 5);

            expect(broken).toEqual([]);
        });
    });
});
