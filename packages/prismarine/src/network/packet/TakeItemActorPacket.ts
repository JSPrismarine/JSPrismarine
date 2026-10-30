import { layoutAt, takeItemActorPacket } from '@jsprismarine/protocol';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * Tells the client an item entity has been picked up.
 *
 * This is what plays the collection animation, the stack darting into whoever took it, and
 * it is also how the client learns to put the item in its own copy of the inventory. The
 * entity still has to be despawned separately; this packet only describes the taking.
 *
 * **Bound To:** Client
 *
 * Protocol 2193 layout (docs id 17), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Item Runtime ID | varuint64 | The item entity being taken |
 * | Actor Runtime ID | varuint64 | Who is taking it |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/take-item-actor-packet/
 */
export default class TakeItemActorPacket extends FieldNetworkPacket {
    /** Item Runtime ID, the item entity being taken. */
    public itemRuntimeEntityId!: bigint;
    /** Actor Runtime ID, the entity taking it. */
    public takerRuntimeEntityId!: bigint;

    public decodePayload(): void {
        const read = layoutAt(takeItemActorPacket, this.codecProtocol).decode(this);
        this.itemRuntimeEntityId = read.itemRuntimeEntityId;
        this.takerRuntimeEntityId = read.takerRuntimeEntityId;
    }

    public encodePayload(): void {
        layoutAt(takeItemActorPacket, this.codecProtocol).encode(this, {
            itemRuntimeEntityId: this.itemRuntimeEntityId,
            takerRuntimeEntityId: this.takerRuntimeEntityId
        });
    }
}
