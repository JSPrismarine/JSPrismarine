import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it, vi } from 'vitest';

import type { Entity } from '../../entity/Entity';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type { World } from '../../world/World';
import type PlayerSession from '../PlayerSession';
import SetLocalPlayerAsInitializedPacket from '../packet/SetLocalPlayerAsInitializedPacket';
import SetLocalPlayerAsInitializedHandler from './SetLocalPlayerAsInitializedHandler';

/**
 * A player whose world holds whatever was added to it, which is what the handler reads to
 * tell a first notice from a repeat.
 */
const fakeSession = () => {
    const order: string[] = [];
    const added = new Map<bigint, Entity>();

    const world: World = stub<World>({
        getEntity: (runtimeId) => added.get(runtimeId) ?? null,
        addEntity: async (entity) => {
            order.push('addEntity');
            added.set(entity.getRuntimeId(), entity);
        }
    });

    const completeSpawn = vi.fn(async () => void order.push('completeSpawn'));
    const player: Player = stub<Player>({
        getName: () => 'Steve',
        getRuntimeId: () => 7n,
        getWorld: () => world,
        completeSpawn
    });

    return {
        completeSpawn,
        order,
        server: stub<Server>({ getLogger: () => stub<Logger>({ debug: () => {} }) }),
        session: stub<PlayerSession>({ getPlayer: () => player })
    };
};

describe('SetLocalPlayerAsInitializedHandler', () => {
    it('puts the player into the world and then completes the spawn', async () => {
        // In that order: `completeSpawn` broadcasts a move, and a move for a player the world
        // does not hold yet reaches nobody.
        const { order, server, session } = fakeSession();

        await new SetLocalPlayerAsInitializedHandler().handle(new SetLocalPlayerAsInitializedPacket(), server, session);

        expect(order).toEqual(['addEntity', 'completeSpawn']);
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

        expect(order).toEqual(['addEntity', 'completeSpawn']);
        expect(completeSpawn).toHaveBeenCalledOnce();
    });
});
