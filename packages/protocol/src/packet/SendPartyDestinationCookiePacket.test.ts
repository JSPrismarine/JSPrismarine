import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import { sendPartyDestinationCookiePacket } from '../wire/definitions/sendPartyDestinationCookie';
import { layoutAt } from '../wire/WireLayout';
import SendPartyDestinationCookiePacket, { PartyDestinationCookieIntent } from './SendPartyDestinationCookiePacket';

import type { SendPartyDestinationCookie } from './SendPartyDestinationCookiePacket';

const DATA: SendPartyDestinationCookie = {
    cookie: 'abc',
    intent: PartyDestinationCookieIntent.OptIn,
    destinationName: 'Lobby'
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xdd, 0x02], // packet id header: 349 as a varuint32
    ...[0x03, 0x61, 0x62, 0x63], // cookie "abc"
    ...[0x05, 0x4f, 0x70, 0x74, 0x49, 0x6e], // intent: the member name "OptIn" as a string
    ...[0x05, 0x4c, 0x6f, 0x62, 0x62, 0x79] // destination_name "Lobby"
]);

describe('SendPartyDestinationCookiePacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new SendPartyDestinationCookiePacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new SendPartyDestinationCookiePacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('rejects an intent that is not a member name', () => {
        const stream = new NetworkBinaryStream(
            Buffer.from([0xdd, 0x02, 0x00, ...[0x06, 0x6e, 0x6f, 0x74, 0x69, 0x66, 0x79], 0x00])
        );

        expect(() => new SendPartyDestinationCookiePacket().deserialize(stream)).toThrow(/intent "notify"/);
    });
});

describe.each([2193, 2225] as const)('the SendPartyDestinationCookie layout at %i', (protocol) => {
    const layout = layoutAt(sendPartyDestinationCookiePacket, protocol);
    const body = BYTES.subarray(2);

    it('writes the same bytes at both versions, as the 1.26.50 and 1.26.60 pages list them', () => {
        const stream = new NetworkBinaryStream();
        layout.encode(stream, DATA);

        expect([...stream.getBuffer()]).toEqual([...body]);
    });

    it('reads those bytes back to the end', () => {
        const stream = new NetworkBinaryStream(body);

        expect(layout.decode(stream)).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });
});
