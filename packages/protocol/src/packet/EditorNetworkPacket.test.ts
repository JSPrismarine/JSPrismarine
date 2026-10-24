import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import EditorNetworkPacket from './EditorNetworkPacket';

import type { EditorNetwork } from './EditorNetworkPacket';

const DATA: EditorNetwork = {
    routeToManager: true,
    rawVariantName: 'EditorNetworkPayload',
    rawVariantData: '{}'
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xbe, 0x01], // packet id 190 as a varuint32 header
    0x01, // Route To Manager
    ...[0x14, ...Buffer.from('EditorNetworkPayload', 'utf8')], // Raw Variant Name, 20 bytes
    ...[0x02, 0x7b, 0x7d] // Raw Variant Data "{}"
]);

describe('EditorNetworkPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new EditorNetworkPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new EditorNetworkPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('writes an unrouted packet with empty strings as three bytes after the header', () => {
        const buffer = new EditorNetworkPacket({
            routeToManager: false,
            rawVariantName: '',
            rawVariantData: ''
        }).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([0xbe, 0x01, 0x00, 0x00, 0x00]);
    });
});
