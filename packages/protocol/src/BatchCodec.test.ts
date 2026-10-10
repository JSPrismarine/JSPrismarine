import BinaryStream from '@jsprismarine/binaryutils';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { BATCH_PACKET_ID, BatchCodec } from './BatchCodec';
import { CompressionCodec, UNCOMPRESSED_BATCH } from './CompressionCodec';

const zlib = () => BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB });

/** What a peer puts on the wire, built without going through the codec under test. */
const handBuilt = (packets: Buffer[]): Buffer => {
    const stream = new BinaryStream();
    for (const packet of packets) {
        stream.writeUnsignedVarInt(packet.byteLength);
        stream.write(packet);
    }
    return stream.getBuffer();
};

describe('BatchCodec, before compression is negotiated', () => {
    const codec = BatchCodec.uncompressed();

    it('carries no algorithm byte at all', () => {
        // `RequestNetworkSettings` is 0xc1 and travels this way, as does the
        // `NetworkSettings` that answers it. A prefix byte here would be read as part of
        // the first packet's length varint.
        const encoded = codec.encode([Buffer.from([0xc1, 0x01, 0x02])]);

        expect(encoded[0]).toBe(BATCH_PACKET_ID);
        expect(encoded[1]).toBe(3); // the length varint, not an algorithm
        expect(encoded.subarray(2)).toEqual(Buffer.from([0xc1, 0x01, 0x02]));
    });

    it('round-trips', () => {
        const packets = [Buffer.from([0xc1, 0x00]), Buffer.from([0x8f])];
        expect(codec.decode(codec.encode(packets))).toEqual(packets);
    });
});

describe('BatchCodec, once compression is negotiated', () => {
    it('compresses and names the algorithm', () => {
        const payload = Buffer.alloc(512, 0x41);
        const encoded = zlib().encode([payload]);

        expect(encoded[0]).toBe(BATCH_PACKET_ID);
        expect(encoded[1]).toBe(PacketCompressionAlgorithm.ZLIB);
        expect(encoded.byteLength).toBeLessThan(payload.byteLength);
    });

    it('round-trips through the compressed form', () => {
        const packets = [Buffer.alloc(400, 0x01), Buffer.from([0x09, 0xff]), Buffer.alloc(2048, 0x7e)];
        const codec = zlib();

        expect(codec.decode(codec.encode(packets))).toEqual(packets);
    });

    it('reads a batch the peer chose not to compress', () => {
        // A peer may send 0xff at any time, whatever we negotiated - and this is precisely
        // the case that used to surface as "Failed to inflate batched content" a few
        // packets into an otherwise completed login.
        const packets = [Buffer.from([0x09, 0x01, 0x02])];
        const wire = Buffer.concat([Buffer.from([BATCH_PACKET_ID, UNCOMPRESSED_BATCH]), handBuilt(packets)]);

        expect(zlib().decode(wire)).toEqual(packets);
    });

    it('leaves a payload below the threshold uncompressed, and says so', () => {
        const codec = BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB, threshold: 256 });
        const small = Buffer.from([0x09, 0x01]);

        const encoded = codec.encode([small]);
        expect(encoded[1]).toBe(UNCOMPRESSED_BATCH);
        expect(codec.decode(encoded)).toEqual([small]);

        const large = Buffer.alloc(512, 0x41);
        expect(codec.encode([large])[1]).toBe(PacketCompressionAlgorithm.ZLIB);
    });

    it('treats a threshold of zero as "never compress", not as "always"', () => {
        // Mojang's compressionThreshold of 0 disables compression; read as a plain
        // `byteLength >= threshold` it would mean the exact opposite.
        const codec = BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB, threshold: 0 });
        const encoded = codec.encode([Buffer.alloc(4096, 0x41)]);

        expect(encoded[1]).toBe(UNCOMPRESSED_BATCH);
        expect(encoded.byteLength).toBeGreaterThan(4096);
    });

    it('agrees with the async path byte for byte', async () => {
        const packets = [Buffer.alloc(3_000, 0x33), Buffer.from([0x0b])];
        const codec = zlib();

        expect(await codec.encodeAsync(packets)).toEqual(codec.encode(packets));
        expect(await codec.decodeAsync(codec.encode(packets))).toEqual(packets);
    });
});

