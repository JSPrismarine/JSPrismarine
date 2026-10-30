import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { addItemActorPacket } from '../wire/definitions/addItemActor';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { AddItemActorPayload } from '../wire/definitions/addItemActor';

/**
 * Adds a dropped item actor to the client world, with the stack and its initial movement.
 *
 * Mojang describes this as the packet sent when an item actor enters the world. The payload
 * carries a signed target actor id, unsigned runtime id, full item descriptor, position,
 * velocity, actor metadata, and a fishing-origin flag. Both vectors are three little-endian
 * floats; the descriptor and metadata use their shared Protocol structures.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/add-item-actor-packet/
 */
export default class AddItemActorPacket extends NetworkPacket<AddItemActorPayload> {
    /** Accepts payload data for sending or an encoded buffer for decoding. */
    public constructor(packetData?: AddItemActorPayload | Buffer | null, buffer?: Buffer) {
        if (Buffer.isBuffer(packetData)) {
            super(null, packetData);
        } else {
            super(packetData ?? null, buffer);
        }
    }

    public get id(): number {
        return PacketIdentifier.ADD_ITEM_ACTOR;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: AddItemActorPayload): void {
        layoutAt(addItemActorPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): AddItemActorPayload {
        return layoutAt(addItemActorPacket, this.codecProtocol).decode(stream);
    }
}
