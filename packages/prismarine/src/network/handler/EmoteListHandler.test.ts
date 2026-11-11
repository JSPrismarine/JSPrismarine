import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import { sessionContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import EmoteListPacket from '@jsprismarine/protocol/packet/EmoteListPacket';
import type PlayerSession from '../PlayerSession';
import EmoteListHandler from './EmoteListHandler';

const setup = () => {
    const logged: string[] = [];
    const log = stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') });
    const session = stub<PlayerSession>({ runtimeId: 7n, identity: STEVE });
    return { logged, context: sessionContext(session, { log }) };
};

const list = (runtimeId: bigint) =>
    Object.assign(new EmoteListPacket(), {
        runtimeId,
        emoteIds: [UUID.fromString('12345678-9abc-def0-1234-56789abcdef0')]
    });

describe('EmoteListHandler', () => {
    it('accepts a list for the sender without logging', () => {
        const { logged, context } = setup();

        new EmoteListHandler().handle(list(7n), context);

        expect(logged).toEqual([]);
    });

    it('drops a list for another runtime id at debug level', () => {
        const { logged, context } = setup();

        new EmoteListHandler().handle(list(999n), context);

        expect(logged).toEqual(['Steve sent an EmoteList for runtime id 999, dropped']);
    });
});
