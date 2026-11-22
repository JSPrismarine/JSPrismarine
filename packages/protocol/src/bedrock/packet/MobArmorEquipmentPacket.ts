import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { mobArmorEquipmentPacket } from '../wire/definitions/mobArmorEquipment';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { MobArmorEquipmentPayload } from '../wire/definitions/mobArmorEquipment';

/** The five positional armor slots an entity can show to a client. */
export type MobArmorEquipment = MobArmorEquipmentPayload;

/**
 * Sends all five worn item slots for one entity.
 *
 * After the target runtime id, the packet carries head, torso, legs, feet, and body as five
 * `NetworkItemStackDescriptor` values. Empty slots are full air descriptors; omitting one
 * would shift every later slot for the client.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/mob-armor-equipment-packet/
 */
export default class MobArmorEquipmentPacket extends NetworkPacket<MobArmorEquipment> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'MobArmorEquipmentPacket';
    }

    /** Accepts payload data for sending or an encoded buffer for decoding. */
    public constructor(packetData?: MobArmorEquipment | Buffer | null, buffer?: Buffer) {
        if (Buffer.isBuffer(packetData)) {
            super(null, packetData);
        } else {
            super(packetData ?? null, buffer);
        }
    }

    public get id(): number {
        return PacketIdentifier.MOB_ARMOR_EQUIPMENT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: MobArmorEquipment): void {
        layoutAt(mobArmorEquipmentPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): MobArmorEquipment {
        return layoutAt(mobArmorEquipmentPacket, this.codecProtocol).decode(stream);
    }
}
