import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import BookEditPacket, { BookEditAction } from '../packet/BookEditPacket';
import BookEditHandler from './BookEditHandler';

const fakeSession = () => {
    const logged: string[] = [];
    const server = stub<Server>({
        getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
    });
    const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });

    return { logged, server, session };
};

describe('BookEditHandler', () => {
    it('logs a page edit with its length', () => {
        const { logged, server, session } = fakeSession();
        const packet = Object.assign(new BookEditPacket(), {
            bookSlot: 2,
            operation: { action: BookEditAction.AddPage, pageIndex: 1, pageText: 'hello', photoName: '' }
        });

        new BookEditHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve added page 1 (5 chars) in slot 2. Books are not stored, so nothing changed']);
    });

    it('logs a signing with title and author', () => {
        const { logged, server, session } = fakeSession();
        const packet = Object.assign(new BookEditPacket(), {
            bookSlot: 0,
            operation: { action: BookEditAction.Finalize, title: 'Diary', author: 'Steve', xuid: '' }
        });

        new BookEditHandler().handle(packet, server, session);

        expect(logged).toEqual([
            'Steve signed the book "Diary" as Steve in slot 0. Books are not stored, so nothing changed'
        ]);
    });
});
