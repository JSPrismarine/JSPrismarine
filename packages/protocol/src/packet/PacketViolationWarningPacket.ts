import { packetViolationWarningPacket } from '../wire/definitions/packetViolationWarning';
import { layoutAt } from '../wire/WireLayout';

import FieldNetworkPacket from '../FieldNetworkPacket';

/**
 * What the client objected to, as the Violation Type varint32 numbers it.
 *
 * The numbering starts at -1 at both protocol versions. The 1.26.50 page prints the members from
 * 0, and the 1.26.60 page prints them from -1 with a changelog row that "moves" them; Mojang's
 * pinned enum dump from the 1.26.40 build (`packages/minecraft/datagen/snapshot/0e00fe80f4f3-enums.html`)
 * already numbers them from -1, so the 1.26.50 page is the documentation being corrected, not a
 * wire change (see `docs/research/protocol-2225-delta.md`).
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
 * Layout at protocol 2193 and 2225 (docs id 156), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Violation Type | varint32 | ZigZag; one of {@link PacketViolationType} |
 * | Violation Severity | varint32 | ZigZag; one of {@link PacketViolationSeverity} |
 * | Violation PacketId | varint32 | ZigZag; the id of the packet the client rejected |
 * | Violation Context | string | The client's own description of what went wrong |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/packet-violation-warning-packet/
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
        layoutAt(packetViolationWarningPacket, this.codecProtocol).encode(this, this);
    }

    /** Reads the three ZigZag varints and the context string. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(packetViolationWarningPacket, this.codecProtocol).decode(this));
    }
}
