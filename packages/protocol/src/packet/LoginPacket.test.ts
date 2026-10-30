import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import LoginPacket from './LoginPacket';

import type { Login } from './LoginPacket';

/** A login with the smallest chain and client data the framing allows. Neither blob is parsed here. */
const DATA: Login = {
    protocolVersion: 2193,
    chainData: '{}',
    clientData: 'x'
};

/** `DATA` on the wire, header byte included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    0x01, // packet id header
    ...[0x00, 0x00, 0x08, 0x91], // Client Network Version 2193, big-endian int32
    0x0b, // Connection Request: varuint32 byte length over the two strings, 11
    ...[0x02, 0x00, 0x00, 0x00], // the chain JSON's byte length, little-endian uint32
    ...Buffer.from('{}', 'ascii'),
    ...[0x01, 0x00, 0x00, 0x00], // the client data JWT's byte length, little-endian uint32
    ...Buffer.from('x', 'ascii')
]);

describe('LoginPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new LoginPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new LoginPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('reads the protocol version as a big-endian int32, not a varint', () => {
        // 2193 as a varuint would be 0x91 0x11; the docs mark the field Big Endian so that a
        // server of any version can read it before deciding whether to refuse the rest.
        const stream = new NetworkBinaryStream(BYTES);
        const data = new LoginPacket().deserialize(stream);

        expect(data.protocolVersion).toBe(2193);
    });

    it('reads through the declared request length rather than past it', () => {
        // The request claims 12 bytes but the packet carries 11. Reading the strings straight
        // off the stream would succeed here and leave the stream positioned inside the next
        // packet of the batch; taking the request as a sub-buffer fails instead.
        const claimsMore = Buffer.from(BYTES);
        claimsMore[5] = 0x0c;

        expect(() => new LoginPacket().deserialize(new NetworkBinaryStream(claimsMore))).toThrow();
    });

    it('rejects bytes left after the two connection request strings', () => {
        const trailing = Buffer.concat([
            BYTES.subarray(0, 5),
            Buffer.from([0x0c]),
            BYTES.subarray(6),
            Buffer.from([0xde])
        ]);

        expect(() => new LoginPacket().deserialize(new NetworkBinaryStream(trailing))).toThrow(
            'The connection request has 1 unread bytes after the client data'
        );
    });

    it('round-trips a login', () => {
        const buffer = new LoginPacket(DATA).serialize(new NetworkBinaryStream());
        const data = new LoginPacket().deserialize(new NetworkBinaryStream(buffer));

        expect(data).toEqual(DATA);
    });
});
