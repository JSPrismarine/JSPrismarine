import { BinaryStream } from '../dist/BinaryStream.js';

const ITERATIONS = 500_000;
const stream = new BinaryStream(undefined, 0, 1024);
const cases = [
    ['unsigned below 32-bit boundary', 'unsigned', 0xffff_fffen],
    ['unsigned at 32-bit boundary', 'unsigned', 0xffff_ffffn],
    ['unsigned above 32-bit boundary', 'unsigned', 0x1_0000_0000n],
    ['signed below zigzag boundary', 'signed', 0x7fff_ffffn],
    ['signed at zigzag boundary', 'signed', -0x8000_0000n],
    ['signed above zigzag boundary', 'signed', 0x8000_0000n]
];

function encode(stream, kind, value) {
    if (kind === 'unsigned') stream.writeUnsignedVarLong(value);
    else stream.writeVarLong(value);
}

function measure(label, write) {
    for (let warm = 0; warm < 2; warm++) {
        for (let i = 0; i < ITERATIONS / 10; i++) {
            stream.resetWrite();
            write();
        }
    }

    const samples = [];
    for (let sample = 0; sample < 5; sample++) {
        const start = process.hrtime.bigint();
        for (let i = 0; i < ITERATIONS; i++) {
            stream.resetWrite();
            write();
        }
        samples.push(Number(process.hrtime.bigint() - start) / ITERATIONS);
    }
    samples.sort((a, b) => a - b);
    console.log(`  ${label.padEnd(38)} ${samples[2].toFixed(1).padStart(8)} ns/write`);
}

console.log(`VarLong writes (${ITERATIONS.toLocaleString()} operations per sample, median of 5)`);
for (const [label, kind, value] of cases) {
    stream.resetWrite();
    encode(stream, kind, value);
    const roundTrip = new BinaryStream(stream.getWriteBuffer());
    const decoded = kind === 'unsigned' ? roundTrip.readUnsignedVarLong() : roundTrip.readVarLong();
    if (decoded !== value) throw new Error(`${label} round-trip mismatch: ${decoded} !== ${value}`);

    measure(label, () => encode(stream, kind, value));
}

const strings = [
    ['ASCII', 'Bedrock runtime entity identifier'],
    ['multibyte UTF-8', '§eJSPrismarine — 雪😀'.repeat(4)]
];

function writePreviousStringPath(value) {
    const bytes = Buffer.from(value, 'utf8');
    stream.writeUnsignedVarInt(bytes.byteLength);
    stream.write(bytes);
}

function writeDirectStringPath(value) {
    stream.writeUnsignedVarInt(Buffer.byteLength(value, 'utf8'));
    stream.writeUTF8String(value);
}

console.log(`\nUTF-8 string writes (${ITERATIONS.toLocaleString()} operations per sample, median of 5)`);
for (const [label, value] of strings) {
    stream.resetWrite();
    writePreviousStringPath(value);
    const previousBytes = stream.getWriteBuffer().toString('hex');
    stream.resetWrite();
    writeDirectStringPath(value);
    if (stream.getWriteBuffer().toString('hex') !== previousBytes) {
        throw new Error(`${label} string path emitted different bytes`);
    }

    measure(`${label} (Buffer.from + copy)`, () => writePreviousStringPath(value));
    measure(`${label} (write directly)`, () => writeDirectStringPath(value));
}
