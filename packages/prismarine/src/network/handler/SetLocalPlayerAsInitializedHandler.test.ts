import { describe, expect, it, vi } from 'vitest';

import type { StoreActor } from '../../entity/data/storeActors';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type { StorePlayerActor } from '../../entity/data/storePlayers';
import type { World } from '../../world/World';
import type PlayerSession from '../PlayerSession';
import type { HandlerLog } from './HandlerContext';
import { SetLocalPlayerAsInitializedPacket } from '@jsprismarine/protocol';
import SetLocalPlayerAsInitializedHandler from './SetLocalPlayerAsInitializedHandler';

/**
 * A player whose world holds whatever was added to it, which is what the handler reads to
 * tell a first notice from a repeat.
 */
const fakeSession = () => {
    const order: string[] = [];
    const added = new Map<bigint, StoreActor>();

    const world: World = stub<World>({
        getActor: (runtimeId) => added.get(runtimeId) ?? null,
        addPlayer: (player) => {
            order.push('addPlayer');
            const actor = player.getActor();
            if (actor !== undefined) added.set(player.getRuntimeId(), actor);
        }
    });

    const completeSpawn = vi.fn(async () => void order.push('completeSpawn'));
    const player = stubPlayerPort({ getRuntimeId: () => 7n });

    return {
        completeSpawn,
        order,
        session: stub<PlayerSession>({
            runtimeId: 7n,
            identity: identityNamed('Steve'),
            getPlayer: () => player,
            getActor: () => stub<StorePlayerActor>({ getRuntimeId: () => 7n }),
            getRuntimeId: () => 7n,
            getWorld: () => world,
            completeSpawn
        })
    };
};

/** Applies one notice as the input step does: the handler, then the sends it handed over. */
const notify = async (handler: SetLocalPlayerAsInitializedHandler, session: PlayerSession): Promise<void> => {
    const { context, settled } = inputContext(session, { log: stub<HandlerLog>({ debug: () => {} }) });
    handler.handle(new SetLocalPlayerAsInitializedPacket(), context);
    await settled();
};

describe('SetLocalPlayerAsInitializedHandler', () => {
    it('puts the player into the world and then completes the spawn', async () => {
        // In that order: `completeSpawn` broadcasts a move, and a move for a player the world
        // does not hold yet reaches nobody.
        const { order, session } = fakeSession();

        await notify(new SetLocalPlayerAsInitializedHandler(), session);

        expect(order).toEqual(['addPlayer', 'completeSpawn']);
    });

    it('completes the spawn exactly once', async () => {
        // This is the only place it runs now. It also ran from the join burst, so the
        // inventory and settings went out twice.
        const { completeSpawn, session } = fakeSession();

        await notify(new SetLocalPlayerAsInitializedHandler(), session);

        expect(completeSpawn).toHaveBeenCalledOnce();
    });

    it('drops a second notice, which would announce the player again', async () => {
        const { completeSpawn, order, session } = fakeSession();
        const handler = new SetLocalPlayerAsInitializedHandler();

        await notify(handler, session);
        await notify(handler, session);

        expect(order).toEqual(['addPlayer', 'completeSpawn']);
        expect(completeSpawn).toHaveBeenCalledOnce();
    });

    it("adds the player and completes the spawn in the input's own unit", () => {
        const { order, session } = fakeSession();
        const { context, outputs } = inputContext(session);

        expect(
            new SetLocalPlayerAsInitializedHandler().handle(new SetLocalPlayerAsInitializedPacket(), context)
        ).toBeUndefined();

        // Both have written before the handler returns, and the one output is
        // the spawn's sends.
        expect(outputs).toHaveLength(1);
        expect(order).toEqual(['addPlayer', 'completeSpawn']);
    });
});
