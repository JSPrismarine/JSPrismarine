import { NetworkUtil } from '../NetworkUtil';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/** The edit a `BookEditPacket` carries, numbered as the `oneOf` selector on the wire. */
export enum BookEditAction {
    ReplacePage = 0,
    AddPage = 1,
    DeletePage = 2,
    SwapPages = 3,
    Finalize = 4
}

/** The fields of one book edit, keyed by its action. */
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

/**
 * An edit to the book and quill the player is holding.
 *
 * Wire layout at protocol 2193: Book Slot as a ZigZag varint32, then Operation as a `oneOf`:
 * a varuint32 selector (see {@link BookEditAction}) followed by that alternative's fields.
 * ReplacePage and AddPage carry Page Index (ZigZag varint32), Page Text, and Photo Name;
 * DeletePage carries Page Index; SwapPages carries Page Index and Swap With Index; Finalize
 * carries Title, Author, and XUID. Strings are varuint32 length prefixed UTF-8.
 *
 * Mojang converted this packet to Cereal before 1.26.51, which is where the varints come
 * from. The older layout was a uint8 action, a uint8 slot and uint8 page numbers; a 1.26
 * client does not send that.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/book-edit-packet/
 */
export default class BookEditPacket extends FieldNetworkPacket {
    /** Inventory slot holding the book. */
    public bookSlot = 0;

    /** The edit, or `null` before a decode. */
    public operation: BookEditOperation | null = null;

    /** Reads the slot and the selected alternative. */
    public decodePayload(): void {
        this.bookSlot = this.readVarInt();
        const action = this.readUnsignedVarInt();

        switch (action) {
            case BookEditAction.ReplacePage:
            case BookEditAction.AddPage:
                this.operation = {
                    action,
                    pageIndex: this.readVarInt(),
                    pageText: NetworkUtil.readString(this),
                    photoName: NetworkUtil.readString(this)
                };
                break;
            case BookEditAction.DeletePage:
                this.operation = { action, pageIndex: this.readVarInt() };
                break;
            case BookEditAction.SwapPages:
                this.operation = { action, pageIndex: this.readVarInt(), swapWithIndex: this.readVarInt() };
                break;
            case BookEditAction.Finalize:
                this.operation = {
                    action,
                    title: NetworkUtil.readString(this),
                    author: NetworkUtil.readString(this),
                    xuid: NetworkUtil.readString(this)
                };
                break;
            default:
                throw new Error(`Unknown book edit action ${action}`);
        }
    }

    /**
     * Writes the slot and the operation.
     * @throws when no operation has been set.
     */
    public encodePayload(): void {
        const operation = this.operation;
        if (operation === null) throw new Error('BookEditPacket has no operation to encode');

        this.writeVarInt(this.bookSlot);
        this.writeUnsignedVarInt(operation.action);

        switch (operation.action) {
            case BookEditAction.ReplacePage:
            case BookEditAction.AddPage:
                this.writeVarInt(operation.pageIndex);
                NetworkUtil.writeString(this, operation.pageText);
                NetworkUtil.writeString(this, operation.photoName);
                break;
            case BookEditAction.DeletePage:
                this.writeVarInt(operation.pageIndex);
                break;
            case BookEditAction.SwapPages:
                this.writeVarInt(operation.pageIndex);
                this.writeVarInt(operation.swapWithIndex);
                break;
            case BookEditAction.Finalize:
                NetworkUtil.writeString(this, operation.title);
                NetworkUtil.writeString(this, operation.author);
                NetworkUtil.writeString(this, operation.xuid);
                break;
        }
    }
}
