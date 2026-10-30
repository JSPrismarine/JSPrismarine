import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import { stub } from '../../testing/stub.test.helper';
import EmoteListPacket from '@jsprismarine/protocol/packet/EmoteListPacket';
import type PlayerSession from '../PlayerSession';
import EmoteListHandler from './EmoteListHandler';

const setup = () => {
    const logged: string[] = [];
    const player = stub<Player>({ getName: () => 'Steve', getRuntimeId: () => 7n });
    const server = stub<Server>({
        getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
    });
    const session = stub<PlayerSession>({ getPlayer: () => player });
    return { logged, server, session };
};

const list = (runtimeId: bigint) =>
    Object.assign(new EmoteListPacket(), {
        runtimeId,
        emoteIds: [UUID.fromString('12345678-9abc-def0-1234-56789abcdef0')]
    });

describe('EmoteListHandler', () => {
    it('accepts a list for the sender without logging', () => {
        const { logged, server, session } = setup();

        new EmoteListHandler().handle(list(7n), server, session);

        expect(logged).toEqual([]);
    });

    it('drops a list for another runtime id at debug level', () => {
        const { logged, server, session } = setup();

        new EmoteListHandler().handle(list(999n), server, session);

        expect(logged).toEqual(['Steve sent an EmoteList for runtime id 999, dropped']);
    });
});
