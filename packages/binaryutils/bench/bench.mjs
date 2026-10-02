/**
 * Throughput and allocation benchmark for BinaryStream.
 *
 * Run with:   pnpm --filter @jsprismarine/binaryutils run bench
 * (which builds dist first, so this measures the same code consumers get)
 *
 * The headline metric is "packets encoded per 10 ms window", because the workload this library
 * exists for is a game server draining a send queue inside a tick budget. Median throughput is
 * only half the story: the worst window is what actually drops a tick, so it is reported too.
 *
 * Methodology notes, learned the hard way:
 *  - Drivers are interleaved round-robin and rotated per window, so thermal drift and scheduler
 *    noise hit every variant equally.
 *  - Never benchmark two implementations whose source text is identical. V8 keys its compilation
 *    cache by source, and identically-sourced drivers share feedback vectors, which fabricates
 *    differences of up to 1.4x out of nothing.
 *  - GC statistics are collected through PerformanceObserver, whose callbacks are asynchronous.
 *    A fully synchronous benchmark loop never lets them run, so the run is followed by a
 *    macrotask turn before the counters are read.
 */
import { PerformanceObserver } from 'node:perf_hooks';
import { BinaryStream } from '../dist/BinaryStream.es.js';

const BUDGET_NS = 10_000_000n; // 10 ms
const WINDOWS = 40;

// ---------------------------------------------------------------------------- workload fixtures
// A Bedrock-shaped movement packet: varint id, varlong entity id, six little-endian floats,
// a mode byte, a flag, a second varlong and a tick counter.
const PACKETS = [];
for (let i = 0; i < 4096; i++) {
    PACKETS.push({
        id: 19,
        eid: BigInt(1 + (i % 5000)),
        x: (i % 512) * 1.37,
        y: 64 + (i % 100) * 0.5,
        z: (i % 512) * -2.11,
        pitch: (i % 360) - 180,
        yaw: (i % 360) - 180,
        headYaw: (i % 360) - 180,
        mode: i & 3,
        onGround: (i & 1) === 0,
        ridden: BigInt(i % 97),
        tick: i
    });
}

function encode(s, p) {
    s.writeUnsignedVarInt(p.id);
    s.writeUnsignedVarLong(p.eid);
    s.writeFloatLE(p.x);
    s.writeFloatLE(p.y);
    s.writeFloatLE(p.z);
    s.writeFloatLE(p.pitch);
    s.writeFloatLE(p.yaw);
    s.writeFloatLE(p.headYaw);
    s.writeByte(p.mode);
    s.writeBoolean(p.onGround);
    s.writeUnsignedVarLong(p.ridden);
    s.writeUnsignedVarInt(p.tick);
}

// ------------------------------------------------------------------------------------- drivers
const arena = Buffer.allocUnsafeSlow(1 << 20);
const pooled = new BinaryStream(undefined, 0, 4096);

const drivers = {
    'new stream per packet': (n, seed) => {
        let total = 0;
        for (let i = 0; i < n; i++) {
            const s = new BinaryStream();
            encode(s, PACKETS[(seed + i) & 4095]);
            total += s.getWriteBuffer().byteLength;
        }
        return total;
    },
    'new stream, pre-sized': (n, seed) => {
        let total = 0;
        for (let i = 0; i < n; i++) {
            const s = new BinaryStream(undefined, 0, 64);
            encode(s, PACKETS[(seed + i) & 4095]);
            total += s.getWriteBuffer().byteLength;
        }
        return total;
    },
    'reused stream + copyOut': (n, seed) => {
        let total = 0;
        for (let i = 0; i < n; i++) {
            pooled.resetWrite();
            encode(pooled, PACKETS[(seed + i) & 4095]);
            total += pooled.copyOut().byteLength;
        }
        return total;
    },
    'reused stream + arena': (n, seed) => {
        let offset = 0;
        for (let i = 0; i < n; i++) {
            pooled.resetWrite();
            encode(pooled, PACKETS[(seed + i) & 4095]);
            if (offset + 64 > arena.byteLength) offset = 0;
            offset = pooled.copyInto(arena, offset);
        }
        return offset;
    }
};

