import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import PartyDestinationCookieResponsePacket from './PartyDestinationCookieResponsePacket';

import type { PartyDestinationCookieResponse } from './PartyDestinationCookieResponsePacket';

const DATA: PartyDestinationCookieResponse = {
    cookie: 'abc',
    accepted: true
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xde, 0x02], // packet id header: 350 as a varuint32
    ...[0x03, 0x61, 0x62, 0x63], // cookie "abc"
    0x01 // accepted
]);

/** A declined cookie the client did not echo: the header, an empty string, a zero byte. */
const DECLINED_BYTES = Buffer.from([0xde, 0x02, 0x00, 0x00]);

describe('PartyDestinationCookieResponsePacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new PartyDestinationCookieResponsePacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new PartyDestinationCookieResponsePacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('reads a declined response with an empty cookie', () => {
        const stream = new NetworkBinaryStream(DECLINED_BYTES);

        expect(new PartyDestinationCookieResponsePacket().deserialize(stream)).toEqual({ cookie: '', accepted: false });
        expect(stream.feof()).toBe(true);
    });
});
