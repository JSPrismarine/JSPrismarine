import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ToastRequestPacket from './ToastRequestPacket';

import type { ToastRequest } from './ToastRequestPacket';

const DATA: ToastRequest = {
    title: 'Hello',
    content: 'World!'
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xba, 0x01], // packet id 186 as a varuint32 header
    ...[0x05, ...Buffer.from('Hello', 'utf8')], // Title
    ...[0x06, ...Buffer.from('World!', 'utf8')] // Content
]);

describe('ToastRequestPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new ToastRequestPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new ToastRequestPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('writes empty strings as two zero-length prefixes', () => {
        const buffer = new ToastRequestPacket({ title: '', content: '' }).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([0xba, 0x01, 0x00, 0x00]);
    });
});
