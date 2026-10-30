import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import BlockPos from '../structure/BlockPos';
import { updateSubChunkBlocksPacket } from '../wire/definitions/updateSubChunkBlocks';
import { layoutAt } from '../wire/WireLayout';
import { protocolVersion } from '../wire/versions/v2193';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type UpdateSubChunkNetworkBlockInfo from '../structure/UpdateSubChunkNetworkBlockInfo';

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
 * The definition carries no version gate, so it resolves to the same frozen layout at every
 * protocol; the oldest supported version stands in for the packet class, which does not know
 * its session's protocol.
 */
const layout = () => layoutAt(updateSubChunkBlocksPacket, protocolVersion);

/**
 * Every block that changed in one sub chunk during a tick. The server sends one per sub
 * chunk with changes, instead of one `UpdateBlockPacket` per block.
 *
 * The wire layout is the `updateSubChunkBlocksPacket` definition in `wire/definitions`.
 */
export default class UpdateSubChunkBlocksPacket extends NetworkPacket<UpdateSubChunkBlocks> {
    public get id(): number {
        return PacketIdentifier.UPDATE_SUB_CHUNK_BLOCKS;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: UpdateSubChunkBlocks): void {
        layout().encode(stream, {
            subChunkBlockPosition: data.subChunkBlockPosition,
            standards: data.blocksChanged.standards,
            extras: data.blocksChanged.extras
        });
    }

    protected deserializePayload(stream: NetworkBinaryStream): UpdateSubChunkBlocks {
        const read = layout().decode(stream);
        return {
            subChunkBlockPosition: new BlockPos(
                read.subChunkBlockPosition.x,
                read.subChunkBlockPosition.y,
                read.subChunkBlockPosition.z
            ),
            blocksChanged: { standards: read.standards, extras: read.extras }
        };
    }
}
