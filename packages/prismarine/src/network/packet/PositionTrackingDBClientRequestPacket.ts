import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/** What a `PositionTrackingDBClientRequestPacket` asks for, as the Action uint8 numbers it. */
export enum PositionTrackingDBClientRequestAction {
    Query = 0
}

/**
 * A lookup in the server's position tracking database.
 *
 * Bound to the server. A lodestone compass carries a tracking id and the client asks where
 * that id points before it draws the needle. The server answers with a
 * `PositionTrackingDBServerBroadcastPacket` carrying the same id.
 *
 * Wire order at protocol 2193: Action as a uint8 (see
 * {@link PositionTrackingDBClientRequestAction}), then Id as a `PositionTrackingId` (ZigZag
 * varint32).
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/position-tracking-dbclient-request-packet/
 */
export default class PositionTrackingDBClientRequestPacket extends DataPacket {
    public static NetID = Identifiers.PositionTrackingDBClientRequestPacket;

    /** Action: the only value the client sends is Query. */
    public action: PositionTrackingDBClientRequestAction = PositionTrackingDBClientRequestAction.Query;

    /** Id: the tracking id to look up. */
    public id = 0;

    /** Reads the action and the tracking id. */
    public decodePayload(): void {
        this.action = this.readByte();
        this.id = this.readVarInt();
    }

    /** Writes the action and the tracking id. */
    public encodePayload(): void {
        this.writeByte(this.action);
        this.writeVarInt(this.id);
    }
}
