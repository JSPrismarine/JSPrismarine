import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * `Position Mode`, which tells the client how to apply this move.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/move-player-packet/
 */
export enum PositionMode {
    /** Ordinary movement. Clients also send this mode to the server. */
    Normal,
    /** Places the player at the spawn position. Sent by the server. */
    Respawn,
    /** Moves the player to a new location; carries `Teleportation Cause` and `Source Actor Type`. */
    Teleport,
    /** Updates the head rotation while the player is in a vehicle. */
    OnlyHeadRot
}

export interface MovePlayer {
    /** The player being moved, or the sending player for a server-bound packet. */
    runtimeEntityId: bigint;
    /** The player's predicted world position after this movement update. */
    position: { x: number; y: number; z: number };
    /** Pitch in degrees. */
    pitch: number;
    /** Body yaw in degrees. */
    yaw: number;
    /** Head yaw in degrees, usually the same as `yaw`. */
    headYaw: number;
    /** How the receiving client should apply this move. */
    mode: PositionMode;
    /** Whether the player is touching the ground. */
    onGround: boolean;
    /** The riding actor; has no meaning in a client-bound packet. */
    ridingEntityRuntimeId: bigint;
    /** The docs' Teleportation Cause. Present only when `mode` is {@link PositionMode.Teleport}. */
    teleportCause?: number;
    /**
     * The docs' Source Actor Type: the actor type that caused the teleport. The name is
     * historical. Present only when `mode` is {@link PositionMode.Teleport}.
     */
    teleportItemId?: number;
    /** The client input tick this movement corresponds to. */
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
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/move-player-packet/
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
        const teleporting = data.mode === PositionMode.Teleport;
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
        const mode: PositionMode = stream.readByte();
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
