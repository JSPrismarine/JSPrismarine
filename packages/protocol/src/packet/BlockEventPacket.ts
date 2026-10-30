import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import BlockPos from '../structure/BlockPos';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** A block position and the block-defined event pair sent for it. */
export interface BlockEvent {
    /** Block Position where the event happened. */
    blockPosition: BlockPos;
    /** Event Type, interpreted by the block at `blockPosition`. */
    eventType: number;
    /** Event Value, interpreted together with `eventType`. */
    eventValue: number;
}

/**
 * Synchronizes a block event between server and client. Event Type and Event Value are opaque
 * integers whose meaning is defined by the block; a chest, for example, uses the pair to
 * update its lid animation and viewer count.
 *
 * Protocol 2193 layout: `Block Position` as a {@link BlockPos}, then `Event Type` and
 * `Event Value` as ZigZag varint32 values.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/block-event-packet/
 */
export default class BlockEventPacket extends NetworkPacket<BlockEvent> {
    public get id(): number {
        return PacketIdentifier.BLOCK_EVENT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: BlockEvent): void {
        data.blockPosition.serialize(stream);
        stream.writeVarInt(data.eventType);
        stream.writeVarInt(data.eventValue);
    }

    protected deserializePayload(stream: NetworkBinaryStream): BlockEvent {
        const blockPosition = new BlockPos(0, 0, 0);
        blockPosition.deserialize(stream);
        return {
            blockPosition,
            eventType: stream.readVarInt(),
            eventValue: stream.readVarInt()
        };
    }
}
