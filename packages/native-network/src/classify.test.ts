import { describe, expect, it } from 'vitest';

import {
    ACK,
    Frame,
    FrameReliability,
    FrameSet,
    InetAddress,
    NACK,
    OpenConnectionRequest1,
    OpenConnectionRequest2,
    UnconnectedPing
} from '@jsprismarine/raknet';

import { DatagramClass, classify } from './classify';
import { loadNative, nativeLibraryAvailable } from './testing/native.test.helper';

const MAGIC = Buffer.from('00ffff00fefefefefdfdfdfd12345678', 'hex');
const COOKIE = Buffer.from('2112a442', 'hex');

/** A STUN message of a type with attributes of the given total length, RFC 8489 section 5. */
const stun = (type: number, attributeBytes: number): Buffer => {
    const message = Buffer.alloc(20 + attributeBytes);
    message.writeUInt16BE(type, 0);
    message.writeUInt16BE(attributeBytes, 2);
    COOKIE.copy(message, 4);
    message.fill(0xab, 8, 20);
    return message;
};

/** A DTLS 1.2 record header and a body, RFC 6347 section 4.1. */
const dtls = (contentType: number): Buffer => {
    const record = Buffer.alloc(13 + 16, 0x5a);
    record[0] = contentType;
    record.writeUInt16BE(0xfefd, 1);
    record.writeUInt16BE(16, 11);
    return record;
};

const ping = (): Buffer => {
    const packet = new UnconnectedPing();
    packet.timestamp = 123_456n;
    packet.clientGUID = 42n;
    packet.encode();
    return packet.getBuffer();
};

describe.skipIf(!nativeLibraryAvailable())('the shared port classifier', async () => {
    const network = await loadNative();
    const classOf = (datagram: Uint8Array) => classify(network, datagram);

    it('sends RakNet encodings to RakNet', () => {
        const request1 = new OpenConnectionRequest1();
        request1.protocol = 11;
        request1.mtuSize = 1400;
        request1.encode();
        const request2 = new OpenConnectionRequest2();
        request2.serverAddress = new InetAddress('127.0.0.1', 19132, 4);
        request2.mtuSize = 1400;
        request2.clientGUID = 42n;
        request2.encode();
        const frame = new Frame();
        frame.reliability = FrameReliability.RELIABLE_ORDERED;
        frame.orderChannel = 0;
        frame.reliableIndex = 0;
        frame.orderIndex = 0;
        frame.content = Buffer.from([0xfe, 1, 2, 3]);
        const frameSet = new FrameSet();
        frameSet.sequenceNumber = 7;
        frameSet.frames = [frame];
        frameSet.encode();
        const ack = new ACK();
        ack.sequenceNumbers = [1, 2, 3];
        ack.encode();
        const nack = new NACK();
        nack.sequenceNumbers = [4];
        nack.encode();
        const query = Buffer.from([0xfe, 0xfd, 0x09, 0, 0, 0, 1]);

        expect(classOf(ping())).toBe(DatagramClass.raknetOffline);
        expect(classOf(request1.getBuffer())).toBe(DatagramClass.raknetOffline);
        expect(classOf(request2.getBuffer())).toBe(DatagramClass.raknetOffline);
        expect(classOf(frameSet.getBuffer())).toBe(DatagramClass.raknet);
        expect(classOf(ack.getBuffer())).toBe(DatagramClass.raknet);
        expect(classOf(nack.getBuffer())).toBe(DatagramClass.raknet);
        expect(classOf(query)).toBe(DatagramClass.raknet);
    });

    it('sends STUN and DTLS to libjuice', () => {
        expect(classOf(stun(0x0001, 48))).toBe(DatagramClass.stun); // Binding request
        expect(classOf(stun(0x0101, 32))).toBe(DatagramClass.stun); // success response
        expect(classOf(stun(0x0111, 12))).toBe(DatagramClass.stun); // error response
        expect(classOf(stun(0x0011, 0))).toBe(DatagramClass.stun); // indication
        for (const type of [20, 21, 22, 23]) expect(classOf(dtls(type))).toBe(DatagramClass.dtls);
    });

    it('keeps a ping that carries STUN’s cookie and a valid length with RakNet', () => {
        const datagram = ping();
        // Bytes 4 to 7 of the timestamp spell the cookie, and bytes 2 and 3 a STUN length.
        COOKIE.copy(datagram, 4);
        datagram.writeUInt16BE(datagram.byteLength - 20, 2);
        expect(datagram.byteLength % 4).toBe(1);
        const aligned = Buffer.concat([datagram, Buffer.alloc(3)]);
        aligned.writeUInt16BE(aligned.byteLength - 20, 2);

        expect(classOf(datagram)).toBe(DatagramClass.raknetOffline);
        expect(classOf(aligned)).toBe(DatagramClass.raknetOffline);
    });

    it('gives every first byte exactly the class ADR 0008’s table gives it', () => {
        const plain = (first: number) => Buffer.concat([Buffer.from([first]), Buffer.alloc(31)]);
        const withPingMagic = (first: number) =>
            Buffer.concat([Buffer.from([first]), Buffer.alloc(8), MAGIC, Buffer.alloc(8)]);
        const withRequestMagic = (first: number) => Buffer.concat([Buffer.from([first]), MAGIC, Buffer.alloc(15)]);
        const withCookie = (first: number) => {
            const message = stun(0x0001, 12);
            message[0] = first;
            return message;
        };

        const expected = (first: number, form: 'plain' | 'ping' | 'request' | 'cookie'): number => {
            if (first >= 0x80) return DatagramClass.raknet;
            if (form === 'ping' && (first === 0x01 || first === 0x02)) return DatagramClass.raknetOffline;
            if (form === 'request' && (first === 0x05 || first === 0x07)) return DatagramClass.raknetOffline;
            if (form === 'cookie' && first <= 0x03) return DatagramClass.stun;
            if (first >= 20 && first <= 63) return DatagramClass.dtls;
            return DatagramClass.unsure;
        };

        const counts = new Map<number, number>();
        for (let first = 0; first < 256; first++) {
            for (const [form, build] of [
                ['plain', plain],
                ['ping', withPingMagic],
                ['request', withRequestMagic],
                ['cookie', withCookie]
            ] as const) {
                const cls = classOf(build(first));
                expect(cls, `first byte ${first}, ${form}`).toBe(expected(first, form));
                if (form === 'plain') counts.set(cls, (counts.get(cls) ?? 0) + 1);
            }
        }
        // With no magic and no cookie: 128 RakNet, 44 DTLS, and the other 84 unsure.
        expect(Object.fromEntries(counts)).toStrictEqual({
            [DatagramClass.raknet]: 128,
            [DatagramClass.dtls]: 44,
            [DatagramClass.unsure]: 84
        });
    });

    it('calls an empty datagram unsure', () => {
        expect(classOf(Buffer.alloc(0))).toBe(DatagramClass.unsure);
    });
});
