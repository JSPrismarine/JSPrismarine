import { Gametype } from '@jsprismarine/minecraft';
import { PlayerActionPacket, PlayerActionType } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import type { StatusEffect } from '../../../entity/StatusEffect';
import { MINING_LATENCY_TICKS } from '../../../world/BlockMining';
import BlockPosition from '../../../world/BlockPosition';
import { inputContext } from '../../../testing/handlerContext.test.helper';
import type { MiningScene } from '../../../testing/miningScene.test-utils';
import { miningScene, PICKAXE, SELF } from '../../../testing/miningScene.test-utils';
import { stub } from '../../../testing/stub.test.helper';
import PlayerActionHandler from './PlayerActionHandler';

type Scene = MiningScene;

/** Applies one action as the input step does: the handler, then what it sent. */
const act = async ({ session, log, config, clock }: Scene, action: number, position: BlockPosition, face: number) => {
    const { context, settled } = inputContext(session, { log, config, tick: clock.tick });
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
            const scene = miningScene(Gametype.CREATIVE);
            const { broken } = scene;

            await act(scene, PlayerActionType.CreativeDestroyBlock, new BlockPosition(1, 2, 0), 0);

            expect(broken).toEqual([new BlockPosition(1, 2, 0)]);
        });

        it('refuses a creative break from a player who is not in creative', async () => {
            const scene = miningScene(Gametype.SURVIVAL);
            const { broken } = scene;

            await act(scene, PlayerActionType.CreativeDestroyBlock, new BlockPosition(1, 2, 0), 0);

            expect(broken).toEqual([]);
        });

        it('refuses a block action aimed far outside the player reach', async () => {
            const scene = miningScene(Gametype.CREATIVE);
            const { broken, hit } = scene;

            await act(scene, PlayerActionType.CreativeDestroyBlock, FAR_AWAY, 0);
            await act(scene, PlayerActionType.CrackBlock, FAR_AWAY, 0);

            expect(broken).toEqual([]);
            expect(hit).toEqual([]);
        });

        it('refuses a block action in a chunk that is not loaded, and reads no block for it', async () => {
            // The input step cannot wait for a chunk, and a client cannot act on terrain it was
            // never sent.
            const scene = miningScene(Gametype.CREATIVE, { chunksLoaded: false });
            const nearby = new BlockPosition(1, 0, 0);

            await act(scene, PlayerActionType.CreativeDestroyBlock, nearby, 0);
            await act(scene, PlayerActionType.CrackBlock, nearby, 0);
            await act(scene, PlayerActionType.StartDestroyBlock, nearby, 0);

            expect(scene.broken).toEqual([]);
            expect(scene.hit).toEqual([]);
            expect(scene.cracking).toEqual([]);
            expect(scene.logged).toHaveLength(3);
        });

        it('breaks a block in the handler', () => {
            const scene = miningScene(Gametype.CREATIVE);
            const { context } = inputContext(scene.session, scene);

            new PlayerActionHandler().handleAction(
                PlayerActionType.CreativeDestroyBlock,
                new BlockPosition(1, 2, 0),
                0,
                context
            );
            expect(scene.broken).toEqual([new BlockPosition(1, 2, 0)]);
        });

        it('takes a jump, a sneak and a sprint in the handler', () => {
            const scene = miningScene(Gametype.SURVIVAL);
            const { context } = inputContext(scene.session, scene);
            const handler = new PlayerActionHandler();

            handler.handleAction(PlayerActionType.StartJump, NOWHERE, 0, context);
            handler.handleAction(PlayerActionType.StartSneaking, NOWHERE, 0, context);
            handler.handleAction(PlayerActionType.StartSprinting, NOWHERE, 0, context);

            expect(scene.jumps).toEqual([1]);
            expect(scene.components.get('movement.sneaking')).toBe(true);
            expect(scene.sprinting).toEqual([true]);
        });

        it('refuses every block action from a spectator', async () => {
            const scene = miningScene(Gametype.SPECTATOR);
            const { broken, hit } = scene;
            const nearby = new BlockPosition(1, 0, 0);

            await act(scene, PlayerActionType.CreativeDestroyBlock, nearby, 0);
            await act(scene, PlayerActionType.CrackBlock, nearby, 0);

            expect(broken).toEqual([]);
            expect(hit).toEqual([]);
        });

        it('still takes an action that carries no block, which arrives at the origin', async () => {
            const scene = miningScene(Gametype.SURVIVAL);
            const { sprinting } = scene;

            await act(scene, PlayerActionType.StartSprinting, NOWHERE, 0);

            expect(sprinting).toEqual([true]);
        });

        it('toggles flight for the flying pair', async () => {
            const scene = miningScene(Gametype.CREATIVE);
            const { flying } = scene;

            await act(scene, PlayerActionType.StartFlying, NOWHERE, 0);
            await act(scene, PlayerActionType.StopFlying, NOWHERE, 0);

            expect(flying).toEqual([true, false]);
        });

        it('accepts the actions the docs still send standalone without logging anything', async () => {
            const scene = miningScene(Gametype.SURVIVAL);
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
            const scene = miningScene(Gametype.SURVIVAL);
            const { logged } = scene;

            await act(scene, 99, NOWHERE, 0);

            expect(logged).toEqual(['Dropped action 99 from tester: not one a client sends']);
        });
    });

    describe('handle', () => {
        it('acts on a packet that names the sender', async () => {
            const scene = miningScene(Gametype.CREATIVE);
            const { flying, logged } = scene;

            await handle(scene, packet(SELF, PlayerActionType.StartFlying));

            expect(flying).toEqual([true]);
            expect(logged).toEqual([]);
        });

        it('drops a packet whose runtime id is not the sender', async () => {
            const scene = miningScene(Gametype.CREATIVE);
            const { flying, logged } = scene;

            await handle(scene, packet(8n, PlayerActionType.StartFlying));

            expect(flying).toEqual([]);
            expect(logged).toEqual([
                `Dropped action ${PlayerActionType.StartFlying} from tester: it names runtime id 8, not their own`
            ]);
        });

        it('ignores a block action that belongs in the input packet', async () => {
            const scene = miningScene(Gametype.SURVIVAL);
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
            const scene = miningScene(Gametype.CREATIVE);
            const { broken } = scene;

            await handle(scene, packet(SELF, PlayerActionType.CreativeDestroyBlock, new BlockPosition(1, 2, 0)));

            expect(broken).toEqual([new BlockPosition(1, 2, 0)]);
        });
    });

    describe('with server-authoritative block breaking', () => {
        const near = (x: number) => new BlockPosition(x, 1, 0);
        const serverTimed = (gamemode = Gametype.SURVIVAL) =>
            miningScene(gamemode, { serverAuthoritativeBreaking: true });

        it('breaks the block a survival player predicts gave way', async () => {
            const scene = serverTimed();
            const { broken, state, clock } = scene;

            await act(scene, PlayerActionType.ContinueDestroyBlock, near(2), 5);
            clock.tick += 20;
            await act(scene, PlayerActionType.PredictDestroyBlock, near(2), 5);

            expect(broken).toEqual([near(2)]);
            // Nothing is being mined any more, so the cracks stop being animated.
            expect(state.mining).toBeNull();
        });

        it('breaks a block mined long enough when the prediction rides with a continuation', async () => {
            const scene = serverTimed();
            const { broken, clock } = scene;

            await act(scene, PlayerActionType.StartDestroyBlock, near(2), 5);
            clock.tick += 20;
            // The same input restarts the cracks on the block and predicts it gave way.
            await act(scene, PlayerActionType.ContinueDestroyBlock, near(2), 5);
            await act(scene, PlayerActionType.PredictDestroyBlock, near(2), 5);

            expect(broken).toEqual([near(2)]);
        });

        it('allows a predicted break a few ticks early, for network jitter', async () => {
            const scene = serverTimed();
            const { broken, clock } = scene;

            await act(scene, PlayerActionType.StartDestroyBlock, near(2), 5);
            clock.tick += 20 - MINING_LATENCY_TICKS;
            await act(scene, PlayerActionType.PredictDestroyBlock, near(2), 5);

            expect(broken).toEqual([near(2)]);
        });

        it('breaks a block the client mined in full while the server skipped ticks', async () => {
            const scene = serverTimed();
            const { broken, clock } = scene;

            await act(scene, PlayerActionType.StartDestroyBlock, near(2), 5);
            // A second of the client's inputs, over which the server fell behind and ran only five.
            clock.inputs += 20;
            clock.tick += 5;
            await act(scene, PlayerActionType.PredictDestroyBlock, near(2), 5);

            expect(broken).toEqual([near(2)]);
        });

        it('refuses a predicted break when neither clock gave the block time to give way', async () => {
            const scene = serverTimed();
            const { broken, clock } = scene;

            await act(scene, PlayerActionType.StartDestroyBlock, near(2), 5);
            clock.inputs += 20 - MINING_LATENCY_TICKS - 1;
            clock.tick += 20 - MINING_LATENCY_TICKS - 1;
            await act(scene, PlayerActionType.PredictDestroyBlock, near(2), 5);

            expect(broken).toEqual([]);
        });

        it('refuses a predicted break that came before the block could give way', async () => {
            const scene = serverTimed();
            const { broken, resent, cracking, clock, state } = scene;

            await act(scene, PlayerActionType.StartDestroyBlock, near(2), 5);
            clock.tick += 20 - MINING_LATENCY_TICKS - 1;
            await act(scene, PlayerActionType.PredictDestroyBlock, near(2), 5);

            expect(broken).toEqual([]);
            expect(resent).toEqual([near(2)]);
            expect(cracking.at(-1)).toBe('stop 2,1,0');
            expect(state.mining).toBeNull();
        });

        it('accepts a break sped up by haste', async () => {
            const scene = serverTimed();
            const { broken, clock, effects } = scene;
            effects.push(stub<StatusEffect>({ id: 'minecraft:haste', amplifier: 1 }));

            // Haste II mines 1.4 times as fast: 20 ticks become 14.
            await act(scene, PlayerActionType.StartDestroyBlock, near(2), 5);
            clock.tick += 14 - MINING_LATENCY_TICKS;
            await act(scene, PlayerActionType.PredictDestroyBlock, near(2), 5);

            expect(broken).toEqual([near(2)]);
        });

        it('refuses a predicted break of a block nobody started mining', async () => {
            const scene = serverTimed();
            const { broken, resent, clock } = scene;
            clock.tick = 1_000;

            await act(scene, PlayerActionType.PredictDestroyBlock, near(2), 5);

            expect(broken).toEqual([]);
            expect(resent).toEqual([near(2)]);
        });

        it('refuses a predicted break of a block other than the one being mined', async () => {
            const scene = serverTimed();
            const { broken, resent, clock } = scene;

            await act(scene, PlayerActionType.StartDestroyBlock, near(2), 5);
            clock.tick += 100;
            await act(scene, PlayerActionType.PredictDestroyBlock, near(3), 5);

            expect(broken).toEqual([]);
            expect(resent).toEqual([near(3)]);
        });

        it('refuses a predicted break once another block stands where the mined one was', async () => {
            const scene = serverTimed();
            const { broken, resent, clock, standing } = scene;

            await act(scene, PlayerActionType.StartDestroyBlock, near(2), 5);
            clock.tick += 100;
            // Someone put an unbreakable block down in its place before the prediction came.
            standing.runtimeId = 2;
            await act(scene, PlayerActionType.PredictDestroyBlock, near(2), 5);

            expect(broken).toEqual([]);
            expect(resent).toEqual([near(2)]);
        });

        it('refuses a predicted break of a block that never breaks', async () => {
            const scene = miningScene(Gametype.SURVIVAL, {
                serverAuthoritativeBreaking: true,
                breakSeconds: Number.POSITIVE_INFINITY
            });
            const { broken, clock } = scene;

            await act(scene, PlayerActionType.StartDestroyBlock, near(2), 5);
            clock.tick += 1_000_000;
            await act(scene, PlayerActionType.PredictDestroyBlock, near(2), 5);

            expect(broken).toEqual([]);
        });

        it('breaks a block that gives way at once, which has no mining to time', async () => {
            const scene = miningScene(Gametype.SURVIVAL, { serverAuthoritativeBreaking: true, breakSeconds: 0 });

            await act(scene, PlayerActionType.PredictDestroyBlock, near(2), 5);

            expect(scene.broken).toEqual([near(2)]);
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
            const scene = miningScene(Gametype.SURVIVAL);
            const { hit, strikers, player, cracking, state } = scene;

            await act(scene, PlayerActionType.StartDestroyBlock, near(2), 1);

            // Heard by everyone near but the player, whose client plays its own hits.
            expect(hit).toEqual([near(2)]);
            expect(strikers).toEqual([player]);
            expect(cracking).toEqual(['event 2,1,0']);
            expect(state.mining).toBeNull();
        });

        it('breaks nothing on a predicted break, which only a server-timed client sends', async () => {
            const scene = miningScene(Gametype.SURVIVAL);
            const { broken } = scene;

            await act(scene, PlayerActionType.PredictDestroyBlock, near(2), 5);

            expect(broken).toEqual([]);
        });
    });
});
