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

        it('rejects text that is not an IPv4 address instead of writing garbage', () => {
            const packet = new RawPacket();
            expect(() => packet.writeAddress(new InetAddress('not an address', 1, 4))).toThrow('Invalid IPv4');
            expect(() => packet.writeAddress(new InetAddress('1.2.3.256', 1, 4))).toThrow('Invalid IPv4');
        });
    });

    describe('IPv6 address', () => {
        // RakNet copies the sockaddr_in6 straight onto the wire, so the layout is the
        // struct's: family (host order, 23 on the Windows the client is built for), port
        // (network order), flow info, 16 address bytes, scope id.
        // https://github.com/facebookarchive/RakNet/blob/master/Source/BitStream.h#L1142
        const wire = Buffer.from([
            6, // IPv6
            0x17,
            0x00, // AF_INET6 little endian
            0x4a,
            0xbc, // 19132 big endian
            0x00,
            0x00,
            0x00,
            0x00, // flow info
            0x20,
            0x01,
            0x0d,
            0xb8,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x01,
            0x00,
            0x00,
            0x00,
            0x00 // scope id
        ]);

        it('writes the version, the family, the port, then the padded sockaddr_in6 fields', () => {
            const packet = new RawPacket();
            packet.writeAddress(new InetAddress('2001:db8::1', 19_132, 6));

            expect(packet.getBuffer()).toEqual(wire);
        });

        it('reads the address back as text rather than as the raw bytes', () => {
            // The 16 address bytes used to be decoded as a UTF-8 string, which for this
            // address is a run of control characters, not an address anything could use.
            const address = new RawPacket(wire).readAddress();

            expect(address.getAddress()).toBe('2001:db8::1');
            expect(address.getPort()).toBe(19_132);
            expect(address.getVersion()).toBe(6);
        });

        it('round trips every textual form Node reports', () => {
            for (const text of [
                '::',
                '::1',
                'fe80::1',
                '1:2:3:4:5:6:7:8',
                '1:0:0:2::3', // the longer zero run wins the compression
                '1::2:0:0:3', // and the first wins a tie
                '2001:db8:0:1::', // a trailing run
                '::ffff:192.0.2.1' // an IPv4-mapped address keeps its dotted tail
            ]) {
                const written = new RawPacket();
                written.writeAddress(new InetAddress(text, 60_000, 6));

                const address = new RawPacket(written.getBuffer()).readAddress();
                expect(address.getAddress()).toBe(text);
                expect(address.getPort()).toBe(60_000);
            }
        });

        it('normalizes uppercase hex and a zone id on the way out', () => {
            const written = new RawPacket();
            written.writeAddress(new InetAddress('FE80::ABCD%en0', 1, 6));

            expect(new RawPacket(written.getBuffer()).readAddress().getAddress()).toBe('fe80::abcd');
        });

        it('rejects text that is not an IPv6 address', () => {
            for (const text of ['1::2::3', '1:2:3:4:5:6:7:8:9', '12345::', 'g::1', '::ffff:1.2.3']) {
                const packet = new RawPacket();
                expect(() => packet.writeAddress(new InetAddress(text, 1, 6))).toThrow('Invalid IPv6');
            }
        });

        it('is the version InetAddress infers from a colon in the text', () => {
            expect(new InetAddress('::1', 1).getVersion()).toBe(6);
            expect(new InetAddress('127.0.0.1', 1).getVersion()).toBe(4);
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
