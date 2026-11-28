import type BookEditPacket from '@jsprismarine/protocol/bedrock/packet/BookEditPacket';
import { BookEditAction } from '@jsprismarine/protocol/bedrock/packet/BookEditPacket';
import type { BookEditOperation } from '@jsprismarine/protocol/bedrock/packet/BookEditPacket';

import type { BookEditStep, Intent } from '../../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/** How many pages a Bedrock book and quill holds; the client refuses to add a 51st. */
const MAX_BOOK_PAGES = 50;

const pageInRange = (page: number): boolean => Number.isInteger(page) && page >= 0 && page < MAX_BOOK_PAGES;

/** The edit an operation is, or a reason it names a page a Bedrock book cannot have. */
const stepOf = (operation: BookEditOperation): BookEditStep | string => {
    switch (operation.action) {
        case BookEditAction.Finalize:
            return { kind: 'sign', title: operation.title, author: operation.author };
        case BookEditAction.SwapPages:
            if (!pageInRange(operation.pageIndex)) return `page ${operation.pageIndex} is out of range`;
            if (!pageInRange(operation.swapWithIndex)) return `page ${operation.swapWithIndex} is out of range`;
            return { kind: 'swapPages', page: operation.pageIndex, other: operation.swapWithIndex };
        case BookEditAction.DeletePage:
            if (!pageInRange(operation.pageIndex)) return `page ${operation.pageIndex} is out of range`;
            return { kind: 'deletePage', page: operation.pageIndex };
        case BookEditAction.ReplacePage:
        case BookEditAction.AddPage:
            if (!pageInRange(operation.pageIndex)) return `page ${operation.pageIndex} is out of range`;
            return {
                kind: operation.action === BookEditAction.AddPage ? 'addPage' : 'replacePage',
                page: operation.pageIndex,
                text: operation.pageText
            };
    }
};

/**
 * A book and quill edit, one page operation at a time. A page number a Bedrock book cannot have
 * is dropped here at verbose level, since the limit is the Bedrock client's.
 */
export default class BookEditDecoder implements PacketDecoder<BookEditPacket, 'editBook'> {
    public static readonly PacketName = 'BookEditPacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['editBook'] as const;

    /** Decodes the slot and the operation. */
    public decode(packet: BookEditPacket, view: DecodeView): readonly Intent<'editBook'>[] {
        const data = packet.getPacketData();
        const edit = data === null ? 'it carries no operation' : stepOf(data.operation);
        if (data === null || typeof edit === 'string') {
            view.log.verbose(`Dropped a book edit from ${view.name}: ${edit}`);
            return [];
        }
        return [{ kind: 'editBook', slot: data.bookSlot, edit }];
    }
}
