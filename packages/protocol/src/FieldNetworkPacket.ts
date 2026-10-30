import NetworkPacket from './NetworkPacket';
import type NetworkBinaryStream from './NetworkBinaryStream';
import type { ProtocolContext } from './ProtocolContext';

/**
 * A field-based packet that keeps its wire codec on the shared `NetworkPacket` contract.
 *
 * The server's former packet classes expose mutable fields and read or write them through
 * inherited stream methods. This adapter lets those packet bodies move into the protocol
 * package without keeping a second packet header or a second stream implementation. New
 * packet classes should use a typed payload and implement `serializePayload` directly.
 */
export default class FieldNetworkPacket extends NetworkPacket<unknown> {
    /** A field-based packet has no separate payload object. */
    public constructor(buffer?: Buffer) {
        super(undefined, buffer);
    }

    /** Legacy packet bodies write their fields through this stream. */
    protected serializePayload(stream: NetworkBinaryStream, _packetData: unknown, _context?: ProtocolContext): void {
        this.clear();
        this.encodePayload();
        if (this.getWriteIndex() > 0) stream.write(this.getWriteBuffer());
    }

    protected deserializePayload(stream: NetworkBinaryStream, _context?: ProtocolContext): undefined {
        this.reuse(stream.readRemaining());
        this.decodePayload();
        this.encoded = true;
        return undefined;
    }

    /** Encodes the legacy field body using the negotiated version already stamped on the packet. */
    public override encode(context?: ProtocolContext): void {
        if (context !== undefined) this.codecProtocol = context.protocolVersion;
        this.clear();
        this.encodeHeader();
        this.encodePayload();
        this.encoded = true;
    }

    /** Decodes a legacy field body and leaves the original packet bytes available via `getBuffer`. */
    public override decode(context?: ProtocolContext): void {
        if (context !== undefined) this.codecProtocol = context.protocolVersion;
        const buffer = this.getReadBuffer();
        if (buffer === null) throw new Error(`Cannot decode ${this.getName()} without a read buffer`);
        this.setReadBuffer(buffer);
        this.decodeHeader();
        this.decodePayload();
        this.encoded = true;
    }
}
