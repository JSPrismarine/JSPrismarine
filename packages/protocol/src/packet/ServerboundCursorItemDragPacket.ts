import FieldNetworkPacket from '../FieldNetworkPacket';
import { layoutAt } from '../wire/WireLayout';
import { CursorItemDragState, serverboundCursorItemDragPacket } from '../wire/definitions/added2225';

/**
 * A client starting or stopping a cursor item split-drag.
 *
 * Added at protocol 2225 (Minecraft 1.26.60); the layout lives in `@jsprismarine/protocol`'s
 * declarative definition, read off Mojang's v1.26.60 release schemas. A codec older than 2225
 * has no id for it, so only a 2225 session ever builds one.
 *
 * @see `docs/research/protocol-2225-added-packets.md`
 */
export default class ServerboundCursorItemDragPacket extends FieldNetworkPacket {
    /** `state`. */
    public state: number = CursorItemDragState.Start;
    /** Writes the fields in layout order. */
    public encodePayload(): void {
        layoutAt(serverboundCursorItemDragPacket, this.codecProtocol).encode(this, this);
    }

    /** Reads them back in the same order. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(serverboundCursorItemDragPacket, this.codecProtocol).decode(this));
    }
}
