const SERVER_GUID = 0xfedc_ba98_7654_3210n;
const ITERATIONS = 250_000;
const PONG_ID = 0x1c;
const MAGIC = Buffer.from([
    0x00, 0xff, 0xff, 0x00, 0xfe, 0xfe, 0xfe, 0xfe, 0xfd, 0xfd, 0xfd, 0xfd, 0x12, 0x34, 0x56, 0x78
]);
const SERVER_NAME =
    'MCPE;JSPrismarine LAN server;2225;1.26.60;0;20;18364758544493064720;JSRakNet;Survival;1;19132;19132;0;0;';
const SERVER_NAME_BYTES = Buffer.byteLength(SERVER_NAME, 'utf8');
const TIMESTAMP = 1234n;

// Models Packet's current BinaryStream capacity and string-copy path for a fresh pong.
function encodeFreshResponse() {
    const stream = Buffer.allocUnsafe(256);
    let offset = 0;
    stream[offset++] = PONG_ID;
    offset = stream.writeBigUInt64BE(TIMESTAMP, offset);
    offset = stream.writeBigUInt64BE(SERVER_GUID, offset);
    MAGIC.copy(stream, offset);
    offset += MAGIC.byteLength;
    const name = Buffer.from(SERVER_NAME, 'utf8');
    offset = stream.writeUInt16BE(name.byteLength, offset);
    name.copy(stream, offset);
    offset += name.byteLength;
    return stream.subarray(0, offset);
}

// Mirrors OfflineHandler's cached suffix and fresh per-ping timestamped output buffer.
const cachedTail = Buffer.allocUnsafe(8 + MAGIC.byteLength + 2 + SERVER_NAME_BYTES);
let tailOffset = cachedTail.writeBigUInt64BE(SERVER_GUID, 0);
MAGIC.copy(cachedTail, tailOffset);
tailOffset += MAGIC.byteLength;
tailOffset = cachedTail.writeUInt16BE(SERVER_NAME_BYTES, tailOffset);
tailOffset += cachedTail.write(SERVER_NAME, tailOffset, SERVER_NAME_BYTES, 'utf8');

function encodeCachedResponse() {
    const response = Buffer.allocUnsafe(9 + cachedTail.byteLength);
    response[0] = PONG_ID;
    response.writeBigUInt64BE(TIMESTAMP, 1);
    cachedTail.copy(response, 9);
    return response;
}

const freshBytes = encodeFreshResponse();
const cachedBytes = encodeCachedResponse();
if (!freshBytes.equals(cachedBytes)) throw new Error('Fresh and cached pong encoders emitted different bytes');

function measure(label, encode) {
    for (let warm = 0; warm < 20_000; warm++) encode();
    const originalAllocUnsafe = Buffer.allocUnsafe;
    const originalFrom = Buffer.from;
    let unsafeCalls = 0;
    let unsafeBytes = 0;
    let fromCalls = 0;
    let fromBytes = 0;
    let tracking = true;
    Buffer.allocUnsafe = function (size) {
        if (tracking) {
            unsafeCalls++;
            unsafeBytes += size;
        }
        return originalAllocUnsafe(size);
    };
    Buffer.from = function (value, ...args) {
        if (tracking) {
            fromCalls++;
            fromBytes += typeof value === 'string' ? Buffer.byteLength(value) : value.byteLength;
        }
        return originalFrom(value, ...args);
    };

    const samples = [];
    for (let sample = 0; sample < 5; sample++) {
        const start = process.hrtime.bigint();
        for (let i = 0; i < ITERATIONS; i++) encode();
        samples.push(Number(process.hrtime.bigint() - start) / ITERATIONS);
    }
    tracking = false;
    Buffer.allocUnsafe = originalAllocUnsafe;
    Buffer.from = originalFrom;
    samples.sort((a, b) => a - b);
    console.log(
        `  ${label.padEnd(20)} ${samples[2].toFixed(1).padStart(8)} ns/response  ` +
            `${(unsafeCalls / (ITERATIONS * 5)).toFixed(1)} allocUnsafe + ` +
            `${(fromCalls / (ITERATIONS * 5)).toFixed(1)} Buffer.from, ` +
            `${((unsafeBytes + fromBytes) / (ITERATIONS * 5)).toFixed(0)} requested bytes/response`
    );
}

console.log(`Offline pong encode microbenchmark (${ITERATIONS.toLocaleString()} responses per sample, median of 5)`);
console.log(`Wire bytes: ${freshBytes.byteLength}; server name bytes: ${SERVER_NAME_BYTES}`);
measure('fresh packet + string copy', encodeFreshResponse);
measure('cached tail + fresh header', encodeCachedResponse);
