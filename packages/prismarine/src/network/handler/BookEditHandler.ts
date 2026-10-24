import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type BookEditPacket from '../packet/BookEditPacket';
import { BookEditAction } from '../packet/BookEditPacket';
import type PacketHandler from './PacketHandler';

/**
 * A book and quill edit.
 *
 * The edit is recorded at debug level and dropped. Known gap: items carry no NBT pages here,
 * so there is no book to write into; the client keeps its local copy until it relogs.
 */
export default class BookEditHandler implements PacketHandler<BookEditPacket> {
    public static NetID = Identifiers.BookEditPacket;

    /** Logs the edit by action. */
    public handle(packet: BookEditPacket, server: Server, session: PlayerSession): void {
        const operation = packet.operation;
        const edit =
            operation === null
                ? 'sent an empty book edit'
                : operation.action === BookEditAction.Finalize
                  ? `signed the book "${operation.title}" as ${operation.author}`
                  : operation.action === BookEditAction.SwapPages
                    ? `swapped pages ${operation.pageIndex} and ${operation.swapWithIndex}`
                    : operation.action === BookEditAction.DeletePage
                      ? `deleted page ${operation.pageIndex}`
                      : `${operation.action === BookEditAction.AddPage ? 'added' : 'replaced'} page ${operation.pageIndex} (${operation.pageText.length} chars)`;

        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} ${edit} in slot ${packet.bookSlot}. Books are not stored, so nothing changed`,
                'BookEditHandler/handle'
            );
    }
}
