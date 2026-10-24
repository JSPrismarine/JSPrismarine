import { describe, expect, it } from 'vitest';

import InetAddress from '../utils/InetAddress';
import Packet from './Packet';

/**
 * The two primitives every RakNet handshake packet is built from, pinned to their bytes.
 *
 * `SystemAddress` travels in `OpenConnectionRequest2`, `OpenConnectionReply2`,
 * `ConnectionRequestAccepted` and `NewIncomingConnection`, and the MOTD string travels in
 * `UnconnectedPong`. Both are written unsigned and both used to be read signed.
 */

/** A packet with no payload of its own, so a test can drive the primitives directly. */
class RawPacket extends Packet {
    public constructor(buffer?: Buffer) {
        super(0x00, buffer);
    }
}

describe('Packet', () => {
    describe('address', () => {
        it('writes the version, the complemented octets, then the port big endian', () => {
            const packet = new RawPacket();
            packet.writeAddress(new InetAddress('192.168.0.1', 19_132, 4));

            expect(packet.getBuffer()).toEqual(
                Buffer.from([
                    4, // IPv4
                    ~192 & 0xff,
                    ~168 & 0xff,
                    ~0 & 0xff,
                    ~1 & 0xff,
                    0x4a, // 19132 >> 8
                    0xbc // 19132 & 0xff
                ])
            );
        });

        it('reads an ephemeral port back unsigned', () => {
            // 60000 has its top bit set. Read as a signed short it came back as -5536, which
            // is the range an operating system picks a connecting client's port from.
            const written = new RawPacket();
            written.writeAddress(new InetAddress('127.0.0.1', 60_000, 4));

            const address = new RawPacket(written.getBuffer()).readAddress();

            expect(address.getAddress()).toBe('127.0.0.1');
            expect(address.getPort()).toBe(60_000);
        });

        it('round trips every boundary port', () => {
            for (const port of [0, 1, 19_132, 32_767, 32_768, 49_152, 65_535]) {
                const written = new RawPacket();
                written.writeAddress(new InetAddress('10.0.0.255', port, 4));

                expect(new RawPacket(written.getBuffer()).readAddress().getPort()).toBe(port);
            }
        });
    });

    describe('string', () => {
        it('writes an unsigned 16 bit big-endian length then the bytes', () => {
            const packet = new RawPacket();
            packet.writeString('Hi');

            expect(packet.getBuffer()).toEqual(Buffer.from([0x00, 0x02, 0x48, 0x69]));
        });

        it('reads a string longer than a signed short can describe', () => {
            const motd = 'a'.repeat(40_000);
            const written = new RawPacket();
            written.writeString(motd);

            expect(new RawPacket(written.getBuffer()).readString()).toBe(motd);
        });
    });
});
