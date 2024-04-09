import type { NetworkBinaryStream } from '../';
import { NetworkPacket, Vec2, Vec3 } from '../';
import { PacketIdentifier } from '../PacketIdentifier';
import { PlayerPositionMode } from '@jsprismarine/minecraft';

interface BasePacketData {
    actorRuntimeId: bigint;
    position: Vec3;
    rotation: Vec2;
    headYaw: number;
    positionMode: PlayerPositionMode;
    onGround: boolean;
    ridingRuntimeId: bigint;
    tick: bigint;
}

interface PacketDataWithoutTeleport extends BasePacketData {
    positionMode: PlayerPositionMode.NORMAL | PlayerPositionMode.ONLY_HEAD_ROT | PlayerPositionMode.RESPAWN;
}

interface PacketDataWithTeleport extends BasePacketData {
    positionMode: PlayerPositionMode.TELEPORT;
    teleportationCause: number;
    sourceActorType: number;
}

export type PacketData = PacketDataWithTeleport | PacketDataWithoutTeleport;

/**
 * This is the packet that keeps track of position, rotation, head rotation, if the actor is on ground, and if it is riding something.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/MovePlayerPacket.html}
 */
export default class MovePlayerPacket extends NetworkPacket<PacketData> {
    get id(): number {
        return PacketIdentifier.MOVE_PLAYER;
    }

    protected serializePayload(stream: NetworkBinaryStream, packetData: PacketData): void {
        stream.writeUnsignedVarLong(packetData.actorRuntimeId);
        packetData.position.serialize(stream);
        packetData.rotation.serialize(stream);
        stream.writeFloatLE(packetData.headYaw);
        stream.writeByte(packetData.positionMode);
        stream.writeBoolean(packetData.onGround);
        stream.writeUnsignedVarLong(packetData.ridingRuntimeId);
        if (packetData.positionMode === PlayerPositionMode.TELEPORT) {
            packetData = packetData as PacketDataWithTeleport;
            stream.writeIntLE(packetData.teleportationCause);
            stream.writeIntLE(packetData.sourceActorType);
        }
        stream.writeUnsignedVarLong(packetData.tick);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PacketData {
        const actorRuntimeId = stream.readUnsignedVarLong();
        const position = Vec3.deserialize(stream);
        const rotation = Vec2.deserialize(stream);
        const headYaw = stream.readFloatLE();
        const positionMode = stream.readByte() as PlayerPositionMode;
        const onGround = stream.readBoolean();
        const ridingRuntimeId = stream.readUnsignedVarLong();
        if (positionMode === PlayerPositionMode.TELEPORT) {
            return {
                actorRuntimeId,
                position,
                rotation,
                headYaw,
                positionMode,
                onGround,
                ridingRuntimeId,
                teleportationCause: stream.readIntLE(),
                sourceActorType: stream.readIntLE(),
                tick: stream.readUnsignedVarLong()
            };
        }
        return {
            actorRuntimeId,
            position,
            rotation,
            headYaw,
            positionMode,
            onGround,
            ridingRuntimeId,
            tick: stream.readUnsignedVarLong()
        };
    }
}
