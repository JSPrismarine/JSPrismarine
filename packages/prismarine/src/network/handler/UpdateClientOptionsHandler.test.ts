import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { sessionContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import type PlayerSession from '../PlayerSession';
import UpdateClientOptionsPacket, { GraphicsMode } from '@jsprismarine/protocol/packet/UpdateClientOptionsPacket';
import UpdateClientOptionsHandler from './UpdateClientOptionsHandler';

const fakeSession = () => {
    const logged: string[] = [];
    const log = stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') });
    const session = stub<PlayerSession>({ identity: STEVE });

    return { logged, context: sessionContext(session, { log }) };
};

describe('UpdateClientOptionsHandler', () => {
    it('names both settings when both changed', () => {
        const { logged, context } = fakeSession();
        const packet = Object.assign(new UpdateClientOptionsPacket(), {
            graphicsMode: GraphicsMode.RayTraced,
            filterProfanity: false
        });

        new UpdateClientOptionsHandler().handle(packet, context);

        expect(logged).toEqual(['Steve changed graphics mode RayTraced and profanity filter off']);
    });

    it('says so when neither setting is present', () => {
        const { logged, context } = fakeSession();

        new UpdateClientOptionsHandler().handle(new UpdateClientOptionsPacket(), context);

        expect(logged).toEqual(['Steve changed no client options']);
    });
});
