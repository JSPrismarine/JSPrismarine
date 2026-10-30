import NetworkPacket from './NetworkPacket';
import type NetworkBinaryStream from './NetworkBinaryStream';
import { netIdFor, protocolVersion } from './wire/versions/v2193';
import type { ProtocolContext } from './ProtocolContext';

/**
 * A field-based packet that keeps its wire codec on the shared `NetworkPacket` contract.
 *
 * The server's former packet classes expose mutable fields and read or write them through
 * inherited stream methods. This adapter lets those packet bodies move into the protocol
 * package without keeping a second packet header or a second stream implementation. New
 * packet classes should use a typed payload and implement `serializePayload` directly.
 */
export default class FieldNetworkPacket extends NetworkPacket<undefined> {
    /** The negotiated wire version used by version-gated field codecs. */
    public codecProtocol = protocolVersion;

    /**
     * The 2193 id for an older field-based packet, replaced by a codec stamp when needed.
     * @returns The packet's default wire id.
     */
    protected override getDefaultId(): number {
        return netIdFor(this.getName()) ?? -1;
    }

    /** A field-based packet has no separate payload object. */
    public constructor(buffer?: Buffer) {
        super(undefined, buffer);
    }

    /** Legacy packet bodies write their fields through this stream. */
    public encodePayload(): void {}

    /** Legacy packet bodies read their fields through this stream. */
    public decodePayload(): void {}

    protected serializePayload(stream: NetworkBinaryStream, _packetData: undefined, context?: ProtocolContext): void {
        if (context !== undefined) this.codecProtocol = context.protocolVersion;
        this.clear();
        this.encodePayload();
        if (this.getWriteIndex() > 0) stream.write(this.getWriteBuffer());
    }

    protected deserializePayload(stream: NetworkBinaryStream, context?: ProtocolContext): undefined {
        if (context !== undefined) this.codecProtocol = context.protocolVersion;
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
