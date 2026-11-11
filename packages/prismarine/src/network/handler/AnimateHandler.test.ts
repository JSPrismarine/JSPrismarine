import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
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
    const viewers: PlayerSession[] = [];
    const world = stub<World>({ getViewers: () => viewers });

    const senderSession: PlayerSession = stub<PlayerSession>({
        tracks: () => true,
        send: async (packet) => void toSender.push(packet),
        runtimeId: SELF,
        identity: { ...STEVE, name: 'tester' },
        getWorld: () => world
    });
    const watcher = stub<PlayerSession>({
        runtimeId: 8n,
        tracks: () => true,
        send: async (packet) => void toWatcher.push(packet)
    });
    viewers.push(senderSession, watcher);

    const log = stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') });

    return { senderSession, log, toSender, toWatcher, logged };
};

const animate = (
    fields: Pick<AnimatePacket, 'action' | 'data' | 'swingSource'> & Partial<Pick<AnimatePacket, 'runtimeEntityId'>>
): AnimatePacket => Object.assign(new AnimatePacket(), { runtimeEntityId: SELF }, fields);

describe('AnimateHandler', () => {
    it('relays the swing under the sender runtime id with its data and swing source', async () => {
        const { senderSession, log, toWatcher } = fakeWorld();
        const { context, settled } = inputContext(senderSession, { log });

        new AnimateHandler().handle(
            animate({ action: AnimateAction.Swing, data: 2.5, swingSource: 'attack' }),
            context
        );
        await settled();

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

    it('hands the relay to the input step instead of waiting for it', () => {
        const { senderSession, log } = fakeWorld();
        const { context, outputs } = inputContext(senderSession, { log });

        const returned = new AnimateHandler().handle(
            animate({ action: AnimateAction.Swing, data: 0, swingSource: null }),
            context
        );

        expect(returned).toBeUndefined();
        expect(outputs).toHaveLength(1);
    });

    it('sends nothing back to the sender', async () => {
        const { senderSession, log, toSender } = fakeWorld();
        const { context, settled } = inputContext(senderSession, { log });

        new AnimateHandler().handle(animate({ action: AnimateAction.Swing, data: 0, swingSource: null }), context);
        await settled();

        expect(toSender).toHaveLength(0);
    });

    it('drops a packet that names another actor', async () => {
        const { senderSession, log, toWatcher, logged } = fakeWorld();
        const { context, settled } = inputContext(senderSession, { log });

        new AnimateHandler().handle(
            animate({ action: AnimateAction.Swing, data: 0, swingSource: null, runtimeEntityId: 8n }),
            context
        );
        await settled();

        expect(toWatcher).toEqual([]);
        expect(logged).toEqual([
            `Dropped animation ${AnimateAction.Swing} from tester: it names actor 8, not themselves`
        ]);
    });

    it('drops an action no client sends', async () => {
        const { senderSession, log, toWatcher, logged } = fakeWorld();
        const { context, settled } = inputContext(senderSession, { log });
        const handler = new AnimateHandler();

        handler.handle(animate({ action: AnimateAction.NoAction, data: 0, swingSource: null }), context);
        handler.handle(animate({ action: 2, data: 0, swingSource: null }), context);
        await settled();

        expect(toWatcher).toEqual([]);
        expect(logged).toEqual([
            'Dropped animation 0 from tester: not one a client sends',
            'Dropped animation 2 from tester: not one a client sends'
        ]);
    });
});
