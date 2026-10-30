import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { mobEquipmentPacket } from '../wire/definitions/containers';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { MobEquipmentPayload } from '../wire/definitions/containers';

/**
 * Tells a client what an entity holds, and which slot it came from.
 *
 * Clients send this when their selected hotbar slot changes. Servers send it to show another
 * entity's held item. The item is a `NetworkItemStackDescriptor`; even an empty hand carries
 * the complete descriptor. `Container ID`, `Slot`, `Selected Slot`, and the target runtime id
 * surround it in the documented order.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/mob-equipment-packet/
 */
export default class MobEquipmentPacket extends NetworkPacket<MobEquipmentPayload> {
    /** Accepts payload data for sending or an encoded buffer for decoding. */
    public constructor(packetData?: MobEquipmentPayload | Buffer | null, buffer?: Buffer) {
        if (Buffer.isBuffer(packetData)) {
            super(null, packetData);
        } else {
            super(packetData ?? null, buffer);
        }
    }

    public get id(): number {
        return PacketIdentifier.MOB_EQUIPMENT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: MobEquipmentPayload): void {
        layoutAt(mobEquipmentPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): MobEquipmentPayload {
        return layoutAt(mobEquipmentPacket, this.codecProtocol).decode(stream);
    }
}
