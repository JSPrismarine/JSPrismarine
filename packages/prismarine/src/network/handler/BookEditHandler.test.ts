import { describe, expect, it } from 'vitest';
import type HumanInventory from '../../inventory/HumanInventory';
import { Item } from '../../item/Item';
import { sessionNearBlocks } from '../../testing/blockTarget.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type { BookEditOperation } from '../packet/BookEditPacket';
import BookEditPacket, { BookEditAction } from '../packet/BookEditPacket';
import BookEditHandler from './BookEditHandler';

/** Steve holding `item` in slot 2 and nothing anywhere else. */
const steveHolding = (item: Item) =>
    sessionNearBlocks(
        {},
        {
            getInventory: () =>
                stub<HumanInventory>({
                    getItem: (slot) => (slot === 2 ? item : new Item({ runtimeId: 0, name: 'minecraft:air' }))
                })
        }
    );

const bookAndQuill = () => new Item({ runtimeId: 0, name: 'minecraft:writable_book' });

const edit = (bookSlot: number, operation: BookEditOperation) =>
    Object.assign(new BookEditPacket(), { bookSlot, operation });

describe('BookEditHandler', () => {
    it('logs a page edit with its length', () => {
        const { logged, server, session } = steveHolding(bookAndQuill());

        new BookEditHandler().handle(
            edit(2, { action: BookEditAction.AddPage, pageIndex: 1, pageText: 'hello', photoName: '' }),
            server,
            session
        );

        expect(logged.debug).toEqual([
            'Steve added page 1 (5 chars) in slot 2. Books are not stored, so nothing changed'
        ]);
        expect(logged.verbose).toEqual([]);
    });

    it('logs a signing with title and author', () => {
        const { logged, server, session } = steveHolding(bookAndQuill());

        new BookEditHandler().handle(
            edit(2, { action: BookEditAction.Finalize, title: 'Diary', author: 'Steve', xuid: '' }),
            server,
            session
        );

        expect(logged.debug).toEqual([
            'Steve signed the book "Diary" as Steve in slot 2. Books are not stored, so nothing changed'
        ]);
    });

    it('drops an edit aimed at a slot that holds no book and quill', () => {
        const { logged, server, session } = steveHolding(new Item({ runtimeId: 1, name: 'minecraft:stone' }));
        const handler = new BookEditHandler();

        handler.handle(edit(2, { action: BookEditAction.DeletePage, pageIndex: 0 }), server, session);
        handler.handle(edit(40, { action: BookEditAction.DeletePage, pageIndex: 0 }), server, session);

        expect(logged.debug).toEqual([]);
        expect(logged.verbose).toEqual([
            'Dropped a book edit from Steve: slot 2 holds minecraft:stone',
            'Dropped a book edit from Steve: slot 40 holds minecraft:air'
        ]);
    });

    it('drops a page number a book cannot have', () => {
        const { logged, server, session } = steveHolding(bookAndQuill());
        const handler = new BookEditHandler();

        handler.handle(edit(2, { action: BookEditAction.DeletePage, pageIndex: -1 }), server, session);
        handler.handle(edit(2, { action: BookEditAction.SwapPages, pageIndex: 0, swapWithIndex: 50 }), server, session);

        expect(logged.debug).toEqual([]);
        expect(logged.verbose).toEqual([
            'Dropped a book edit from Steve: page -1 is out of range',
            'Dropped a book edit from Steve: page 50 is out of range'
        ]);
    });

    it('drops a packet that decoded no operation instead of throwing', () => {
        const { logged, server, session } = steveHolding(bookAndQuill());

        new BookEditHandler().handle(new BookEditPacket(), server, session);

        expect(logged.verbose).toEqual(['Dropped a book edit from Steve: it carries no operation']);
    });
});
