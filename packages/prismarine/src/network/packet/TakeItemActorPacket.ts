import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * Tells the client an item entity has been picked up.
 *
 * This is what plays the collection animation - the stack darting into whoever took it - and
 * it is also how the client learns to put the item in its own copy of the inventory. The
 * entity still has to be despawned separately; this packet only describes the taking.
 *
 * **Bound To:** Client
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | itemRuntimeEntityId | UnsignedVarLong | The item entity being taken |
 * | takerRuntimeEntityId | UnsignedVarLong | Who is taking it |
 */
export default class TakeItemActorPacket extends DataPacket {
    public static NetID = Identifiers.TakeItemActorPacket;

    public itemRuntimeEntityId!: bigint;
    public takerRuntimeEntityId!: bigint;

    public decodePayload(): void {
        this.itemRuntimeEntityId = this.readUnsignedVarLong();
        this.takerRuntimeEntityId = this.readUnsignedVarLong();
    }

    public encodePayload(): void {
        this.writeUnsignedVarLong(this.itemRuntimeEntityId);
        this.writeUnsignedVarLong(this.takerRuntimeEntityId);
    }
}
