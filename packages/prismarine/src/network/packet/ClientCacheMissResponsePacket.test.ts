import { describe, expect, it } from 'vitest';
import ClientCacheMissResponsePacket from './ClientCacheMissResponsePacket';

const ENCODED = Buffer.concat([
    Buffer.from([0x88, 0x01]), // Header: id 136 as LEB128.
    Buffer.from([0x01]), // Missing Blobs, one entry.
    Buffer.from([0x02, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), // Blob Id as a uint64 LE.
    Buffer.from([0x02, 0xaa, 0xbb]) // Blob Data, two bytes.
]);

describe('ClientCacheMissResponsePacket', () => {
    it('encodes each blob as a uint64 LE hash then a length prefixed payload', () => {
        const packet = Object.assign(new ClientCacheMissResponsePacket(), {
            blobs: [{ blobId: 0x0102n, blobData: Buffer.from([0xaa, 0xbb]) }]
        });
        packet.encode();

        expect(packet.getBuffer()).toEqual(ENCODED);
    });

    it('decodes the blob and consumes the whole buffer', () => {
        const packet = new ClientCacheMissResponsePacket(ENCODED);
        packet.decode();

        expect(packet.blobs).toEqual([{ blobId: 0x0102n, blobData: Buffer.from([0xaa, 0xbb]) }]);
        expect(packet.feof()).toBe(true);
    });

    it('encodes an empty list as a zero count', () => {
        const packet = new ClientCacheMissResponsePacket();
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0x88, 0x01, 0x00]));
    });
});
