import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import AgentActionEventPacket, { AgentActionType } from './AgentActionEventPacket';

import type { AgentActionEvent } from './AgentActionEventPacket';

const DATA: AgentActionEvent = {
    requestId: 'req-1',
    action: AgentActionType.TURN,
    response: '{"ok":true}'
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xb5, 0x01], // packet id header, 181 as a varuint32
    ...[0x05, ...Buffer.from('req-1', 'utf8')], // Request Id "req-1", 5 bytes
    ...[0x12, 0x00, 0x00, 0x00], // Action Turn (18), little-endian int32
    ...[0x0b, ...Buffer.from('{"ok":true}', 'utf8')] // Response JSON text, 11 bytes
]);

/** The first member of the enum, which pins that the numbering starts at 1 and not 0. */
const ATTACK: AgentActionEvent = {
    requestId: '',
    action: AgentActionType.ATTACK,
    response: ''
};

/** `ATTACK` on the wire: the header, an empty request id, 1 as int32, an empty response. */
const ATTACK_BYTES = Buffer.from([0xb5, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]);

describe('AgentActionEventPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new AgentActionEventPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new AgentActionEventPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('writes Attack as 1, the first value the client knows', () => {
        const buffer = new AgentActionEventPacket(ATTACK).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...ATTACK_BYTES]);
    });

    it('reads Attack back from a 1', () => {
        const stream = new NetworkBinaryStream(ATTACK_BYTES);
        const data = new AgentActionEventPacket().deserialize(stream);

        expect(data).toEqual(ATTACK);
        expect(stream.feof()).toBe(true);
    });
});
