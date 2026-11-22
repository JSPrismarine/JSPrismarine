import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { BookEditAction, bookEditPacket } from '../wire/definitions/bookEdit';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { BookEditOperation, BookEditPayload } from '../wire/definitions/bookEdit';

export { BookEditAction };
export type { BookEditOperation };

/** Data in a player edit to a book and quill. */
export type BookEdit = BookEditPayload;

/**
 * Edits a book and quill held by the player.
 *
 * Layout: `Book Slot` as a ZigZag varint32, then `Operation` as a varuint32
 * selector followed by the selected fields. Page indices are ZigZag varint32 values; text
 * fields are varuint32-length-prefixed UTF-8 strings.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/book-edit-packet/
 */
export default class BookEditPacket extends NetworkPacket<BookEdit> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'BookEditPacket';
    }

    public get id(): number {
        return PacketIdentifier.BOOK_EDIT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: BookEdit): void {
        layoutAt(bookEditPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): BookEdit {
        return layoutAt(bookEditPacket, this.codecProtocol).decode(stream);
    }
}
