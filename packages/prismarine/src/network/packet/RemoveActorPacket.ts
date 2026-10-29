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
        this.uniqueEntityId = this.readVarLong();
    }

    public encodePayload(): void {
        this.writeVarLong(this.uniqueEntityId);
    }
}
