import { removeActorPacket } from '../wire/definitions/actors';
import { layoutAt } from '../../wire/WireLayout';

import FieldNetworkPacket from '../../FieldNetworkPacket';

/**
 * Tells the client an entity is gone. Players are removed the same way.
 *
 * Protocol 2193 layout (docs id 14):
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Target Actor ID | varint64 | ZigZag encoded unique id |
 *
 * Protocol 2225 uses the same layout.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/remove-actor-packet/
 */
export default class RemoveActorPacket extends FieldNetworkPacket {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'RemoveActorPacket';
    }

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
