import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { removeVolumeEntityPacket } from '../wire/definitions/removeVolumeEntity';
import { layoutAt } from '../wire/WireLayout';

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
 * Protocols 2193 and 2225 share this layout: the 1.26.60 page lists the same fields. 1.26.70-preview.20
 * removes this packet and `AddVolumeEntityPacket`.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/remove-volume-entity-packet/
 */
export default class RemoveVolumeEntityPacket extends NetworkPacket<RemoveVolumeEntity> {
    public get id(): number {
        return PacketIdentifier.REMOVE_VOLUME_ENTITY;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: RemoveVolumeEntity): void {
        layoutAt(removeVolumeEntityPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): RemoveVolumeEntity {
        return layoutAt(removeVolumeEntityPacket, this.codecProtocol).decode(stream);
    }
}
