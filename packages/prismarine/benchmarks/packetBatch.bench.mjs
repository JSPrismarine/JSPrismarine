import { deflateRawSync } from 'node:zlib';

import BinaryStream from '@jsprismarine/binaryutils';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { BatchCodec, BATCH_PACKET_ID, CompressionCodec, NetworkPacket } from '@jsprismarine/protocol';

class BytesPacket extends NetworkPacket {
    constructor(payload) {
        super(payload);
        this.setNetId(0x21);
    }

    serializePayload(stream, payload) {
        stream.write(payload);
    }

    deserializePayload(stream) {
        return stream.readRemaining();
    }
}

const samples = [
    { name: 'small', payloadBytes: 24, packetCount: 1, iterations: 10_000 },
    { name: 'typical', payloadBytes: 1200, packetCount: 128, iterations: 500 },
    { name: '640 KiB', payloadBytes: 20_000, packetCount: 32, iterations: 30 }
];
const hooks = {
    unsafe: Buffer.allocUnsafe,
    slow: Buffer.allocUnsafeSlow,
    from: Buffer.from,
    concat: Buffer.concat
};
let checksum = 0;

function measure(label, iterations, encode) {
    for (let warm = 0; warm < Math.min(iterations, 1000); warm++) checksum ^= encode()[0];

    let calls = 0;
    let bytes = 0;
    let tracking = true;
    Buffer.allocUnsafe = (size) => {
        if (tracking) {
            calls++;
            bytes += size;
        }
        return hooks.unsafe(size);
    };
    Buffer.allocUnsafeSlow = (size) => {
        if (tracking) {
            calls++;
            bytes += size;
        }
        return hooks.slow(size);
    };
    Buffer.from = (value, ...args) => {
        if (tracking) {
            calls++;
            bytes += typeof value === 'string' ? Buffer.byteLength(value) : (value.byteLength ?? value.length ?? 0);
        }
        return hooks.from(value, ...args);
    };
    Buffer.concat = (list, totalLength) => {
        if (tracking) {
            calls++;
            bytes += totalLength ?? list.reduce((total, buffer) => total + buffer.byteLength, 0);
        }
        return hooks.concat(list, totalLength);
    };

    const timings = [];
    let outputBytes = 0;
    for (let sample = 0; sample < 5; sample++) {
        const start = process.hrtime.bigint();
        for (let index = 0; index < iterations; index++) {
            const output = encode();
            outputBytes = output.byteLength;
            checksum ^= output[0];
        }
        timings.push(Number(process.hrtime.bigint() - start) / iterations);
    }
    tracking = false;
    Buffer.allocUnsafe = hooks.unsafe;
    Buffer.allocUnsafeSlow = hooks.slow;
    Buffer.from = hooks.from;
    Buffer.concat = hooks.concat;

    timings.sort((a, b) => a - b);
    const totalIterations = iterations * timings.length;
    return (
        `${label.padEnd(33)} ${timings[2].toFixed(1).padStart(9)} ns/op  ` +
        `${(calls / totalIterations).toFixed(1)} tracked Buffer allocations/op, ` +
        `${(bytes / totalIterations).toFixed(0)} requested B/op, ${outputBytes} output B`
    );
}

function legacyJoin(packets) {
    const stream = new BinaryStream();
    for (const packet of packets) {
        stream.writeUnsignedVarInt(packet.byteLength);
        stream.write(packet);
    }
    return stream.getBuffer();
}

function legacyUncompressedBatch(packets) {
    return Buffer.concat([Buffer.from([BATCH_PACKET_ID]), legacyJoin(packets)]);
}

function legacyCompressedBatch(packets) {
    const compressed = deflateRawSync(legacyJoin(packets), { level: 7 });
    return Buffer.concat([Buffer.from([BATCH_PACKET_ID, PacketCompressionAlgorithm.ZLIB]), compressed]);
}

for (const sample of samples) {
    const payload = Buffer.alloc(sample.payloadBytes, 0x5a);
    const packet = new BytesPacket(payload);
    const packets = Array.from({ length: sample.packetCount }, () => packet.encodeTransient());
    const uncompressed = BatchCodec.uncompressed();
    const compressed = BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB, level: 7, threshold: 1 });
    const expectedUncompressed = legacyUncompressedBatch(packets);
    const expectedPackets = legacyJoin(packets);
    const expectedCompressed = legacyCompressedBatch(packets);

    if (!uncompressed.encode(packets).equals(expectedUncompressed)) throw new Error('Uncompressed bytes changed');
    const decoded = compressed.decode(compressed.encode(packets));
    if (decoded.length !== packets.length || decoded.some((bytes, index) => !bytes.equals(packets[index]))) {
        throw new Error('Compressed round trip changed packet order or bytes');
    }
    if (
        !CompressionCodec.decompress(PacketCompressionAlgorithm.ZLIB, expectedCompressed.subarray(2)).equals(
            expectedPackets
        )
    ) {
        throw new Error('Legacy compressed reference did not decode');
    }

    console.log(`\n${sample.name} batch: ${sample.packetCount} packets × ${sample.payloadBytes} payload bytes`);
    const encode = new BytesPacket(payload);
    console.log(
        measure('NetworkPacket.encode (copyOut)', sample.iterations, () => {
            encode.encode();
            return encode.getBuffer();
        })
    );
    console.log(measure('NetworkPacket.encodeTransient', sample.iterations, () => encode.encodeTransient()));
    console.log(measure('legacy uncompressed join + frame', sample.iterations, () => legacyUncompressedBatch(packets)));
    console.log(measure('pre-sized uncompressed batch', sample.iterations, () => uncompressed.encode(packets)));

    const compressedIterations = sample.payloadBytes > 10_000 ? 100 : sample.packetCount > 1 ? 100 : 1000;
    console.log(measure('legacy zlib batch + frame', compressedIterations, () => legacyCompressedBatch(packets)));
    console.log(measure('pre-sized zlib batch', compressedIterations, () => compressed.encode(packets)));
}

console.log(`\nchecksum=${checksum}`);
