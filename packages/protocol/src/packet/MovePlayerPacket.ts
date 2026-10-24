import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * The docs' Position Mode. `Reset` is the docs' Respawn and `Pitch` is the docs' OnlyHeadRot;
 * the values match.
 */
export enum MovementType {
    Normal,
    Reset,
    Teleport,
    Pitch
}

export interface MovePlayer {
    runtimeEntityId: bigint;
    position: { x: number; y: number; z: number };
    pitch: number;
    yaw: number;
    headYaw: number;
    mode: MovementType;
    onGround: boolean;
    ridingEntityRuntimeId: bigint;
    /** The docs' Teleportation Cause. Present only when `mode` is {@link MovementType.Teleport}. */
    teleportCause?: number;
    /**
     * The docs' Source Actor Type: the actor type that caused the teleport. The name is
     * historical. Present only when `mode` is {@link MovementType.Teleport}.
     */
    teleportItemId?: number;
    tick: bigint;
}

/**
 * Where a player is, as the server tells a client, or as the bot harness tells the server.
 *
 * Protocol 2193 wire order, with the field names Mojang's docs use: Player Runtime ID
 * (varuint64), Position (three LE floats), Rotation (pitch then yaw, LE floats), Y-Head
 * Rotation (LE float), Position Mode (uint8: 0 Normal, 1 Respawn, 2 Teleport, 3 OnlyHeadRot),
 * On Ground (bool), Riding Runtime ID (varuint64), Teleport Data (optional), Tick (varuint64).
 *
 * Teleport Data is an optional with a presence byte of its own, which the client only sets
 * when Position Mode is Teleport. When present it is Teleportation Cause and Source Actor
 * Type, both int32 LE. A reader that skips the presence byte takes it for the first byte of
 * the tick.
 *
 * A real client has not sent one of these since 1.21.80. It sends `PlayerAuthInput` every
 * tick and receives this. JSPrismarine reads both. The server keeps its `MovePlayerHandler`
 * for the bots, which send the smaller packet, and this package has no `PlayerAuthInput`
 * encoder yet, which a bot that wants to look like a real client will need.
 */
export default class MovePlayerPacket extends NetworkPacket<MovePlayer> {
    public get id(): number {
        return PacketIdentifier.MOVE_PLAYER;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: MovePlayer): void {
        stream.writeUnsignedVarLong(data.runtimeEntityId);

        stream.writeFloatLE(data.position.x);
        stream.writeFloatLE(data.position.y);
        stream.writeFloatLE(data.position.z);
        stream.writeFloatLE(data.pitch);
        stream.writeFloatLE(data.yaw);
        stream.writeFloatLE(data.headYaw);

        stream.writeByte(data.mode);
        stream.writeBoolean(data.onGround);
        stream.writeUnsignedVarLong(data.ridingEntityRuntimeId);

        // Teleport Data is an optional with a presence byte of its own, written on every move.
        const teleporting = data.mode === MovementType.Teleport;
        stream.writeBoolean(teleporting);
        if (teleporting) {
            stream.writeIntLE(data.teleportCause ?? 0);
            stream.writeIntLE(data.teleportItemId ?? 0);
        }

        stream.writeUnsignedVarLong(data.tick);
    }

    protected deserializePayload(stream: NetworkBinaryStream): MovePlayer {
        const runtimeEntityId = stream.readUnsignedVarLong();
        const position = { x: stream.readFloatLE(), y: stream.readFloatLE(), z: stream.readFloatLE() };
        const pitch = stream.readFloatLE();
        const yaw = stream.readFloatLE();
        const headYaw = stream.readFloatLE();
        const mode: MovementType = stream.readByte();
        const onGround = stream.readBoolean();
        const ridingEntityRuntimeId = stream.readUnsignedVarLong();

        const teleport = stream.readBoolean()
            ? { teleportCause: stream.readIntLE(), teleportItemId: stream.readIntLE() }
            : {};

        return {
            runtimeEntityId,
            position,
            pitch,
            yaw,
            headYaw,
            mode,
            onGround,
            ridingEntityRuntimeId,
            ...teleport,
            tick: stream.readUnsignedVarLong()
        };
    }
}