describe('BatchCodec, malformed input', () => {
    const codec = zlib();

    const wire = (payload: Buffer) => Buffer.concat([Buffer.from([BATCH_PACKET_ID, UNCOMPRESSED_BATCH]), payload]);

    it('yields nothing for an empty batch instead of throwing', () => {
        // The `do/while` this replaced always ran once, so an empty payload made it read a
        // varint out of a zero length buffer.
        expect(codec.decode(wire(Buffer.alloc(0)))).toEqual([]);
        expect(BatchCodec.uncompressed().decode(Buffer.from([BATCH_PACKET_ID]))).toEqual([]);
    });

    it('rejects a packet claiming more bytes than are left', () => {
        expect(() => codec.decode(wire(Buffer.from([0x40, 0x01, 0x02])))).toThrow(/declares 64 bytes, 2 remain/);
    });

    it('rejects a zero length packet', () => {
        expect(() => codec.decode(wire(Buffer.from([0x00])))).toThrow(/zero length packet at offset 0/);
    });

    it('rejects a varint that runs off the end', () => {
        expect(() => codec.decode(wire(Buffer.from([0xff, 0xff])))).toThrow(/runs past the end/);
    });

    it('rejects an over-long varint encoding', () => {
        expect(() => codec.decode(wire(Buffer.from([0xff, 0xff, 0xff, 0xff, 0x7f])))).toThrow(/overflows 32 bits/);
    });

    it('rejects a buffer that is not a batch', () => {
        expect(() => codec.decode(Buffer.from([0x09, 0x01]))).toThrow(/Not a batch/);
    });

    it('rejects a batch truncated before its algorithm byte', () => {
        expect(() => codec.decode(Buffer.from([BATCH_PACKET_ID]))).toThrow(/algorithm byte is missing/);
    });

    it('refuses to inflate a payload past the ceiling', () => {
        // A zip bomb: 4 MiB of zeroes deflates to almost nothing, and both a client and a
        // server read compressed bytes from a peer they have not authenticated.
        const bomb = Buffer.concat([
            Buffer.from([BATCH_PACKET_ID, PacketCompressionAlgorithm.ZLIB]),
            deflateRawSync(Buffer.alloc(4 * 1024 * 1024))
        ]);
        const guarded = BatchCodec.compressed({
            algorithm: PacketCompressionAlgorithm.ZLIB,
            maxDecompressedLength: 64 * 1024
        });

        expect(() => guarded.decode(bomb)).toThrow();
    });
});

describe('CompressionCodec prefix widths', () => {
    it('maps between the byte form and the negotiated form', () => {
        // NetworkSettings negotiates in a two byte field where none is 0xffff; each batch
        // repeats it in one byte where none is 0xff.
        expect(CompressionCodec.fromPrefix(UNCOMPRESSED_BATCH)).toBe(PacketCompressionAlgorithm.NONE);
        expect(CompressionCodec.fromPrefix(PacketCompressionAlgorithm.ZLIB)).toBe(PacketCompressionAlgorithm.ZLIB);
        expect(CompressionCodec.toPrefix(PacketCompressionAlgorithm.NONE)).toBe(UNCOMPRESSED_BATCH);
        expect(CompressionCodec.toPrefix(PacketCompressionAlgorithm.ZLIB)).toBe(PacketCompressionAlgorithm.ZLIB);
    });

    it('reports snappy as unimplemented rather than producing wrong bytes', () => {
        const snappy = new CompressionCodec({ algorithm: PacketCompressionAlgorithm.SNAPPY });

        expect(() => snappy.compress(Buffer.alloc(64))).toThrow(/Snappy/);
        expect(() => CompressionCodec.decompress(PacketCompressionAlgorithm.SNAPPY, Buffer.alloc(4))).toThrow(/Snappy/);
    });
});
