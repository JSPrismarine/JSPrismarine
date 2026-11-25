import { describe, expect, it } from 'vitest';

import type { StoreActor } from '../../entity/data/storeActors';
import type { StorePlayerActor } from '../../entity/data/storePlayers';
import type { HandlerLog } from '../../player/context/HandlerContext';
import type PlayerSession from '../../player/PlayerSession';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type { World } from '../../world/World';
import PlayerInitializedHandler from './PlayerInitializedHandler';

/**
 * A player whose world holds whatever was added to it, which is what the handler reads to
 * tell a first notice from a repeat. `order` records the world entry and each spawn completion.
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
    const player = stubPlayerPort({ getRuntimeId: () => 7n });

    return {
        order,
        session: stub<PlayerSession>({
            runtimeId: 7n,
            identity: identityNamed('Steve'),
            getPlayer: () => player,
            getActor: () => stub<StorePlayerActor>({ getRuntimeId: () => 7n }),
            getRuntimeId: () => 7n,
            getWorld: () => world,
            completeSpawn: async () => void order.push('completeSpawn')
        })
    };
};

/** Applies one notice as the input step does: the handler, then the sends it handed over. */
const notify = async (handler: PlayerInitializedHandler, session: PlayerSession): Promise<void> => {
    const { context, settled } = inputContext(session, { log: stub<HandlerLog>({ debug: () => {} }) });
    handler.handle({ kind: 'playerInitialized' }, context);
    await settled();
};

describe('PlayerInitializedHandler', () => {
    it('puts the player into the world and then completes the spawn, once', async () => {
        // In that order: `completeSpawn` broadcasts a move, and a move for a player the world
        // does not hold yet reaches nobody. It also ran from the join burst once, so the
        // inventory and settings went out twice.
        const { order, session } = fakeSession();

        await notify(new PlayerInitializedHandler(), session);

        expect(order).toEqual(['addPlayer', 'completeSpawn']);
    });

    it('drops a second notice, which would announce the player again', async () => {
        const { order, session } = fakeSession();
        const handler = new PlayerInitializedHandler();

        await notify(handler, session);
        await notify(handler, session);

        expect(order).toEqual(['addPlayer', 'completeSpawn']);
    });

    it("adds the player and completes the spawn in the input's own unit", () => {
        const { order, session } = fakeSession();
        const { context, outputs } = inputContext(session);

        expect(new PlayerInitializedHandler().handle({ kind: 'playerInitialized' }, context)).toBeUndefined();

        // Both have written before the handler returns, and the one output is the spawn's sends.
        expect(outputs).toHaveLength(1);
        expect(order).toEqual(['addPlayer', 'completeSpawn']);
    });
});
