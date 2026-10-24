import { describe, expect, it, vi } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type { World } from '../../world/World';
import type WorldManager from '../../world/WorldManager';
import type PlayerSession from '../PlayerSession';
import SetLocalPlayerAsInitializedPacket from '../packet/SetLocalPlayerAsInitializedPacket';
import SetLocalPlayerAsInitializedHandler from './SetLocalPlayerAsInitializedHandler';

describe('SetLocalPlayerAsInitializedHandler', () => {
    it('puts the player into the world and then completes the spawn', async () => {
        // In that order: `completeSpawn` broadcasts a move, and a move for a player the world
        // does not hold yet reaches nobody.
        const order: string[] = [];
        const player = stub<Player>({ completeSpawn: async () => void order.push('completeSpawn') });
        const world = stub<World>({ addEntity: async () => void order.push('addEntity') });
        const server = stub<Server>({
            getWorldManager: () => stub<WorldManager>({ getDefaultWorld: () => world })
        });
        const session = stub<PlayerSession>({ getPlayer: () => player });

        await new SetLocalPlayerAsInitializedHandler().handle(new SetLocalPlayerAsInitializedPacket(), server, session);

        expect(order).toEqual(['addEntity', 'completeSpawn']);
    });

    it('completes the spawn exactly once', async () => {
        // This is the only place it runs now. It also ran from the join burst, so the
        // inventory and settings went out twice.
        const completeSpawn = vi.fn(async () => {});
        const server = stub<Server>({
            getWorldManager: () =>
                stub<WorldManager>({ getDefaultWorld: () => stub<World>({ addEntity: async () => {} }) })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ completeSpawn }) });

        await new SetLocalPlayerAsInitializedHandler().handle(new SetLocalPlayerAsInitializedPacket(), server, session);

        expect(completeSpawn).toHaveBeenCalledOnce();
    });
});
