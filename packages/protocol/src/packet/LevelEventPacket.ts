import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import Vec3 from '../structure/Vec3';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The world event id, its position, and event-specific data. */
export interface LevelEvent {
    /** Event identifier; the client selects its sound, particles, or other effect from this. */
    eventId: number;
    /** Event position, or `null` to encode the origin used by the server's global events. */
    position: Vec3 | null;
    /** Event-specific value, such as the block runtime id for a block-breaking effect. */
    data: number;
}

/**
 * Tells the client what happened in the world and where. The event number selects the
 * client-side behavior, while `Data` supplies any event-specific value.
 *
 * Protocol 2193 layout: `Event Id` as a ZigZag varint32, `Position` as three little-endian
 * floats, and `Data` as a ZigZag varint32.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/level-event-packet/
 */
export default class LevelEventPacket extends NetworkPacket<LevelEvent> {
    public get id(): number {
        return PacketIdentifier.LEVEL_EVENT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: LevelEvent): void {
        stream.writeVarInt(data.eventId);
        (data.position ?? new Vec3(0, 0, 0)).serialize(stream);
        stream.writeVarInt(data.data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): LevelEvent {
        const eventId = stream.readVarInt();
        const position = new Vec3(0, 0, 0);
        position.deserialize(stream);
        const data = stream.readVarInt();
        return { eventId, position, data };
    }
}
