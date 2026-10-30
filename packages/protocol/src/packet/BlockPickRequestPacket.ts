import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import BlockPos from '../structure/BlockPos';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The position and hotbar state the client sends when it picks a block. */
export interface BlockPickRequest {
    /** Block to pick, encoded as a {@link BlockPos}. */
    position: BlockPos;
    /** Whether the picked item should include the block's data. */
    withData: boolean;
    /** Empty hotbar slots available to receive the picked item. */
    maxSlots: number;
}

/**
 * Sent when a player picks up a block in the world. The request names the block, says whether
 * to copy its data, and reports the client's empty hotbar slots.
 *
 * Protocol 2193 layout: `Position` as a {@link BlockPos}, `With Data?` as a boolean, then
 * `Max Slots` as a uint8.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/block-pick-request-packet/
 */
export default class BlockPickRequestPacket extends NetworkPacket<BlockPickRequest> {
    public get id(): number {
        return PacketIdentifier.BLOCK_PICK_REQUEST;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: BlockPickRequest): void {
        data.position.serialize(stream);
        stream.writeBoolean(data.withData);
        stream.writeByte(data.maxSlots);
    }

    protected deserializePayload(stream: NetworkBinaryStream): BlockPickRequest {
        const position = new BlockPos(0, 0, 0);
        position.deserialize(stream);
        return {
            position,
            withData: stream.readBoolean(),
            maxSlots: stream.readByte()
        };
    }
}
