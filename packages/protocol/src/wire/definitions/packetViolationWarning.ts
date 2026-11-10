/**
 * `PacketViolationWarningPacket`: The client reporting that a packet the server sent did not parse.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/packet-violation-warning-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `PacketViolationWarningPacket` field list. */
export const packetViolationWarningPacket = definePacket('PacketViolationWarningPacket', {
    /** Violation Type: what kind of problem the client found. */
    type: t.varint32,
    /** Violation Severity: what the client does about it. */
    severity: t.varint32,
    /** Violation PacketId: the id of the packet the client rejected. */
    packetId: t.varint32,
    /** Violation Context: the client's description of the problem. */
    message: t.string
});

/** The client reporting that a packet the server sent did not parse. */
export type PacketViolationWarningPayload = PayloadOf<typeof packetViolationWarningPacket>;
