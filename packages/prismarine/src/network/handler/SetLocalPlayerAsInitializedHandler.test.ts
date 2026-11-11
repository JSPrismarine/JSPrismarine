import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it, vi } from 'vitest';

import type { WorldActor } from '../../world/WorldActor';
import type Server from '../../Server';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type { World } from '../../world/World';
import type PlayerSession from '../PlayerSession';
import { SetLocalPlayerAsInitializedPacket } from '@jsprismarine/protocol';
import SetLocalPlayerAsInitializedHandler from './SetLocalPlayerAsInitializedHandler';

/**
 * A player whose world holds whatever was added to it, which is what the handler reads to
 * tell a first notice from a repeat.
 */
const fakeSession = () => {
    const order: string[] = [];
    const added = new Map<bigint, WorldActor>();

    const world: World = stub<World>({
        getActor: (runtimeId) => added.get(runtimeId) ?? null,
        addPlayer: async (player) => {
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
        server: stub<Server>({ getLogger: () => stub<Logger>({ debug: () => {} }) }),
        session: stub<PlayerSession>({
            runtimeId: 7n,
            identity: identityNamed('Steve'),
            getPlayer: () => player,
            getWorld: () => world,
            completeSpawn
        })
    };
};

describe('SetLocalPlayerAsInitializedHandler', () => {
    it('puts the player into the world and then completes the spawn', async () => {
        // In that order: `completeSpawn` broadcasts a move, and a move for a player the world
        // does not hold yet reaches nobody.
        const { order, server, session } = fakeSession();

        await new SetLocalPlayerAsInitializedHandler().handle(new SetLocalPlayerAsInitializedPacket(), server, session);

        expect(order).toEqual(['addPlayer', 'completeSpawn']);
    });

    it('completes the spawn exactly once', async () => {
        // This is the only place it runs now. It also ran from the join burst, so the
        // inventory and settings went out twice.
        const { completeSpawn, server, session } = fakeSession();

        await new SetLocalPlayerAsInitializedHandler().handle(new SetLocalPlayerAsInitializedPacket(), server, session);

        expect(completeSpawn).toHaveBeenCalledOnce();
    });

    it('drops a second notice, which would announce the player again', async () => {
        const { completeSpawn, order, server, session } = fakeSession();
        const handler = new SetLocalPlayerAsInitializedHandler();

        await handler.handle(new SetLocalPlayerAsInitializedPacket(), server, session);
        await handler.handle(new SetLocalPlayerAsInitializedPacket(), server, session);

        expect(order).toEqual(['addPlayer', 'completeSpawn']);
        expect(completeSpawn).toHaveBeenCalledOnce();
    });
});
