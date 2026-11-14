import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { playerActionPacket } from '../wire/definitions/player';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * The docs' `PlayerActionType`, the Action field of `PlayerActionPacket`, numbered as the
 * game numbers it at protocols 2193 and 2225 alike: `Unknown` is -1 and `StartDestroyBlock` is 0,
 * with the gaps the 1.26.60 page prints. The 1.26.50 page prints dense list positions that
 * the 1.26.60 changelog calls a renumbering; it is the docs being corrected, and Mojang's 1.26.40
 * `enums.html` dump (`datagen/snapshot/0e00fe80f4f3-enums.html`) numbers the enum the same way
 * the code does. `PlayerActionPacket.test.ts` checks every member against that dump. Member
 * names are the docs' names; the six values the 1.26.60 page leaves unnamed (3, 4, 19, 20, 25
 * and 36) take the dump's names. `Count` is a sentinel and is left out.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/player-action-packet/
 */
export enum PlayerActionType {
    Unknown = -1,
    StartDestroyBlock = 0,
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
    UpdatedEnchantingSeed,
    StartSwimming,
    StopSwimming,
    StartSpinAttack,
    StopSpinAttack,
    InteractWithBlock,
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
    ClientAckServerData = 36,
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
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/player-action-packet/
 */
export default class PlayerActionPacket extends NetworkPacket<PlayerActionData> {
    public get id(): number {
        return PacketIdentifier.PLAYER_ACTION;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: PlayerActionData): void {
        layoutAt(playerActionPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PlayerActionData {
        return layoutAt(playerActionPacket, this.codecProtocol).decode(stream);
    }
}
