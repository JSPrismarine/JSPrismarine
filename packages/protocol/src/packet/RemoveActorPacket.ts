import { removeActorPacket } from '../wire/definitions/actors';
import { layoutAt } from '../wire/WireLayout';

import FieldNetworkPacket from '../FieldNetworkPacket';

/**
 * Tells the client an entity is gone. Players are removed the same way.
 *
 * Protocol 2193 layout (docs id 14):
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Target Actor ID | varint64 | ZigZag encoded unique id |
 */
export default class RemoveActorPacket extends FieldNetworkPacket {
    public uniqueEntityId!: bigint;

    /**
     * Reads the Target Actor ID. The server only sends this packet; decoding serves tests and logging.
     */
    public decodePayload(): void {
        this.uniqueEntityId = layoutAt(removeActorPacket, this.codecProtocol).decode(this).uniqueEntityId;
    }

    /** Writes the target actor's unique ID using the packet's ZigZag varint64 field. */
    public encodePayload(): void {
        layoutAt(removeActorPacket, this.codecProtocol).encode(this, { uniqueEntityId: this.uniqueEntityId });
    }
}
