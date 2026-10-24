import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import BlockPosition from '../../world/BlockPosition';
import DataPacket from './DataPacket';

/**
 * Which way a moving block actor is crossing between block and actor form.
 *
 * Vanilla's `ActorBlockSyncMessage::MessageId`, whose members are `NONE`, `CREATE` (the
 * actor appears as the block goes) and `DESTROY` (the actor goes as the block appears).
 */
export enum ActorSyncMessage {
    None = 0,
    BlockToEntity = 1,
    EntityToBlock = 2
}

/**
 * A block change that has to land on the same tick as a moving block actor appearing or
 * vanishing.
 *
 * `UpdateBlockPacket` with two extra fields naming the actor involved. Falling sand and
 * piston-pushed blocks use it: without the pairing the client shows the block and the actor at
 * once, or neither, for a tick.
 *
 * **Bound To:** Client
 *
 * Protocol 2193 layout (docs id 110), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Block Position | BlockPos | Three ZigZag varint32 |
 * | Block Runtime ID | varuint32 | Hashed state id, as in `UpdateBlockPacket` |
 * | Flags | varuint32 | `UpdateBlockFlagsType` bits |
 * | Layer | varuint32 | `UpdateBlockLayerType` |
 * | Unique Actor Id | varuint64 | The moving block actor |
 * | Actor Sync Message | varuint64 | {@link ActorSyncMessage} |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/update-block-synced-packet/
 */
export default class UpdateBlockSyncedPacket extends DataPacket {
    public static NetID = Identifiers.UpdateBlockSyncedPacket;

    public blockPosition = new BlockPosition(0, 0, 0);

    /** Runtime id of the block that stands at the position after this update. */
    public blockRuntimeId = 0;

    /** How the client applies the change, the same bits `UpdateBlockPacket` takes. */
    public flags = 0;

    /** 0 for ordinary blocks, 1 for the waterlogging layer. */
    public layer = 0;

    /** The moving block actor this change is paired with. */
    public uniqueActorId = 0n;

    public actorSyncMessage: ActorSyncMessage = ActorSyncMessage.None;

    /** Reads the position, the block, the update flags and the paired actor. */
    public decodePayload(): void {
        this.blockPosition = NetworkUtil.readBlockPosition(this);
        this.blockRuntimeId = this.readUnsignedVarInt();
        this.flags = this.readUnsignedVarInt();
        this.layer = this.readUnsignedVarInt();
        this.uniqueActorId = this.readUnsignedVarLong();
        this.actorSyncMessage = Number(this.readUnsignedVarLong());
    }

    /** Writes the position, the block, the update flags and the paired actor. */
    public encodePayload(): void {
        NetworkUtil.writeBlockPosition(this, this.blockPosition);
        this.writeUnsignedVarInt(this.blockRuntimeId);
        this.writeUnsignedVarInt(this.flags);
        this.writeUnsignedVarInt(this.layer);
        this.writeUnsignedVarLong(this.uniqueActorId);
        this.writeUnsignedVarLong(BigInt(this.actorSyncMessage));
    }
}
