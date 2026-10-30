import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * The docs' `PlayerActionType`, the Action field of `PlayerActionPacket`, numbered as the
 * 1.26.51 client writes it. Member names are the docs' names; `GetUpdatedBlock`, `DropItem`,
 * `ChangeSkin`, `SetEnchantmentSeed` and `InteractBlock` are values the docs leave unnamed.
 * Values 36 and 39 (`Count`) are not named in the docs and are left out.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/player-action-packet/
 */
export enum PlayerActionType {
    StartDestroyBlock,
    AbortDestroyBlock,
    StopDestroyBlock,
    GetUpdatedBlock,
    DropItem,
    StartSleeping,
    StopSleeping,
    Respawn,
    StartJump,
    StartSprinting,
    StopSprinting,
    StartSneaking,
    StopSneaking,
    CreativeDestroyBlock,
    ChangeDimensionAck,
    StartGliding,
    StopGliding,
    DenyDestroyBlock,
    CrackBlock,
    ChangeSkin,
    SetEnchantmentSeed,
    StartSwimming,
    StopSwimming,
    StartSpinAttack,
    StopSpinAttack,
    InteractBlock,
    PredictDestroyBlock,
    ContinueDestroyBlock,
    StartItemUseOn,
    StopItemUseOn,
    HandledTeleport = 30,
    /** The client swung at nothing. */
    MissedSwing = 31,
    StartCrawling = 32,
    StopCrawling = 33,
    StartFlying = 34,
    StopFlying = 35,
    StartUsingItem = 37,
    /** Reserved by the client for its own bookkeeping; carries no gameplay meaning. */
    InternalUpdate = 38
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
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/player-action-packet/
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
