import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import type { OccurrenceKinds } from '../../world/changelog/ChangeEntry';
import type { World } from '../../world/World';
import AnimatePacket, { AnimateAction } from '@jsprismarine/protocol/packet/AnimatePacket';
import type PlayerSession from '../PlayerSession';
import AnimateHandler from './AnimateHandler';

const SELF = 7n;

/**
 * The sender in a world that records the animations it is asked to show. Every log line is
 * kept, so a packet the handler should have refused shows up as a line.
 */
const fakeWorld = () => {
    const relayed: OccurrenceKinds['animate'][] = [];
    const logged: string[] = [];
    const world = stub<World>({ relayAnimation: (animation) => void relayed.push(animation) });

    const senderSession: PlayerSession = stub<PlayerSession>({
        runtimeId: SELF,
        identity: { ...STEVE, name: 'tester' },
        getWorld: () => world
    });

    const log = stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') });

    return { senderSession, log, relayed, logged };
};

const animate = (
    fields: Pick<AnimatePacket, 'action' | 'data' | 'swingSource'> & Partial<Pick<AnimatePacket, 'runtimeEntityId'>>
): AnimatePacket => Object.assign(new AnimatePacket(), { runtimeEntityId: SELF }, fields);

describe('AnimateHandler', () => {
    it('relays the swing under the sender runtime id with its data and swing source', () => {
        const { senderSession, log, relayed } = fakeWorld();
        const { context } = inputContext(senderSession, { log });

        new AnimateHandler().handle(
            animate({ action: AnimateAction.Swing, data: 2.5, swingSource: 'attack' }),
            context
        );

        expect(relayed).toStrictEqual([
            { entity: SELF, action: AnimateAction.Swing, data: 2.5, swingSource: 'attack' }
        ]);
    });

    it('logs the relay in its own unit and waits for nothing', () => {
        // The world sends it after the tick seals, so a handler that throws takes it back.
        const { senderSession, log, relayed } = fakeWorld();
        const { context, outputs } = inputContext(senderSession, { log });

        const returned = new AnimateHandler().handle(
            animate({ action: AnimateAction.Swing, data: 0, swingSource: null }),
            context
        );

        expect(returned).toBeUndefined();
        expect(outputs).toHaveLength(0);
        expect(relayed).toHaveLength(1);
    });

    it('drops a packet that names another actor', () => {
        const { senderSession, log, relayed, logged } = fakeWorld();
        const { context } = inputContext(senderSession, { log });

        new AnimateHandler().handle(
            animate({ action: AnimateAction.Swing, data: 0, swingSource: null, runtimeEntityId: 8n }),
            context
        );

        expect(relayed).toEqual([]);
        expect(logged).toEqual([
            `Dropped animation ${AnimateAction.Swing} from tester: it names actor 8, not themselves`
        ]);
    });

    it('drops an action no client sends', () => {
        const { senderSession, log, relayed, logged } = fakeWorld();
        const { context } = inputContext(senderSession, { log });
        const handler = new AnimateHandler();

        handler.handle(animate({ action: AnimateAction.NoAction, data: 0, swingSource: null }), context);
        handler.handle(animate({ action: 2, data: 0, swingSource: null }), context);

        expect(relayed).toEqual([]);
        expect(logged).toEqual([
            'Dropped animation 0 from tester: not one a client sends',
            'Dropped animation 2 from tester: not one a client sends'
        ]);
    });
});
