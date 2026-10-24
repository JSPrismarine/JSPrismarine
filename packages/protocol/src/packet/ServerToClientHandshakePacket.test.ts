import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ServerToClientHandshakePacket from './ServerToClientHandshakePacket';

import type { ServerToClientHandshake } from './ServerToClientHandshakePacket';

/** `DATA` on the wire, header byte included: one varuint32-prefixed UTF-8 string. */
const BYTES = Buffer.from([
    0x03, // packet id header
    0x05, // Handshake WebToken length, a varuint32
    ...Buffer.from('a.b.c', 'utf8') // Handshake WebToken
]);

const DATA: ServerToClientHandshake = { jwt: 'a.b.c' };

/** The shape a real token takes: a base64url header with `x5u`, a payload with `salt`, a signature. */
const realistic = (): string => {
    const header = Buffer.from(JSON.stringify({ alg: 'ES384', x5u: 'MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAE' })).toString(
        'base64url'
    );
    const payload = Buffer.from(JSON.stringify({ salt: Buffer.alloc(16, 0xab).toString('base64') })).toString(
        'base64url'
    );

    return `${header}.${payload}.${Buffer.alloc(96, 0x5a).toString('base64url')}`;
};

describe('ServerToClientHandshakePacket', () => {
    it('writes the token as a length-prefixed string after id 3', () => {
        const buffer = new ServerToClientHandshakePacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new ServerToClientHandshakePacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('round trips a token shaped like the one a server sends', () => {
        const jwt = realistic();
        const buffer = new ServerToClientHandshakePacket({ jwt }).serialize(new NetworkBinaryStream());
        const stream = new NetworkBinaryStream(buffer);

        expect(new ServerToClientHandshakePacket().deserialize(stream)).toEqual({ jwt });
        expect(stream.feof()).toBe(true);
    });
});
