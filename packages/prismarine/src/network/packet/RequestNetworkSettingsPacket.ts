import DataPacket from './DataPacket';

/**
 * The first packet of a connection, and the only one sent before compression is agreed.
 *
 * Protocol 2193 carries a single field, `ClientNetworkVersion`, a big endian int32. It is not a
 * varint on purpose: a server speaking another protocol still has to read it so it can refuse
 * the connection with the right `PlayStatus`. Mojang's page says nothing else may be added here.
 *
 * **Bound To:** Server
 */
export default class RequestNetworkSettingsPacket extends DataPacket {
    /** `ClientNetworkVersion`, the protocol version the client speaks. */
    public protocolVersion!: number;

    /** Writes `ClientNetworkVersion` as a big endian int32. */
    public encodePayload(): void {
        this.writeInt(this.protocolVersion);
    }

    /** Reads `ClientNetworkVersion` as a big endian int32. */
    public decodePayload(): void {
        this.protocolVersion = this.readInt();
    }
}
