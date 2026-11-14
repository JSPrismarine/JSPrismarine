import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { blockEventPacket } from '../wire/definitions/blockEvent';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { BlockEventPayload } from '../wire/definitions/blockEvent';

/** A block position and the block-defined event pair sent for it. */
export type BlockEvent = BlockEventPayload;

/**
 * Synchronizes a block event between server and client. Event Type and Event Value are opaque
 * integers whose meaning is defined by the block; a chest, for example, uses the pair to
 * update its lid animation and viewer count.
 *
 * Layout, unchanged between protocols 2193 and 2225: `Block Position` as a `BlockPos`, then `Event Type` and
 * `Event Value` as ZigZag varint32 values.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/block-event-packet/
 */
export default class BlockEventPacket extends NetworkPacket<BlockEvent> {
    public get id(): number {
        return PacketIdentifier.BLOCK_EVENT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: BlockEvent): void {
        layoutAt(blockEventPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): BlockEvent {
        return layoutAt(blockEventPacket, this.codecProtocol).decode(stream);
    }
}
