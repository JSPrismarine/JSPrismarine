import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import BlockPos from '../structure/BlockPos';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** How the client synchronizes a moving block actor with its block form. */
export enum ActorSyncMessage {
    /** No actor synchronization accompanies the block update. */
    None = 0,
    /** The block becomes an actor at this position. */
    BlockToEntity = 1,
    /** The actor becomes a block at this position. */
    EntityToBlock = 2
}

/** A block update paired with the moving actor that changes into or out of it. */
export interface UpdateBlockSynced {
    /** Position of the changed block. */
    blockPosition: BlockPos;
    /** Runtime id of the block state after the update. */
    blockRuntimeId: number;
    /** `BlockUpdateFlag` bits that control how the client applies the change. */
    flags: number;
    /** Block layer: 0 for the block, or 1 for its waterlogging layer. */
    layer: number;
    /** Runtime id of the moving block actor. */
    uniqueActorId: bigint;
    /** Describes whether the actor appears or disappears with this block update. */
    actorSyncMessage: ActorSyncMessage;
}

/**
 * Synchronizes a moving block actor with a block change at the same position.
 *
 * Protocol 2193 layout: `Block Position` as three ZigZag varint32 values, then `Block Runtime
 * ID`, `Flags`, and `Layer` as varuint32 values, `Unique Actor Id` as a varuint64, and
 * `Actor Sync Message` as a varuint64. The actor message distinguishes a block becoming an
 * actor from an actor becoming a block.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/update-block-synced-packet/
 */
export default class UpdateBlockSyncedPacket extends NetworkPacket<UpdateBlockSynced> {
    public get id(): number {
        return PacketIdentifier.UPDATE_BLOCK_SYNCED;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: UpdateBlockSynced): void {
        data.blockPosition.serialize(stream);
        stream.writeUnsignedVarInt(data.blockRuntimeId);
        stream.writeUnsignedVarInt(data.flags);
        stream.writeUnsignedVarInt(data.layer);
        stream.writeUnsignedVarLong(data.uniqueActorId);
        stream.writeUnsignedVarLong(BigInt(data.actorSyncMessage));
    }

    protected deserializePayload(stream: NetworkBinaryStream): UpdateBlockSynced {
        const blockPosition = new BlockPos(0, 0, 0);
        blockPosition.deserialize(stream);

        const blockRuntimeId = stream.readUnsignedVarInt();
        const flags = stream.readUnsignedVarInt();
        const layer = stream.readUnsignedVarInt();
        const uniqueActorId = stream.readUnsignedVarLong();
        const actorSyncMessage: ActorSyncMessage = Number(stream.readUnsignedVarLong());

        return { blockPosition, blockRuntimeId, flags, layer, uniqueActorId, actorSyncMessage };
    }
}
