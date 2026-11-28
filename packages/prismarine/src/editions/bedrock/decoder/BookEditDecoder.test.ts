import { describe, expect, it } from 'vitest';
import type HumanInventory from '../../../inventory/HumanInventory';
import { ItemContainer } from '../../../inventory/ItemContainer';
import { Item } from '../../../item/Item';
import { stub } from '../../../testing/stub.test.helper';
import BookEditPacket, { BookEditAction } from '@jsprismarine/protocol/bedrock/packet/BookEditPacket';
import type { BookEditOperation } from '@jsprismarine/protocol/bedrock/packet/BookEditPacket';
import type { SessionContext } from '../../../player/context/HandlerContext';
import { sessionSeeingBlocks } from '../handler/blockTargetSession.test.helper';
import EditBookHandler from '../../../input/handlers/EditBookHandler';
import BookEditDecoder from './BookEditDecoder';
import { viewOf } from './DecodeView';

/** A packet decoded and its intents run, as the dispatcher wraps a decoder. */
const run = (packet: BookEditPacket, context: SessionContext): void => {
    for (const intent of new BookEditDecoder().decode(packet, viewOf(context.session, context.log)))
        new EditBookHandler().handle(intent, context);
};

/** Steve holding `item` in slot 2 and nothing anywhere else. */
const steveHolding = (item: Item) =>
    sessionSeeingBlocks(
        {},
        {
            getInventory: () => stub<HumanInventory>({ container: () => new ItemContainer(36, [null, null, item]) })
        }
    );

const bookAndQuill = () => new Item({ runtimeId: 0, name: 'minecraft:writable_book' });

const edit = (bookSlot: number, operation: BookEditOperation) => new BookEditPacket({ bookSlot, operation });

describe('a Bedrock book edit', () => {
    it('logs a page edit with its length', () => {
        const { logged, context } = steveHolding(bookAndQuill());

        run(edit(2, { action: BookEditAction.AddPage, pageIndex: 1, pageText: 'hello', photoName: '' }), context);

        expect(logged.debug).toEqual([
            'Steve added page 1 (5 chars) in slot 2. Books are not stored, so nothing changed'
        ]);
        expect(logged.verbose).toEqual([]);
    });

    it('logs a signing with title and author', () => {
        const { logged, context } = steveHolding(bookAndQuill());

        run(edit(2, { action: BookEditAction.Finalize, title: 'Diary', author: 'Steve', xuid: '' }), context);

        expect(logged.debug).toEqual([
            'Steve signed the book "Diary" as Steve in slot 2. Books are not stored, so nothing changed'
        ]);
    });

    it('drops an edit aimed at a slot that holds no book and quill', () => {
        const { logged, context } = steveHolding(new Item({ runtimeId: 1, name: 'minecraft:stone' }));

        run(edit(2, { action: BookEditAction.DeletePage, pageIndex: 0 }), context);
        run(edit(40, { action: BookEditAction.DeletePage, pageIndex: 0 }), context);

        expect(logged.debug).toEqual([]);
        expect(logged.verbose).toEqual([
            'Dropped a book edit from Steve: slot 2 holds minecraft:stone',
            'Dropped a book edit from Steve: slot 40 holds minecraft:air'
        ]);
    });

    it('drops a page number a book cannot have', () => {
        const { logged, context } = steveHolding(bookAndQuill());

        run(edit(2, { action: BookEditAction.DeletePage, pageIndex: -1 }), context);
        run(edit(2, { action: BookEditAction.SwapPages, pageIndex: 0, swapWithIndex: 50 }), context);

        expect(logged.debug).toEqual([]);
        expect(logged.verbose).toEqual([
            'Dropped a book edit from Steve: page -1 is out of range',
            'Dropped a book edit from Steve: page 50 is out of range'
        ]);
    });

    it('drops a packet that decoded no operation instead of throwing', () => {
        const { logged, context } = steveHolding(bookAndQuill());

        run(new BookEditPacket(), context);

        expect(logged.verbose).toEqual(['Dropped a book edit from Steve: it carries no operation']);
    });
});
