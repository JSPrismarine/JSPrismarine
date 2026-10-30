import { layoutAt, removeActorPacket } from '@jsprismarine/protocol';

import DataPacket from './DataPacket';

/**
 * Tells the client an entity is gone. Players are removed the same way.
 *
 * Protocol 2193 layout (docs id 14):
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Target Actor ID | varint64 | ZigZag encoded unique id |
 */
export default class RemoveActorPacket extends DataPacket {
    public uniqueEntityId!: bigint;

    /**
     * Reads the Target Actor ID. The server only sends this packet; decoding serves tests and logging.
     */
    public decodePayload(): void {
        this.uniqueEntityId = layoutAt(removeActorPacket, this.codecProtocol).decode(this).uniqueEntityId;
    }

    public encodePayload(): void {
        layoutAt(removeActorPacket, this.codecProtocol).encode(this, { uniqueEntityId: this.uniqueEntityId });
    }
}
