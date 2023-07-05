import BlockPosition from '../../world/BlockPosition.js';
import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';

export enum PlayerAction {
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
        this.blockPosition = BlockPosition.networkDeserialize(this);
        this.resultPosition = BlockPosition.networkDeserialize(this);
        this.blockFace = this.readVarInt();
    }

    public encodePayload(): void {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeVarInt(this.action);
        this.blockPosition.networkSerialize(this);
        this.resultPosition.networkSerialize(this);
        this.writeVarInt(this.blockFace);
    }
}
