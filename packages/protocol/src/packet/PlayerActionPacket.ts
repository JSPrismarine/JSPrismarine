import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

export enum PlayerActionType {
    START_BREAK,
    ABORT_BREAK,
    STOP_BREAK,
    GET_UPDATED_BLOCK,
    DROP_ITEM,
    START_SLEEPING,
    STOP_SLEEPING,
    RESPAWN,
    JUMP,
    START_SPRINT,
    STOP_SPRINT,
    START_SNEAK,
    STOP_SNEAK,
    CREATIVE_PLAYER_DESTROY_BLOCK,
    DIMENSION_CHANGE_ACK,
    START_GLIDE,
    STOP_GLIDE,
    BUILD_DENIED,
    CRACK_BLOCK,
    CHANGE_SKIN,
    SET_ENCHANTMENT_SEED,
    START_SWIMMING,
    STOP_SWIMMING,
    START_SPIN_ATTACK,
    STOP_SPIN_ATTACK,
    INTERACT_BLOCK,
    PREDICT_DESTROY_BLOCK,
    CONTINUE_DESTROY_BLOCK,
    START_ITEM_USE_ON,
    STOP_ITEM_USE_ON
}

/**
 * A block position: three signed varints.
 *
 * This packet used to write its y unsigned, and did so until 1.26.10 - which is the layout
 * the server's reader was still expecting. Since then it is an ordinary `BlockPos`, signed
 * all the way through, and the two encodings disagree for every height: zigzag turns 64 into
 * 128, so a reader on the old form takes the block face out of the middle of a coordinate.
 */
export interface BlockCoordinates {
    x: number;
    y: number;
    z: number;
}

export interface PlayerActionData {
    runtimeEntityId: bigint;
    action: PlayerActionType;
    blockPosition: BlockCoordinates;
    resultPosition: BlockCoordinates;
    blockFace: number;
}

/** Everything a player does that is not moving: breaking, sneaking, sprinting, jumping. */
export default class PlayerActionPacket extends NetworkPacket<PlayerActionData> {
    public get id(): number {
        return PacketIdentifier.PLAYER_ACTION;
    }

    private static writeBlockPos(stream: NetworkBinaryStream, position: BlockCoordinates): void {
        stream.writeVarInt(position.x);
        stream.writeVarInt(position.y);
        stream.writeVarInt(position.z);
    }

    private static readBlockPos(stream: NetworkBinaryStream): BlockCoordinates {
        return { x: stream.readVarInt(), y: stream.readVarInt(), z: stream.readVarInt() };
    }

    protected serializePayload(stream: NetworkBinaryStream, data: PlayerActionData): void {
        stream.writeUnsignedVarLong(data.runtimeEntityId);
        stream.writeVarInt(data.action);
        PlayerActionPacket.writeBlockPos(stream, data.blockPosition);
        PlayerActionPacket.writeBlockPos(stream, data.resultPosition);
        stream.writeVarInt(data.blockFace);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PlayerActionData {
        return {
            runtimeEntityId: stream.readUnsignedVarLong(),
            action: stream.readVarInt(),
            blockPosition: PlayerActionPacket.readBlockPos(stream),
            resultPosition: PlayerActionPacket.readBlockPos(stream),
            blockFace: stream.readVarInt()
        };
    }
}
