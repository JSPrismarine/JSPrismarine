import { NBTTagCompound } from '@jsprismarine/nbt';

import {
    PositionTrackingDBServerBroadcastAction,
    positionTrackingDBServerBroadcastPacket
} from '../wire/definitions/positionTrackingDBServerBroadcast';
import { layoutAt } from '../wire/WireLayout';

import FieldNetworkPacket from '../FieldNetworkPacket';

export { PositionTrackingDBServerBroadcastAction };

/**
 * The answer to a `PositionTrackingDBClientRequestPacket`.
 *
 * Bound to the client. The server keeps a runtime database of tracked positions, backed by
 * level storage, and vanilla uses it for lodestones. A compass bound to a tracking id points
 * at the position an Update carries and spins once a Destroy or a NotFound says the lodestone
 * is gone.
 *
 * The wire layout lives in the declarative definition this class walks: Action as a uint8 (see
 * {@link PositionTrackingDBServerBroadcastAction}), Id as a `PositionTrackingId` (ZigZag
 * varint32), then Position tracking data as one network NBT compound. The compound holds
 * `version` (byte), `id` (string), `pos` (list of three ints), `dim` (int), and `status`
 * (byte).
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/position-tracking-dbserver-broadcast-packet/
 */
export default class PositionTrackingDBServerBroadcastPacket extends FieldNetworkPacket {
    /** Action: what became of the tracked position. */
    public action: PositionTrackingDBServerBroadcastAction = PositionTrackingDBServerBroadcastAction.NotFound;

    /** Id: the tracking id the request asked about. */
    public id = 0;

    /** Position tracking data: the record, as a network NBT compound. */
    public positionTrackingData: NBTTagCompound = new NBTTagCompound();

    /** Reads the action, the tracking id, and the record compound. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(positionTrackingDBServerBroadcastPacket, this.codecProtocol).decode(this));
    }

    /** Writes the action, the tracking id, and the record compound. */
    public encodePayload(): void {
        layoutAt(positionTrackingDBServerBroadcastPacket, this.codecProtocol).encode(this, this);
    }
}
