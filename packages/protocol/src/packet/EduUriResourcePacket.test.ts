import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import EduUriResourcePacket from './EduUriResourcePacket';

import type { EduUriResource } from './EduUriResourcePacket';

const DATA: EduUriResource = {
    eduSharedUriResource: { buttonName: 'Learn more', linkUri: 'https://edu.example/lesson' }
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xaa, 0x01], // packet id header: 170 as a varuint32
    ...[0x0a, ...Buffer.from('Learn more', 'utf8')], // Button Name, 10 bytes
    ...[0x1a, ...Buffer.from('https://edu.example/lesson', 'utf8')] // Link Uri, 26 bytes
]);

describe('EduUriResourcePacket', () => {
    it('writes the button name then the link after the header', () => {
        const buffer = new EduUriResourcePacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new EduUriResourcePacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('round-trips an empty resource', () => {
        const empty: EduUriResource = { eduSharedUriResource: { buttonName: '', linkUri: '' } };
        const buffer = new EduUriResourcePacket(empty).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([0xaa, 0x01, 0x00, 0x00]);
        expect(new EduUriResourcePacket().deserialize(new NetworkBinaryStream(buffer))).toEqual(empty);
    });
});
