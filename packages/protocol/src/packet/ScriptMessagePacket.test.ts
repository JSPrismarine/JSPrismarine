import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ScriptMessagePacket from './ScriptMessagePacket';

import type { ScriptMessage } from './ScriptMessagePacket';

const DATA: ScriptMessage = {
    messageId: 'jsp:ping',
    messageValue: '{"seq":1}'
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xb1, 0x01], // packet id header, 177 as a varuint32
    ...[0x08, ...Buffer.from('jsp:ping', 'utf8')], // Message Id "jsp:ping", 8 bytes
    ...[0x09, ...Buffer.from('{"seq":1}', 'utf8')] // Message Value '{"seq":1}', 9 bytes
]);

/** Both strings empty: the header and two zero lengths. */
const EMPTY: ScriptMessage = { messageId: '', messageValue: '' };

const EMPTY_BYTES = Buffer.from([0xb1, 0x01, 0x00, 0x00]);

describe('ScriptMessagePacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new ScriptMessagePacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new ScriptMessagePacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('writes two empty strings as two zero lengths', () => {
        const buffer = new ScriptMessagePacket(EMPTY).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...EMPTY_BYTES]);
    });

    it('reads two empty strings to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(EMPTY_BYTES);
        const data = new ScriptMessagePacket().deserialize(stream);

        expect(data).toEqual(EMPTY);
        expect(stream.feof()).toBe(true);
    });
});
