import type BlockPosition from '../../world/BlockPosition';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

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
export default class PlayerActionPacket extends DataPacket {
    public static NetID = Identifiers.PlayerActionPacket;

    public runtimeEntityId!: bigint;
    public action!: number;
    public blockPosition!: BlockPosition;
    public resultPosition!: BlockPosition;
    public blockFace!: number;

    public decodePayload(): void {
        this.runtimeEntityId = this.readUnsignedVarLong();
        this.action = this.readVarInt();
        this.blockPosition = NetworkUtil.readBlockPosition(this);
        this.resultPosition = NetworkUtil.readBlockPosition(this);
        this.blockFace = this.readVarInt();
    }

    public encodePayload(): void {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeVarInt(this.action);
        NetworkUtil.writeBlockPosition(this, this.blockPosition);
        NetworkUtil.writeBlockPosition(this, this.resultPosition);
        this.writeVarInt(this.blockFace);
    }
}
