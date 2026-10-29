import DataPacket from './DataPacket';

/**
 * A ping the client uses for its debug latency graph.
 *
 * Wire layout at protocol 2193: Creation Time as a uint64 LE, then Is From Server as a
 * boolean. Mojang marks the packet deprecated, but a 1.26.51 client still sends it.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/network-stack-latency-packet/
 */
export default class NetworkStackLatencyPacket extends DataPacket {
    /** The sender's clock when it built the packet, in its own units. */
    public creationTime = 0n;

    /** `true` when the server originated the ping; the client echoes the server's value. */
    public isFromServer = false;

    /** Reads the timestamp and the direction flag. */
    public decodePayload(): void {
        this.creationTime = this.readUnsignedLongLE();
        this.isFromServer = this.readBoolean();
    }

    /** Writes the timestamp and the direction flag. */
    public encodePayload(): void {
        this.writeUnsignedLongLE(this.creationTime);
        this.writeBoolean(this.isFromServer);
    }
}
