import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

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
    /** Present only when `mode` is {@link MovementType.Teleport}. */
    teleportCause?: number;
    teleportItemId?: number;
    tick: bigint;
}

/**
 * Where a player is, as the server tells a client - and as the bot harness tells the server.
 *
 * Two trailing fields exist only when the move is a teleport, which makes the packet's
 * length depend on one of its own bytes - read them unconditionally and the tick that
 * follows comes out as whatever the next four bytes happened to be.
 *
 * A real client has not sent one of these since 1.21.80: it sends `PlayerAuthInput` every
 * tick and receives this. JSPrismarine reads both - the server keeps its `MovePlayerHandler`
 * for the bots, which send the smaller packet - and this package has no `PlayerAuthInput`
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

        // Optional, with a byte of its own saying whether it is there. 748 inferred that from
        // the mode and wrote nothing.
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
        const mode = stream.readByte() as MovementType;
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
