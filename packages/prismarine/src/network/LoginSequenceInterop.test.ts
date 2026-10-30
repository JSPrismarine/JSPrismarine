import { LoginPacket, NetworkBinaryStream } from '@jsprismarine/protocol';
import type { NetworkPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import ServerLoginPacket from './packet/LoginPacket';

/**
 * The login packet still has a server-side field adapter alongside Protocol's typed packet.
 * Encoding with each and decoding with the other catches a wire mismatch that a round trip
 * through only one implementation would miss.
 */

/** Encodes with the Protocol package. */
const clientBytes = (packet: NetworkPacket<unknown>): Buffer => packet.serialize(new NetworkBinaryStream());

/** Encodes with the server adapter. */
const serverBytes = (packet: NetworkPacket): Buffer => {
    packet.encode();
    return packet.getBuffer();
};

/** Decodes with Protocol and checks that the entire packet was consumed. */
const readAsClient = <T>(packet: NetworkPacket<T>, buffer: Buffer): T => {
    const stream = new NetworkBinaryStream(buffer);
    const data = packet.deserialize(stream);
    expect(stream.feof()).toBe(true);
    return data;
};

describe('login packet interop', () => {
    const data = { protocolVersion: 2193, chainData: '{"chain":[]}', clientData: 'a.b.c' };

    it('agrees byte for byte on connection request framing', () => {
        const server = new ServerLoginPacket();
        server.protocol = data.protocolVersion;
        server.chainData = data.chainData;
        server.clientData = data.clientData;

        expect(clientBytes(new LoginPacket(data))).toEqual(serverBytes(server));
    });

    it('lets Protocol read what the server adapter wrote', () => {
        const server = new ServerLoginPacket();
        server.protocol = data.protocolVersion;
        server.chainData = data.chainData;
        server.clientData = data.clientData;

        expect(readAsClient(new LoginPacket(), serverBytes(server))).toEqual(data);
    });
});
