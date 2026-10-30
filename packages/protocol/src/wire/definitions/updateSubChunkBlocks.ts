/**
 * Block changes within one sub-chunk. Standard blocks and extra blocks such as waterlogged
 * states travel in separate lists after the sub-chunk origin.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/update-sub-chunk-blocks-packet/}
 */
import BlockPos from '../../structure/BlockPos';
import UpdateSubChunkNetworkBlockInfo from '../../structure/UpdateSubChunkNetworkBlockInfo';
import { definePacket } from '../define';
import * as t from '../fieldTypes';

/** One block change entry, bridged from the hand-written `UpdateSubChunkNetworkBlockInfo`. */
const blockInfo = t.custom<UpdateSubChunkNetworkBlockInfo>(
    'UpdateSubChunkNetworkBlockInfo',
    (s, v) => v.serialize(s),
    (s) => {
        const info = new UpdateSubChunkNetworkBlockInfo(new BlockPos(0, 0, 0), 0, 0, 0n, 0);
        info.deserialize(s);
        return info;
    }
);

/**
 * The `UpdateSubChunkBlocksPacket` field list: every block that changed in one sub chunk
 * during a tick. The `Blocks Changed` lists carry the first block layer's changes, then the
 * second layer's, which holds waterlogging.
 */
export const updateSubChunkBlocksPacket = definePacket('UpdateSubChunkBlocksPacket', {
    /** `Sub Chunk Block Position`: the block position of the sub chunk's origin corner. */
    subChunkBlockPosition: t.blockPos,
    /** `Blocks Changed - Standards`: the changes on the first block layer. */
    standards: t.list(blockInfo),
    /** `Blocks Changed - Extras`: the changes on the second layer. */
    extras: t.list(blockInfo)
});
