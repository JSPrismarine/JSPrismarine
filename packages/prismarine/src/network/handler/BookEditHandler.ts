import type Player from '../../Player';
import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type BookEditPacket from '../packet/BookEditPacket';
import { BookEditAction } from '../packet/BookEditPacket';
import type PacketHandler from './PacketHandler';

/** The only item a book edit can apply to. Signing turns it into a written book. */
const WRITABLE_BOOK = 'minecraft:writable_book';

/** How many pages a book and quill holds; the client refuses to add a 51st. */
const MAX_BOOK_PAGES = 50;

const pageInRange = (page: number): boolean => Number.isInteger(page) && page >= 0 && page < MAX_BOOK_PAGES;

/**
 * Why an edit cannot apply to the player's inventory, or null when the slot holds a book and
 * quill and every page number fits in one.
 */
const bookEditRejection = (player: Player, packet: BookEditPacket): string | null => {
    const { bookSlot, operation } = packet;
    if (operation === null) return 'it carries no operation';

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
export default class BookEditHandler implements PacketHandler<BookEditPacket> {
    public static PacketName = 'BookEditPacket';
    public readonly phases = ['play'] as const;

    /** Checks the slot holds a book and quill, then logs the edit by action. */
    public handle(packet: BookEditPacket, server: Server, session: PlayerSession): void {
        const player = session.getPlayer();

        const rejection = bookEditRejection(player, packet);
        if (rejection !== null) {
            server
                .getLogger()
                .verbose(`Dropped a book edit from ${player.getName()}: ${rejection}`, 'BookEditHandler/handle');
            return;
        }

        // Narrowed above: a null operation was rejected.
        const operation = packet.operation!;
        const edit =
            operation.action === BookEditAction.Finalize
                ? `signed the book "${operation.title}" as ${operation.author}`
                : operation.action === BookEditAction.SwapPages
                  ? `swapped pages ${operation.pageIndex} and ${operation.swapWithIndex}`
                  : operation.action === BookEditAction.DeletePage
                    ? `deleted page ${operation.pageIndex}`
                    : `${operation.action === BookEditAction.AddPage ? 'added' : 'replaced'} page ${operation.pageIndex} (${operation.pageText.length} chars)`;

        server
            .getLogger()
            .debug(
                `${player.getName()} ${edit} in slot ${packet.bookSlot}. Books are not stored, so nothing changed`,
                'BookEditHandler/handle'
            );
    }
}
