import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type { World } from '../../world/World';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import AnimatePacket, { AnimateAction } from '@jsprismarine/protocol/packet/AnimatePacket';
import type PlayerSession from '../PlayerSession';
import AnimateHandler from './AnimateHandler';

const SELF = 7n;

/**
 * A world with the sender and one watcher. The watcher tracks the sender and records what it
 * is sent; the sender records too, so the test can show it gets nothing back. Every log line
 * is kept, so a packet the handler should have refused shows up as a line.
 */
const fakeWorld = () => {
    const toSender: NetworkPacket[] = [];
    const toWatcher: NetworkPacket[] = [];
    const logged: string[] = [];
    const players: Player[] = [];
    const world = stub<World>({ getPlayers: () => players });

    const senderSession: PlayerSession = stub<PlayerSession>({
        tracks: () => true,
        send: async (packet) => void toSender.push(packet),
        getPlayer: () => sender
    });
    const sender: Player = stub<Player>({
        getName: () => 'tester',
        getRuntimeId: () => SELF,
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

    const logger = stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') });
    const server = stub<Server>({ getLogger: () => logger });

    return { senderSession, server, toSender, toWatcher, logged };
};

const animate = (
    fields: Pick<AnimatePacket, 'action' | 'data' | 'swingSource'> & Partial<Pick<AnimatePacket, 'runtimeEntityId'>>
): AnimatePacket => Object.assign(new AnimatePacket(), { runtimeEntityId: SELF }, fields);

describe('AnimateHandler', () => {
    it('relays the swing under the sender runtime id with its data and swing source', async () => {
        const { senderSession, server, toWatcher } = fakeWorld();

        await new AnimateHandler().handle(
            animate({ action: AnimateAction.Swing, data: 2.5, swingSource: 'attack' }),
            server,
            senderSession
        );

        expect(toWatcher).toHaveLength(1);
        const [relayed] = toWatcher;
        expect(relayed).toBeInstanceOf(AnimatePacket);
        if (!(relayed instanceof AnimatePacket)) {
            return;
        }
        expect(relayed.runtimeEntityId).toBe(SELF);
        expect(relayed.action).toBe(AnimateAction.Swing);
        expect(relayed.data).toBe(2.5);
        expect(relayed.swingSource).toBe('attack');
    });

    it('sends nothing back to the sender', async () => {
        const { senderSession, server, toSender } = fakeWorld();

        await new AnimateHandler().handle(
            animate({ action: AnimateAction.Swing, data: 0, swingSource: null }),
            server,
            senderSession
        );

        expect(toSender).toHaveLength(0);
    });

    it('drops a packet that names another actor', async () => {
        const { senderSession, server, toWatcher, logged } = fakeWorld();

        await new AnimateHandler().handle(
            animate({ action: AnimateAction.Swing, data: 0, swingSource: null, runtimeEntityId: 8n }),
            server,
            senderSession
        );

        expect(toWatcher).toEqual([]);
        expect(logged).toEqual([
            `Dropped animation ${AnimateAction.Swing} from tester: it names actor 8, not themselves`
        ]);
    });

    it('drops an action no client sends', async () => {
        const { senderSession, server, toWatcher, logged } = fakeWorld();
        const handler = new AnimateHandler();

        await handler.handle(
            animate({ action: AnimateAction.NoAction, data: 0, swingSource: null }),
            server,
            senderSession
        );
        await handler.handle(animate({ action: 2, data: 0, swingSource: null }), server, senderSession);

        expect(toWatcher).toEqual([]);
        expect(logged).toEqual([
            'Dropped animation 0 from tester: not one a client sends',
            'Dropped animation 2 from tester: not one a client sends'
        ]);
    });
});
