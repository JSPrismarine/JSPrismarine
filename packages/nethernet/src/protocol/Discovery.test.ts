import { createCipheriv, createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { DiscoveryPacketType, decodeDiscoveryPacket, encodeDiscoveryPacket } from './Discovery';
import type { DiscoveryPacket } from './Discovery';

const packets: DiscoveryPacket[] = [
    { type: DiscoveryPacketType.Request, senderId: 1n },
    {
        type: DiscoveryPacketType.Response,
        senderId: 0xffff_ffff_ffff_ffffn,
        advertisement: Buffer.from([0, 1, 2, 254, 255])
    },
    { type: DiscoveryPacketType.Message, senderId: 2n, recipientId: 3n, data: 'CONNECTREQUEST 9 v=0\r\nö' }
];

describe('LAN discovery packets', () => {
    it('round-trip every type', () => {
        for (const packet of packets)
            expect(decodeDiscoveryPacket(encodeDiscoveryPacket(packet))).toStrictEqual(packet);
    });

    it('carry an HMAC-SHA256 checksum and AES blocks, and refuse a datagram whose checksum does not match', () => {
        const datagram = encodeDiscoveryPacket(packets[0]!);
        // 32 bytes of checksum, then the 20-byte packet padded to two AES blocks.
        expect(datagram.byteLength).toBe(32 + 32);

        const tampered = Buffer.from(datagram);
        tampered[0]! ^= 1;
        expect(() => decodeDiscoveryPacket(tampered)).toThrow('checksum');
        expect(() => decodeDiscoveryPacket(Buffer.alloc(10))).toThrow('too short');
    });

    it('keys both with SHA-256 of the application ID 0xDEADBEEF, and recovers an answer a retail host undercounted', () => {
        const appId = Buffer.alloc(8);
        appId.writeBigUInt64LE(0xdeadbeefn);
        const key = createHash('sha256').update(appId).digest();
        const answer = 'CONNECTRESPONSE 9 v=0\r\na=candidate:1 1 udp 1 192.0.2.1 5000 typ host\r\n';
        const text = Buffer.from(answer);
        // Built by hand as the retail host sends it: both lengths stop 20 bytes short of the answer.
        const plain = Buffer.alloc(2 + 2 + 8 + 8 + 8 + 4 + text.byteLength);
        plain.writeUInt16LE(plain.byteLength - 2 - 20, 0);
        plain.writeUInt16LE(DiscoveryPacketType.Message, 2);
        plain.writeBigUInt64LE(2n, 4);
        plain.writeBigUInt64LE(3n, 20);
        plain.writeUInt32LE(text.byteLength - 20, 28);
        text.copy(plain, 32);
        const cipher = createCipheriv('aes-256-ecb', key, null);
        const datagram = Buffer.concat([
            createHmac('sha256', key).update(plain).digest(),
            cipher.update(plain),
            cipher.final()
        ]);

        expect(decodeDiscoveryPacket(datagram)).toStrictEqual({
            type: DiscoveryPacketType.Message,
            senderId: 2n,
            recipientId: 3n,
            data: answer
        });
    });
});
