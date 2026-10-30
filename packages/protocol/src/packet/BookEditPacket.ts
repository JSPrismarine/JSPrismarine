import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The book edit operation, numbered as the packet's `oneOf` selector. */
export enum BookEditAction {
    ReplacePage = 0,
    AddPage = 1,
    DeletePage = 2,
    SwapPages = 3,
    Finalize = 4
}

/** Fields carried by one action in a book edit. */
export type BookEditOperation =
    | {
          action: BookEditAction.ReplacePage | BookEditAction.AddPage;
          pageIndex: number;
          pageText: string;
          photoName: string;
      }
    | { action: BookEditAction.DeletePage; pageIndex: number }
    | { action: BookEditAction.SwapPages; pageIndex: number; swapWithIndex: number }
    | { action: BookEditAction.Finalize; title: string; author: string; xuid: string };

/** Data in a player edit to a book and quill. */
export interface BookEdit {
    /** Inventory slot containing the book. */
    bookSlot: number;
    /** Selected edit and the fields specific to that action. */
    operation: BookEditOperation;
}

/**
 * Edits a book and quill held by the player.
 *
 * Protocol 2193 layout: `Book Slot` as a ZigZag varint32, then `Operation` as a varuint32
 * selector followed by the selected fields. Page indices are ZigZag varint32 values; text
 * fields are varuint32-length-prefixed UTF-8 strings.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/book-edit-packet/
 */
export default class BookEditPacket extends NetworkPacket<BookEdit> {
    public get id(): number {
        return PacketIdentifier.BOOK_EDIT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: BookEdit): void {
        stream.writeVarInt(data.bookSlot);
        stream.writeUnsignedVarInt(data.operation.action);

        switch (data.operation.action) {
            case BookEditAction.ReplacePage:
            case BookEditAction.AddPage:
                stream.writeVarInt(data.operation.pageIndex);
                stream.writeString(data.operation.pageText);
                stream.writeString(data.operation.photoName);
                break;
            case BookEditAction.DeletePage:
                stream.writeVarInt(data.operation.pageIndex);
                break;
            case BookEditAction.SwapPages:
                stream.writeVarInt(data.operation.pageIndex);
                stream.writeVarInt(data.operation.swapWithIndex);
                break;
            case BookEditAction.Finalize:
                stream.writeString(data.operation.title);
                stream.writeString(data.operation.author);
                stream.writeString(data.operation.xuid);
                break;
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): BookEdit {
        const bookSlot = stream.readVarInt();
        const action = stream.readUnsignedVarInt();
        let operation: BookEditOperation;

        switch (action) {
            case BookEditAction.ReplacePage:
            case BookEditAction.AddPage:
                operation = {
                    action,
                    pageIndex: stream.readVarInt(),
                    pageText: stream.readString(),
                    photoName: stream.readString()
                };
                break;
            case BookEditAction.DeletePage:
                operation = { action, pageIndex: stream.readVarInt() };
                break;
            case BookEditAction.SwapPages:
                operation = { action, pageIndex: stream.readVarInt(), swapWithIndex: stream.readVarInt() };
                break;
            case BookEditAction.Finalize:
                operation = {
                    action,
                    title: stream.readString(),
                    author: stream.readString(),
                    xuid: stream.readString()
                };
                break;
            default:
                throw new Error(`Unknown book edit action ${action}`);
        }

        return { bookSlot, operation };
    }
}
