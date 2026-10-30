import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { readItemStackDescriptor, writeItemStackDescriptor } from '../wire/structures/ItemStackDescriptor';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { ItemStackDescriptorData } from '../wire/structures/ItemStackDescriptor';

/** The five positional armor slots an entity can show to a client. */
export interface MobArmorEquipment {
    /** Runtime id of the entity wearing these items. */
    runtimeEntityId: bigint;
    /** Head armor. */
    head: ItemStackDescriptorData;
    /** Torso armor. */
    chest: ItemStackDescriptorData;
    /** Leg armor. */
    legs: ItemStackDescriptorData;
    /** Foot armor. */
    feet: ItemStackDescriptorData;
    /** Body armor, used by horses, llamas, and wolves. */
    body: ItemStackDescriptorData;
}

/**
 * Sends all five worn item slots for one entity.
 *
 * After the target runtime id, the packet carries head, torso, legs, feet, and body as five
 * `NetworkItemStackDescriptor` values. Empty slots are full air descriptors; omitting one
 * would shift every later slot for the client.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/mob-armor-equipment-packet/
 */
export default class MobArmorEquipmentPacket extends NetworkPacket<MobArmorEquipment> {
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
        stream.writeUnsignedVarLong(data.runtimeEntityId);
        writeItemStackDescriptor(stream, data.head);
        writeItemStackDescriptor(stream, data.chest);
        writeItemStackDescriptor(stream, data.legs);
        writeItemStackDescriptor(stream, data.feet);
        writeItemStackDescriptor(stream, data.body);
    }

    protected deserializePayload(stream: NetworkBinaryStream): MobArmorEquipment {
        return {
            runtimeEntityId: stream.readUnsignedVarLong(),
            head: readItemStackDescriptor(stream),
            chest: readItemStackDescriptor(stream),
            legs: readItemStackDescriptor(stream),
            feet: readItemStackDescriptor(stream),
            body: readItemStackDescriptor(stream)
        };
    }
}
