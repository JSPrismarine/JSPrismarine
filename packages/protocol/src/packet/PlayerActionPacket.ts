import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * The Action field of `PlayerActionPacket`, numbered as the 1.26.50 client writes it.
 * Values 36 and 39 (`Count`) are not named in the docs and are left out.
 */
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
    STOP_ITEM_USE_ON,
    HANDLED_TELEPORT = 30,
    /** The client swung at nothing. */
    MISSED_SWING = 31,
    START_CRAWLING = 32,
    STOP_CRAWLING = 33,
    START_FLYING = 34,
    STOP_FLYING = 35,
    START_USING_ITEM = 37,
    /** Reserved by the client for its own bookkeeping; carries no gameplay meaning. */
    INTERNAL_UPDATE = 38
}

/** A `BlockPos` as protocol 2193 writes it: three ZigZag varint32, y signed like the others. */
export interface BlockCoordinates {
    x: number;
    y: number;
    z: number;
}

/** The fields of a `PlayerActionPacket`, in wire order. */
export interface PlayerActionData {
    runtimeEntityId: bigint;
    action: PlayerActionType;
    blockPosition: BlockCoordinates;
    resultPosition: BlockCoordinates;
    blockFace: number;
}

/**
 * Client to server notice of a player action that is not movement: breaking, sneaking,
 * sprinting, jumping and the like.
 *
 * Protocol 2193 wire order after the header: Player Runtime ID (varuint64), Action (ZigZag
 * varint32), Block Position (`BlockPos`, three ZigZag varint32 with a signed y), Result Pos
 * (`BlockPos`), Face (ZigZag varint32).
 */
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
