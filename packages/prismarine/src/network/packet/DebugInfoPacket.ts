import { NetworkUtil } from '../NetworkUtil';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * A blob of server debug text tied to an actor.
 *
 * Bound to the client. A client with a debug overlay, such as an internal build drawing
 * ImGui windows, renders the text; a retail client ignores it.
 *
 * Wire order at protocol 2193: Actor Id as an `ActorUniqueID` (ZigZag varint64), then Data as
 * a varuint32 length prefixed byte string. Mojang's page types Data as a string, so the
 * bytes are not required to be text.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/debug-info-packet/
 */
export default class DebugInfoPacket extends FieldNetworkPacket {
    /** Actor Id: the actor the debug data describes. */
    public actorId = 0n;

    /** Data: the debug payload. */
    public data = '';

    /** Reads the actor id and the debug data. */
    public decodePayload(): void {
        this.actorId = this.readVarLong();
        this.data = NetworkUtil.readString(this);
    }

    /** Writes the actor id and the debug data. */
    public encodePayload(): void {
        this.writeVarLong(this.actorId);
        NetworkUtil.writeString(this, this.data);
    }
}
