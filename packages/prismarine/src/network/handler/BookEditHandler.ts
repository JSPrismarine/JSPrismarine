import type BookEditPacket from '@jsprismarine/protocol/packet/BookEditPacket';
import { BookEditAction } from '@jsprismarine/protocol/packet/BookEditPacket';

import type { BookEdit } from '@jsprismarine/protocol/packet/BookEditPacket';
import type { SessionContext } from './HandlerContext';
import type { ReadLaneHandler } from './SessionHandler';
import type { StorePlayer } from '../../entity/storePlayer';

/** The only item a book edit can apply to. Signing turns it into a written book. */
const WRITABLE_BOOK = 'minecraft:writable_book';

/** How many pages a book and quill holds; the client refuses to add a 51st. */
const MAX_BOOK_PAGES = 50;

const pageInRange = (page: number): boolean => Number.isInteger(page) && page >= 0 && page < MAX_BOOK_PAGES;

/**
 * Why an edit cannot apply to the player's inventory, or null when the slot holds a book and
 * quill and every page number fits in one.
 */
const bookEditRejection = (player: Pick<StorePlayer, 'getInventory'>, data: BookEdit): string | null => {
    const { bookSlot, operation } = data;

    // `getItem` answers air for a slot the inventory does not have, so an out of range slot
    // fails the same way as an empty one.
    const held = player.getInventory().getItem(bookSlot).getName();
    if (held !== WRITABLE_BOOK) return `slot ${bookSlot} holds ${held}`;

    if (operation.action === BookEditAction.Finalize) return null;
    if (!pageInRange(operation.pageIndex)) return `page ${operation.pageIndex} is out of range`;
    if (operation.action === BookEditAction.SwapPages && !pageInRange(operation.swapWithIndex)) {
        return `page ${operation.swapWithIndex} is out of range`;
    }

    return null;
};

/**
 * A book and quill edit.
 *
 * An edit aimed at a slot that holds no book and quill, or at a page a book cannot have, is
 * dropped at verbose level. The rest are recorded at debug level and dropped too. Known gap:
 * items carry no NBT pages here, so there is no book to write into; the client keeps its
 * local copy until it relogs.
 */
export default class BookEditHandler implements ReadLaneHandler<BookEditPacket> {
    public static PacketName = 'BookEditPacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'read';

    /** Checks the slot holds a book and quill, then logs the edit by action. */
    public handle(packet: BookEditPacket, { session, log }: SessionContext): void {
        const data = packet.getPacketData();

        const rejection = data === null ? 'it carries no operation' : bookEditRejection(session.getPlayer(), data);
        if (rejection !== null) {
            log.verbose(`Dropped a book edit from ${session.identity.name}: ${rejection}`, 'BookEditHandler/handle');
            return;
        }

        if (data === null) throw new Error('BookEditPacket has no payload after validation');
        const operation = data.operation;
        const edit =
            operation.action === BookEditAction.Finalize
                ? `signed the book "${operation.title}" as ${operation.author}`
                : operation.action === BookEditAction.SwapPages
                  ? `swapped pages ${operation.pageIndex} and ${operation.swapWithIndex}`
                  : operation.action === BookEditAction.DeletePage
                    ? `deleted page ${operation.pageIndex}`
                    : `${operation.action === BookEditAction.AddPage ? 'added' : 'replaced'} page ${operation.pageIndex} (${operation.pageText.length} chars)`;

        log.debug(
            `${session.identity.name} ${edit} in slot ${data.bookSlot}. Books are not stored, so nothing changed`,
            'BookEditHandler/handle'
        );
    }
}
