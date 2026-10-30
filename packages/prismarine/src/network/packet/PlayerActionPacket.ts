import { layoutAt, playerActionPacket } from '@jsprismarine/protocol';

import BlockPosition from '../../world/BlockPosition';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * The docs' `PlayerActionType`, the Action field of `PlayerActionPacket`, numbered as the
 * 1.26.51 client writes it. Member names are the docs' names; `GetUpdatedBlock`, `DropItem`,
 * `ChangeSkin`, `SetEnchantmentSeed` and `InteractBlock` are values the docs leave unnamed.
 * Values 36 and 39 (`Count`) are not named in the docs and are left out.
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

/**
 * Client to server notice of a player action that is not movement: breaking, sneaking,
 * sprinting, jumping and the like.
 *
 * Protocol 2193 wire order after the header: Player Runtime ID (varuint64), Action (ZigZag
 * varint32), Block Position (`BlockPos`, three ZigZag varint32 with a signed y), Result Pos
 * (`BlockPos`), Face (ZigZag varint32).
 */
export default class PlayerActionPacket extends FieldNetworkPacket {
    public runtimeEntityId!: bigint;
    public action!: number;
    public blockPosition!: BlockPosition;
    public resultPosition!: BlockPosition;
    public blockFace!: number;

    public decodePayload(): void {
        const read = layoutAt(playerActionPacket, this.codecProtocol).decode(this);
        this.runtimeEntityId = read.runtimeEntityId;
        this.action = read.action;
        this.blockPosition = new BlockPosition(read.blockPosition.x, read.blockPosition.y, read.blockPosition.z);
        this.resultPosition = new BlockPosition(read.resultPosition.x, read.resultPosition.y, read.resultPosition.z);
        this.blockFace = read.blockFace;
    }

    public encodePayload(): void {
        layoutAt(playerActionPacket, this.codecProtocol).encode(this, {
            runtimeEntityId: this.runtimeEntityId,
            action: this.action,
            blockPosition: {
                x: this.blockPosition.getX(),
                y: this.blockPosition.getY(),
                z: this.blockPosition.getZ()
            },
            resultPosition: {
                x: this.resultPosition.getX(),
                y: this.resultPosition.getY(),
                z: this.resultPosition.getZ()
            },
            blockFace: this.blockFace
        });
    }
}