const NAMES = Object.keys(drivers);
const pct = (a, p) => {
    const s = a.slice().sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

// ----------------------------------------------------------------- correctness gate before timing
{
    const reference = (() => {
        const s = new BinaryStream();
        encode(s, PACKETS[7]);
        return s.getWriteBuffer().toString('hex');
    })();
    const viaArena = (() => {
        pooled.resetWrite();
        encode(pooled, PACKETS[7]);
        return pooled.copyOut().toString('hex');
    })();
    if (reference !== viaArena) {
        console.error('ABORT: drivers do not encode identical bytes.');
        process.exit(1);
    }
}

// --------------------------------------------------------------- 1. packets per 10 ms window
for (let w = 0; w < 6; w++) for (const n of NAMES) drivers[n](20_000, w * 7); // warm every driver

const counts = Object.fromEntries(NAMES.map((n) => [n, []]));
for (let w = 0; w < WINDOWS; w++) {
    const order = NAMES.slice(w % NAMES.length).concat(NAMES.slice(0, w % NAMES.length));
    for (const name of order) {
        const fn = drivers[name];
        let count = 0;
        const start = process.hrtime.bigint();
        // Encode in blocks so the clock is read once per block rather than once per packet.
        while (process.hrtime.bigint() - start < BUDGET_NS) {
            fn(64, count + w * 13);
            count += 64;
        }
        counts[name].push(count);
    }
}

console.log(`\npackets encoded per 10 ms window  (${WINDOWS} windows, drivers interleaved)`);
console.log(
    '  ' +
        'strategy'.padEnd(26) +
        'median'.padStart(9) +
        'p5'.padStart(9) +
        'worst'.padStart(9) +
        'best'.padStart(9) +
        '   vs baseline'
);
const baseline = pct(counts[NAMES[0]], 0.5);
for (const name of NAMES) {
    const c = counts[name];
    const median = pct(c, 0.5);
    console.log(
        '  ' +
            name.padEnd(26) +
            String(median).padStart(9) +
            String(pct(c, 0.05)).padStart(9) +
            String(Math.min(...c)).padStart(9) +
            String(Math.max(...c)).padStart(9) +
            ('   ' + (median / baseline).toFixed(2) + 'x').padStart(14)
    );
}

// ------------------------------------------------------- 2. allocation and GC cost, per 1M packets
const realAllocUnsafe = Buffer.allocUnsafe;
const realAllocSlow = Buffer.allocUnsafeSlow;
let allocCalls = 0;
let allocBytes = 0;
let counting = false;
Buffer.allocUnsafe = function (size, ...rest) {
    if (counting) {
        allocCalls++;
        allocBytes += size;
    }
    return realAllocUnsafe.call(Buffer, size, ...rest);
};
Buffer.allocUnsafeSlow = function (size) {
    if (counting) {
        allocCalls++;
        allocBytes += size;
    }
    return realAllocSlow.call(Buffer, size);
};

let gcEvents = 0;
let gcTotal = 0;
let gcMax = 0;
const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
        gcEvents++;
        gcTotal += entry.duration;
        if (entry.duration > gcMax) gcMax = entry.duration;
    }
});
observer.observe({ entryTypes: ['gc'] });
// PerformanceObserver delivers asynchronously; drain the queue before reading the counters.
const drain = () => new Promise((r) => setImmediate(() => setImmediate(r)));

const N = 1_000_000;
console.log(`\ncost of encoding ${N.toLocaleString()} packets`);
console.log(
    '  ' +
        'strategy'.padEnd(26) +
        'wall(ms)'.padStart(10) +
        'GC events'.padStart(11) +
        'GC total(ms)'.padStart(14) +
        'GC max(ms)'.padStart(12) +
        'allocations'.padStart(14) +
        'MB'.padStart(9)
);
for (const name of NAMES) {
    for (let w = 0; w < 3; w++) drivers[name](50_000, w);
    if (global.gc) {
        global.gc();
        global.gc();
    }
    await drain();
    gcEvents = 0;
    gcTotal = 0;
    gcMax = 0;
    allocCalls = 0;
    allocBytes = 0;
    counting = true;
    const t0 = process.hrtime.bigint();
    drivers[name](N, 0);
    const wall = Number(process.hrtime.bigint() - t0) / 1e6;
    counting = false;
    await drain();
    console.log(
        '  ' +
            name.padEnd(26) +
            wall.toFixed(1).padStart(10) +
            String(gcEvents).padStart(11) +
            gcTotal.toFixed(1).padStart(14) +
            gcMax.toFixed(2).padStart(12) +
            allocCalls.toLocaleString().padStart(14) +
            (allocBytes / 1048576).toFixed(1).padStart(9)
    );
}
observer.disconnect();
Buffer.allocUnsafe = realAllocUnsafe;
Buffer.allocUnsafeSlow = realAllocSlow;

// --------------------------------------------- 3. memory pinned by a retained packet window
console.log('\nmemory pinned by a retained send/resend window (20,000 packets, 1 in 64 kept)');
async function retention(label, make) {
    if (global.gc) {
        global.gc();
        global.gc();
    }
    await drain();
    const before = process.memoryUsage().arrayBuffers;
    const kept = [];
    for (let i = 0; i < 20_000; i++) {
        const b = make(i);
        if ((i & 63) === 0) kept.push(b);
    }
    if (global.gc) {
        global.gc();
        global.gc();
    }
    await drain();
    const pinned = process.memoryUsage().arrayBuffers - before;
    const payload = kept.reduce((a, b) => a + b.byteLength, 0);
    const chunks = new Set(kept.map((b) => b.buffer)).size;
    console.log(
        '  ' +
            label.padEnd(26) +
            `${payload} B of payload pins ${(pinned / 1048576).toFixed(2)} MB ` +
            `across ${chunks} ArrayBuffer(s)  (${Math.max(1, pinned / payload).toFixed(0)}x)`
    );
}
await retention('getWriteBuffer() (view)', (i) => {
    const s = new BinaryStream();
    encode(s, PACKETS[i & 4095]);
    return s.getWriteBuffer();
});
await retention('copyOut() (standalone)', (i) => {
    pooled.resetWrite();
    encode(pooled, PACKETS[i & 4095]);
    return pooled.copyOut();
});

console.log(
    `\nNode ${process.version}, Buffer.poolSize=${Buffer.poolSize} ` +
        `(every allocUnsafe under ${Buffer.poolSize >>> 1} B is a slice of a shared chunk)`
);
if (!global.gc) {
    console.log('Tip: run with --expose-gc for stable GC numbers.');
}
