import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { sessionContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import type ClientConnection from '../ClientConnection';
import PacketHandlerRegistry from '../PacketHandlerRegistry';
import type PlayerSession from '../PlayerSession';
import ResourcePacksReadyForValidationPacket from '@jsprismarine/protocol/packet/ResourcePacksReadyForValidationPacket';
import ResourcePacksReadyForValidationHandler from './ResourcePacksReadyForValidationHandler';

const fakeSession = () => {
    const logged: string[] = [];
    const sent: unknown[] = [];
    const log = stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') });
    const session = stub<PlayerSession>({
        identity: STEVE,
        getConnection: () => stub<ClientConnection>({ sendDataPacket: async (packet) => void sent.push(packet) })
    });

    return { logged, sent, context: sessionContext(session, { log }) };
};

describe('ResourcePacksReadyForValidationHandler', () => {
    it('logs the report and sends nothing back', () => {
        const { logged, sent, context } = fakeSession();

        new ResourcePacksReadyForValidationHandler().handle(new ResourcePacksReadyForValidationPacket(), context);

        expect(logged).toEqual(['Steve finished loading its resource packs']);
        expect(sent).toEqual([]);
    });

    it('registers the handler for ResourcePacksReadyForValidationPacket', async () => {
        const registry = new PacketHandlerRegistry({
            getLogger: () => stub<Logger>({ debug: () => {}, verbose: () => {} })
        });
        await registry.enable();

        expect(registry.getHandler('ResourcePacksReadyForValidationPacket')).toBeInstanceOf(
            ResourcePacksReadyForValidationHandler
        );
    });
});
