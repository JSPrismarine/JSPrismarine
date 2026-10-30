import NetworkStructure from '../NetworkStructure';
import BlockPos from './BlockPos';

import type BinaryStream from '@jsprismarine/binaryutils';

/**
 * One block change inside an `UpdateSubChunkBlocksPacket`.
 *
 * Wire layout, in docs order: `Pos` (a `BlockPos`, three ZigZag varint32), `Runtime Id`
 * (varuint32), `Update Flags` (varuint32, the same bit set `UpdateBlockPacket` carries:
 * 1 neighbors, 2 network, 4 no graphics, 8 priority), `Sync Message - Entity Unique ID`
 * (varuint64, the falling block actor the change is synced with, 0 when none), and
 * `Sync Message - Message` (varuint32: 0 none, 1 block became an actor, 2 actor became
 * a block).
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/update-sub-chunk-network-block-info/}
 */
export default class UpdateSubChunkNetworkBlockInfo extends NetworkStructure {
    /**
     * Creates a block change entry.
     * @param position - `Pos`, the absolute block position.
     * @param runtimeId - `Runtime Id` of the block now at that position.
     * @param updateFlags - `Update Flags`, how the client applies the change.
     * @param syncMessageEntityUniqueId - `Sync Message - Entity Unique ID`, 0 when the change is not synced with an actor.
     * @param syncMessageType - `Sync Message - Message`, the transition type, 0 when none.
     */
    public constructor(
        public position: BlockPos,
        public runtimeId: number,
        public updateFlags: number,
        public syncMessageEntityUniqueId: bigint,
        public syncMessageType: number
    ) {
        super();
    }

    /** Writes the five fields in docs order. */
    public serialize(stream: BinaryStream): void {
        this.position.serialize(stream);
        stream.writeUnsignedVarInt(this.runtimeId);
        stream.writeUnsignedVarInt(this.updateFlags);
        stream.writeUnsignedVarLong(this.syncMessageEntityUniqueId);
        stream.writeUnsignedVarInt(this.syncMessageType);
    }

    /** Reads the five fields in docs order. */
    public deserialize(stream: BinaryStream): void {
        const position = new BlockPos(0, 0, 0);
        position.deserialize(stream);
        this.position = position;
        this.runtimeId = stream.readUnsignedVarInt();
        this.updateFlags = stream.readUnsignedVarInt();
        this.syncMessageEntityUniqueId = stream.readUnsignedVarLong();
        this.syncMessageType = stream.readUnsignedVarInt();
    }
}
