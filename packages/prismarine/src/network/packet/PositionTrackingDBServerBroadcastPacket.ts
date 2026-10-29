import { ByteOrder, NBTTagCompound } from '@jsprismarine/nbt';

import DataPacket from './DataPacket';

/** The result of a position tracking lookup, as the Action uint8 numbers it. */
export enum PositionTrackingDBServerBroadcastAction {
    Update = 0,
    Destroy = 1,
    NotFound = 2
}

/**
 * The answer to a `PositionTrackingDBClientRequestPacket`.
 *
 * Bound to the client. The server keeps a runtime database of tracked positions, backed by
 * level storage, and vanilla uses it for lodestones. A compass bound to a tracking id points
 * at the position an Update carries and spins once a Destroy or a NotFound says the lodestone
 * is gone.
 *
 * Wire order at protocol 2193: Action as a uint8 (see
 * {@link PositionTrackingDBServerBroadcastAction}), Id as a `PositionTrackingId` (ZigZag
 * varint32), then Position tracking data as one network NBT compound. The compound holds
 * `version` (byte), `id` (string), `pos` (list of three ints), `dim` (int), and `status`
 * (byte).
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/position-tracking-dbserver-broadcast-packet/
 */
export default class PositionTrackingDBServerBroadcastPacket extends DataPacket {
    /** Action: what became of the tracked position. */
    public action: PositionTrackingDBServerBroadcastAction = PositionTrackingDBServerBroadcastAction.NotFound;

    /** Id: the tracking id the request asked about. */
    public id = 0;

    /** Position tracking data: the record, as a network NBT compound. */
    public positionTrackingData: NBTTagCompound = new NBTTagCompound();

    /** Reads the action, the tracking id, and the record compound. */
    public decodePayload(): void {
        this.action = this.readByte();
        this.id = this.readVarInt();
        this.positionTrackingData = NBTTagCompound.readFromStream(this, ByteOrder.LITTLE_ENDIAN, true);
    }

    /** Writes the action, the tracking id, and the record compound. */
    public encodePayload(): void {
        this.writeByte(this.action);
        this.writeVarInt(this.id);
        this.positionTrackingData.writeToStream(this, ByteOrder.LITTLE_ENDIAN, true);
    }
}
