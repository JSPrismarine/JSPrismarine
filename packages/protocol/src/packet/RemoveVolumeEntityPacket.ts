import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of a `RemoveVolumeEntityPacket`, in wire order. */
export interface RemoveVolumeEntity {
    /** `Entity Network Id`, the `Raw Id` an earlier `AddVolumeEntityPacket` gave the volume. */
    entityNetworkId: number;
    /** `Dimension Type` the volume is in: 0 for the Overworld, 1 for the Nether, 2 for the End. */
    dimension: number;
}

/**
 * Tells the client to drop a volume entity it learned about from an `AddVolumeEntityPacket`.
 *
 * Protocol 2193 layout, in wire order: `Entity Network Id` (varuint32), then `Dimension Type`
 * (ZigZag varint32).
 *
 * 1.26.70-preview.20 removes this packet and `AddVolumeEntityPacket`.
 */
export default class RemoveVolumeEntityPacket extends NetworkPacket<RemoveVolumeEntity> {
    public get id(): number {
        return PacketIdentifier.REMOVE_VOLUME_ENTITY;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: RemoveVolumeEntity): void {
        stream.writeUnsignedVarInt(data.entityNetworkId);
        stream.writeVarInt(data.dimension);
    }

    protected deserializePayload(stream: NetworkBinaryStream): RemoveVolumeEntity {
        return {
            entityNetworkId: stream.readUnsignedVarInt(),
            dimension: stream.readVarInt()
        };
    }
}
