import { NetworkUtil } from '../NetworkUtil';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * What the client objected to, as the Violation Type varint32 numbers it.
 *
 * The numbering starts at -1. The 1.26.51 page prints the members from 0, and its
 * 1.26.60-preview.21 changelog then "moves" Unknown to -1 and PacketMalformed to 0, which are
 * the values gophertunnel has used since the packet appeared.
 */
export enum PacketViolationType {
    Unknown = -1,
    PacketMalformed = 0
}

/**
 * What the client does about the violation, as the Violation Severity varint32 numbers it.
 *
 * Numbered from -1 for the same reason as {@link PacketViolationType}.
 */
export enum PacketViolationSeverity {
    Unknown = -1,
    Warning = 0,
    FinalWarning = 1,
    TerminatingConnection = 2
}

/**
 * The client reporting that a packet the server sent did not parse.
 *
 * **Bound To:** Server
 *
 * The client sends one of these when its decoder rejects a packet, names the packet by id, and
 * says whether it will keep the connection. It is the only word the server gets about a
 * malformed clientbound packet, so a join that stalls after a given packet shows up here first.
 *
 * Protocol 2193 layout (docs id 156), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Violation Type | varint32 | ZigZag; one of {@link PacketViolationType} |
 * | Violation Severity | varint32 | ZigZag; one of {@link PacketViolationSeverity} |
 * | Violation PacketId | varint32 | ZigZag; the id of the packet the client rejected |
 * | Violation Context | string | The client's own description of what went wrong |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/packet-violation-warning-packet/
 */
export default class PacketViolationWarningPacket extends FieldNetworkPacket {
    /** Violation Type: what kind of problem the client found. */
    public type: PacketViolationType = PacketViolationType.Unknown;

    /** Violation Severity: what the client does about it. */
    public severity: PacketViolationSeverity = PacketViolationSeverity.Unknown;

    /** Violation PacketId: the id of the packet the client rejected. */
    public packetId = 0;

    /** Violation Context: the client's description of the problem. */
    public message = '';

    /** Writes the three ZigZag varints and the context string. */
    public encodePayload(): void {
        this.writeVarInt(this.type);
        this.writeVarInt(this.severity);
        this.writeVarInt(this.packetId);
        NetworkUtil.writeString(this, this.message);
    }

    /** Reads the three ZigZag varints and the context string. */
    public decodePayload(): void {
        this.type = this.readVarInt();
        this.severity = this.readVarInt();
        this.packetId = this.readVarInt();
        this.message = NetworkUtil.readString(this);
    }
}
