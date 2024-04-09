import { NBTTagCompound, ByteOrder } from '@jsprismarine/nbt';
import {
    ItemData,
    NetworkPacket,
    PacketIdentifier,
    SyncedPlayerMovementSettings,
    Vec2,
    Vec3,
    UUID,
    LevelSettings,
    NetworkBinaryStream
} from '../';
import { BlockProperty } from '@jsprismarine/minecraft';

interface PacketData {
    targetActorUniqueId: bigint;
    targetActorRuntimeId: bigint;
    gamemode: number;
    position: Vec3;
    rotation: Vec2;
    levelSettings: LevelSettings;
    levelId: string;
    levelName: string;
    movementSettings: SyncedPlayerMovementSettings;
    currentLevelTime: bigint;
    serverVersion: string;
    playerPropertyData: NBTTagCompound;
    serverBlockTypeRegistryChecksum: bigint;
    serverEnableClientSideGeneration: boolean;
    templateContentIdentity: string;
    isTrial: boolean;
    enchantmentSeed: number;
    blockProperties: Array<BlockProperty>;
    itemList: Array<ItemData>;
    multiplayerCorrelationId: string;
    enableItemStackNetManager: boolean;
    worldTemplateId: UUID;
    blockNetworkIdsAreHashes: boolean;
    serverAuthSoundEnabled: boolean;
}

/**
 * Sent from the server to client when the game is starting (or client joins), gives ids and current tick.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/StartGamePacket.html}
 */
export default class StartGamePacket extends NetworkPacket<PacketData> {
    get id(): number {
        return PacketIdentifier.START_GAME;
    }

    protected serializePayload(stream: NetworkBinaryStream, packetData: PacketData): void {
        stream.writeVarLong(packetData.targetActorUniqueId);
        stream.writeUnsignedVarLong(packetData.targetActorRuntimeId);
        stream.writeVarInt(packetData.gamemode);
        packetData.position.serialize(stream);
        packetData.rotation.serialize(stream);
        packetData.levelSettings.serialize(stream);
        stream.writeString(packetData.levelId);
        stream.writeString(packetData.levelName);
        stream.writeString(packetData.templateContentIdentity);
        stream.writeBoolean(packetData.isTrial);
        packetData.movementSettings.serialize(stream);
        stream.writeUnsignedLongLE(packetData.currentLevelTime);
        stream.writeVarInt(packetData.enchantmentSeed);
        stream.writeUnsignedVarInt(packetData.blockProperties.length);
        for (const blockProperty of packetData.blockProperties) {
            stream.writeString(blockProperty.name);
            blockProperty.definition.writeToStream(stream, ByteOrder.LITTLE_ENDIAN, true);
        }
        stream.writeUnsignedVarInt(packetData.itemList.length);
        for (const itemData of packetData.itemList) {
            itemData.serialize(stream);
        }
        stream.writeString(packetData.multiplayerCorrelationId);
        stream.writeBoolean(packetData.enableItemStackNetManager);
        stream.writeString(packetData.serverVersion);
        packetData.playerPropertyData.writeToStream(stream, ByteOrder.LITTLE_ENDIAN, true);
        stream.writeUnsignedLongLE(packetData.serverBlockTypeRegistryChecksum);
        packetData.worldTemplateId.serialize(stream);
        stream.writeBoolean(packetData.serverEnableClientSideGeneration);
        stream.writeBoolean(packetData.blockNetworkIdsAreHashes);
        stream.writeBoolean(packetData.serverAuthSoundEnabled);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PacketData {
        return {
            targetActorUniqueId: stream.readVarLong(),
            targetActorRuntimeId: stream.readUnsignedVarLong(),
            gamemode: stream.readVarInt(),
            position: Vec3.deserialize(stream),
            rotation: Vec2.deserialize(stream),
            levelSettings: LevelSettings.deserialize(stream),
            levelId: stream.readString(),
            levelName: stream.readString(),
            templateContentIdentity: stream.readString(),
            isTrial: stream.readBoolean(),
            movementSettings: SyncedPlayerMovementSettings.deserialize(stream),
            currentLevelTime: stream.readUnsignedLongLE(),
            enchantmentSeed: stream.readVarInt(),
            blockProperties: Array.from({ length: stream.readVarInt() }).map(() => {
                return {
                    name: stream.readString(),
                    definition: NBTTagCompound.readFromStream(stream, ByteOrder.LITTLE_ENDIAN, true)
                };
            }),
            itemList: Array.from({ length: stream.readUnsignedVarInt() }).map(() => ItemData.deserialize(stream)),
            multiplayerCorrelationId: stream.readString(),
            enableItemStackNetManager: stream.readBoolean(),
            serverVersion: stream.readString(),
            playerPropertyData: NBTTagCompound.readFromStream(stream, ByteOrder.LITTLE_ENDIAN, true),
            serverBlockTypeRegistryChecksum: stream.readUnsignedLongLE(),
            worldTemplateId: UUID.deserialize(stream),
            serverEnableClientSideGeneration: stream.readBoolean(),
            blockNetworkIdsAreHashes: stream.readBoolean(),
            serverAuthSoundEnabled: stream.readBoolean()
        };
    }
}
