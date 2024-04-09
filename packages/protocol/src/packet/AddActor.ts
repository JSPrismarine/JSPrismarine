import type { NetworkBinaryStream } from '../';
import { ActorLink, NetworkPacket, PacketIdentifier, PropertySyncData, Vec2, Vec3 } from '../';

interface PacketData {
    targetActorUniqueId: bigint;
    targetActorRuntimeId: bigint;
    actorType: string;
    position: Vec3;
    velocity: Vec3;
    rotation: Vec2;
    headYaw: number;
    bodyYaw: number;
    attributes: Array<{ name: string; min: number; current: number; max: number }>; // TODO: attributes
    metadata: Array<unknown>; // TODO: metadata
    synchedProperties: PropertySyncData;
    actorLinks: Array<ActorLink>;
}

/**
 * Newly created entities on server use AddActorPacket to notify clients that they exist.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/AddActorPacket.html}
 */
export default class AddActorPacket extends NetworkPacket<PacketData> {
    get id(): number {
        return PacketIdentifier.ADD_ACTOR;
    }

    protected serializePayload(stream: NetworkBinaryStream, packetData: PacketData): void {
        stream.writeVarLong(packetData.targetActorUniqueId);
        stream.writeUnsignedVarLong(packetData.targetActorRuntimeId);
        stream.writeString(packetData.actorType);
        packetData.position.serialize(stream);
        packetData.velocity.serialize(stream);
        packetData.rotation.serialize(stream);
        stream.writeFloatLE(packetData.headYaw);
        stream.writeFloatLE(packetData.bodyYaw);
        stream.writeUnsignedVarInt(packetData.attributes.length);
        for (const attribute of packetData.attributes) {
            stream.writeString(attribute.name);
            stream.writeFloatLE(attribute.min);
            stream.writeFloatLE(attribute.current);
            stream.writeFloatLE(attribute.max);
        }
        stream.writeUnsignedVarInt(packetData.metadata.length); // TODO: metadata
        packetData.synchedProperties.serialize(stream);
        stream.writeUnsignedVarInt(packetData.actorLinks.length);
        for (const actorLink of packetData.actorLinks) {
            actorLink.serialize(stream);
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): PacketData {
        return {
            targetActorUniqueId: stream.readVarLong(),
            targetActorRuntimeId: stream.readUnsignedVarLong(),
            actorType: stream.readString(),
            position: Vec3.deserialize(stream),
            velocity: Vec3.deserialize(stream),
            rotation: Vec2.deserialize(stream),
            headYaw: stream.readFloatLE(),
            bodyYaw: stream.readFloatLE(),
            attributes: Array.from({ length: stream.readUnsignedVarInt() }, () => ({
                name: stream.readString(),
                min: stream.readFloatLE(),
                current: stream.readFloatLE(),
                max: stream.readFloatLE()
            })),
            metadata: Array.from({ length: stream.readUnsignedVarInt() }, () => ({})), // TODO: metadata
            synchedProperties: PropertySyncData.deserialize(stream),
            actorLinks: Array.from({ length: stream.readUnsignedVarInt() }, () => ActorLink.deserialize(stream))
        };
    }
}
