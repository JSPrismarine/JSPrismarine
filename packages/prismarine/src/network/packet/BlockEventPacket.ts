import BlockPosition from '../../world/BlockPosition';
import { NetworkUtil } from '../NetworkUtil';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * Replays a block's own animation on the client: a chest lid, a shulker box, an end gateway.
 *
 * **Bound To:** Client
 *
 * Event Type and Event Value mean whatever the block at the position makes of them. A chest
 * reads Event Type 1 with Event Value as the number of viewers, so one means open and zero
 * means closed.
 *
 * Protocol 2193 layout (docs id 26), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Block Position | BlockPos | Three ZigZag varint32 |
 * | Event Type | varint32 | Meaning depends on the block |
 * | Event Value | varint32 | Meaning depends on Event Type |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/block-event-packet/
 */
export default class BlockEventPacket extends FieldNetworkPacket {
    /** Block Position, the block the event belongs to. */
    public blockPosition: BlockPosition = new BlockPosition(0, 0, 0);

    /** Event Type, interpreted by the block at Block Position. */
    public eventType = 0;

    /** Event Value, the argument to Event Type. */
    public eventValue = 0;

    /** Reads the block position and the event pair. */
    public decodePayload(): void {
        this.blockPosition = NetworkUtil.readBlockPosition(this);
        this.eventType = this.readVarInt();
        this.eventValue = this.readVarInt();
    }

    /** Writes the block position and the event pair. */
    public encodePayload(): void {
        NetworkUtil.writeBlockPosition(this, this.blockPosition);
        this.writeVarInt(this.eventType);
        this.writeVarInt(this.eventValue);
    }
}
