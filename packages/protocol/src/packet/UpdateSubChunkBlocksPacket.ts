import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import BlockPos from '../structure/BlockPos';
import UpdateSubChunkNetworkBlockInfo from '../structure/UpdateSubChunkNetworkBlockInfo';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The `Blocks Changed` field, an `UpdateSubChunkBlocksChangedInfo`, in wire order. */
export interface UpdateSubChunkBlocksChangedInfo {
    /** `Blocks Changed - Standards`, the changes on the first block layer. */
    standards: UpdateSubChunkNetworkBlockInfo[];
    /** `Blocks Changed - Extras`, the changes on the second layer, which holds waterlogging. */
    extras: UpdateSubChunkNetworkBlockInfo[];
}

/** The fields of an `UpdateSubChunkBlocksPacket`, in wire order. */
export interface UpdateSubChunkBlocks {
    /** `Sub Chunk Block Position`, the block position of the sub chunk's origin corner. */
    subChunkBlockPosition: BlockPos;
    /** `Blocks Changed`, the changes in that sub chunk since the last tick. */
    blocksChanged: UpdateSubChunkBlocksChangedInfo;
}

/**
 * Every block that changed in one sub chunk during a tick. The server sends one per sub
 * chunk with changes, instead of one `UpdateBlockPacket` per block.
 *
 * Protocol 2193 layout, in wire order: `Sub Chunk Block Position` as a `BlockPos` (three
 * ZigZag varint32), then `Blocks Changed - Standards` and `Blocks Changed - Extras`, each a
 * varuint32 count followed by that many {@link UpdateSubChunkNetworkBlockInfo} entries.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/update-sub-chunk-blocks-packet/}
 */
export default class UpdateSubChunkBlocksPacket extends NetworkPacket<UpdateSubChunkBlocks> {
    public get id(): number {
        return PacketIdentifier.UPDATE_SUB_CHUNK_BLOCKS;
    }

    private static writeEntries(stream: NetworkBinaryStream, entries: UpdateSubChunkNetworkBlockInfo[]): void {
        stream.writeUnsignedVarInt(entries.length);
        for (const entry of entries) {
            entry.serialize(stream);
        }
    }

    private static readEntries(stream: NetworkBinaryStream): UpdateSubChunkNetworkBlockInfo[] {
        const entries: UpdateSubChunkNetworkBlockInfo[] = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            entries.push(UpdateSubChunkNetworkBlockInfo.deserialize(stream));
        }
        return entries;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: UpdateSubChunkBlocks): void {
        data.subChunkBlockPosition.serialize(stream);
        UpdateSubChunkBlocksPacket.writeEntries(stream, data.blocksChanged.standards);
        UpdateSubChunkBlocksPacket.writeEntries(stream, data.blocksChanged.extras);
    }

    protected deserializePayload(stream: NetworkBinaryStream): UpdateSubChunkBlocks {
        const subChunkBlockPosition = new BlockPos(0, 0, 0);
        subChunkBlockPosition.deserialize(stream);
        const standards = UpdateSubChunkBlocksPacket.readEntries(stream);
        const extras = UpdateSubChunkBlocksPacket.readEntries(stream);

        return { subChunkBlockPosition, blocksChanged: { standards, extras } };
    }
}
