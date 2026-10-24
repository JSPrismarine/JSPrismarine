import { describe, expect, it } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type { World } from '../../world/World';
import type DataPacket from '../packet/DataPacket';
import AnimatePacket from '../packet/AnimatePacket';
import type PlayerSession from '../PlayerSession';
import AnimateHandler from './AnimateHandler';

/**
 * A world with the sender and one watcher. The watcher tracks the sender and records what it
 * is sent; the sender records too, so the test can show it gets nothing back.
 */
const fakeWorld = () => {
    const toSender: DataPacket[] = [];
    const toWatcher: DataPacket[] = [];
    const players: Player[] = [];
    const world = stub<World>({ getPlayers: () => players });

    const senderSession: PlayerSession = stub<PlayerSession>({
        tracks: () => true,
        send: async (packet) => void toSender.push(packet),
        getPlayer: () => sender
    });
    const sender: Player = stub<Player>({
        getRuntimeId: () => 7n,
        getWorld: () => world,
        getNetworkSession: () => senderSession
    });
    const watcher = stub<Player>({
        getRuntimeId: () => 8n,
        getWorld: () => world,
        getNetworkSession: () =>
            stub<PlayerSession>({
                tracks: () => true,
                send: async (packet) => void toWatcher.push(packet)
            })
    });
    players.push(sender, watcher);

    return { senderSession, toSender, toWatcher };
};

const animate = (fields: Pick<AnimatePacket, 'action' | 'data' | 'swingSource'>): AnimatePacket =>
    Object.assign(new AnimatePacket(), { runtimeEntityId: 0n }, fields);

describe('AnimateHandler', () => {
    it('relays the swing under the sender runtime id with its data and swing source', async () => {
        const { senderSession, toWatcher } = fakeWorld();

        await new AnimateHandler().handle(
            animate({ action: 1, data: 2.5, swingSource: 'Attack' }),
            stub<Server>(),
            senderSession
        );

        expect(toWatcher).toHaveLength(1);
        const [relayed] = toWatcher;
        expect(relayed).toBeInstanceOf(AnimatePacket);
        if (!(relayed instanceof AnimatePacket)) {
            return;
        }
        expect(relayed.runtimeEntityId).toBe(7n);
        expect(relayed.action).toBe(1);
        expect(relayed.data).toBe(2.5);
        expect(relayed.swingSource).toBe('Attack');
    });

    it('sends nothing back to the sender', async () => {
        const { senderSession, toSender } = fakeWorld();

        await new AnimateHandler().handle(
            animate({ action: 1, data: 0, swingSource: null }),
            stub<Server>(),
            senderSession
        );

        expect(toSender).toHaveLength(0);
    });
});
