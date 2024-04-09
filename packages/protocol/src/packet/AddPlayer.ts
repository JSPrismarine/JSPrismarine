import { BuildPlatform, Gamemode } from '@jsprismarine/minecraft';
import type { NetworkBinaryStream } from '../';
import {
    ActorLink,
    NetworkItemStackDescriptor,
    NetworkPacket,
    PacketIdentifier,
    PropertySyncData,
    SerializedAbilitiesData,
    UUID,
    Vec2,
    Vec3
} from '../';

interface PacketData {
    uuid: UUID;
    playerName: string;
    targetRuntimeId: bigint;
    position: Vec3;
    carriedItem: NetworkItemStackDescriptor;
    gamemode: Gamemode.Gametype;
    metadata: Array<unknown>;
    propertySyncData: PropertySyncData;
    abilitiesData: SerializedAbilitiesData;
    platformChatId: string;
    velocity: Vec3;
    rotation: Vec2;
    headYaw: number;
    actorLinks: Array<ActorLink>;
    deviceId: string;
    buildPlatform: BuildPlatform;
}

/**
 * A new player joins the game; the server sends this packet to the *other* players.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/AddPlayerPacket.html}
 */
export default class AddPlayerPacket extends NetworkPacket<PacketData> {
    get id(): number {
        return PacketIdentifier.ADD_PLAYER;
    }

    protected serializePayload(stream: NetworkBinaryStream, packetData: PacketData): void {
        packetData.uuid.serialize(stream);
        stream.writeString(packetData.playerName);
        stream.writeUnsignedVarLong(packetData.targetRuntimeId);
        stream.writeString(packetData.platformChatId);
        packetData.position.serialize(stream);
        packetData.velocity.serialize(stream);
        packetData.rotation.serialize(stream);
        stream.writeFloatLE(packetData.headYaw);
        packetData.carriedItem.serialize(stream);
        stream.writeVarInt(packetData.gamemode);
        // TODO: metadata
        stream.writeUnsignedVarInt(0);
        packetData.propertySyncData.serialize(stream);
        packetData.abilitiesData.serialize(stream);
        stream.writeUnsignedVarInt(packetData.actorLinks.length);
        for (const actorLink of packetData.actorLinks) {
            actorLink.serialize(stream);
        }
        stream.writeString(packetData.deviceId);
        stream.writeIntLE(packetData.buildPlatform);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PacketData {
        return {
            uuid: UUID.deserialize(stream),
            playerName: stream.readString(),
            targetRuntimeId: stream.readUnsignedVarLong(),
            platformChatId: stream.readString(),
            position: Vec3.deserialize(stream),
            velocity: Vec3.deserialize(stream),
            rotation: Vec2.deserialize(stream),
            headYaw: stream.readFloatLE(),
            carriedItem: NetworkItemStackDescriptor.deserialize(stream),
            gamemode: stream.readVarInt(),
            metadata: Array.from({ length: stream.readUnsignedVarInt() }), // TODO: metadata
            propertySyncData: PropertySyncData.deserialize(stream),
            abilitiesData: SerializedAbilitiesData.deserialize(stream),
            actorLinks: Array.from({ length: stream.readUnsignedVarInt() }, () => ActorLink.deserialize(stream)),
            deviceId: stream.readString(),
            buildPlatform: stream.readIntLE()
        };
    }
}
