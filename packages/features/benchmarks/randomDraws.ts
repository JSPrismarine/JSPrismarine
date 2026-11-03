import { PerformanceObserver } from 'node:perf_hooks';

import { LegacyRandomSource, Xoroshiro128PlusPlus, XoroshiroRandomSource } from '@jsprismarine/worldgen';
import { WorldgenRandom } from '../src/placement/WorldgenRandom';

const MASK_48 = (1n << 48n) - 1n;
const MULTIPLIER = 25214903917n;
const ITERATIONS = 1_000_000;
const PRIME = 16777619;

class BigIntLegacyOracle {
    private seed: bigint;

    public constructor(seed: bigint) {
        this.seed = BigInt.asUintN(48, seed ^ MULTIPLIER);
    }

    public next(bits: number): number {
        this.seed = (this.seed * MULTIPLIER + 11n) & MASK_48;
        return Number(BigInt.asIntN(32, this.seed >> BigInt(48 - bits)));
    }
}

const hash = (current: number, next: number): number => Math.imul(current ^ next, PRIME) >>> 0;
const maybeGc = Reflect.get(globalThis, 'gc');
const forceGc = (): void => {
    if (typeof maybeGc === 'function') maybeGc();
};

let gcEvents = 0;
const observer = new PerformanceObserver((list) => {
    gcEvents += list.getEntries().length;
});
observer.observe({ entryTypes: ['gc'] });

const arm = process.argv[2];
if (!arm) throw new RangeError('Pass an RNG benchmark arm');

forceGc();
await new Promise<void>((resolve) => setImmediate(resolve));
gcEvents = 0;
let checksum = 2166136261;
const started = performance.now();
switch (arm) {
    case 'legacy-bigint': {
        const random = new BigIntLegacyOracle(1234n);
        for (let index = 0; index < ITERATIONS; index++) {
            checksum = hash(checksum, random.next(32));
            checksum = hash(checksum, random.next(31));
            checksum = hash(checksum, random.next(24));
            checksum = hash(checksum, random.next(27));
        }
        break;
    }
    case 'legacy-lanes': {
        const random = new LegacyRandomSource(1234n);
        for (let index = 0; index < ITERATIONS; index++) {
            checksum = hash(checksum, random.next(32));
            checksum = hash(checksum, random.next(31));
            checksum = hash(checksum, random.next(24));
            checksum = hash(checksum, random.next(27));
        }
        break;
    }
    case 'xoroshiro-bigint': {
        const random = new Xoroshiro128PlusPlus(0x123456789abcdef0n, -0x0fedcba987654321n);
        for (let index = 0; index < ITERATIONS; index++) {
            checksum = hash(checksum, Number(BigInt.asIntN(32, random.nextLong() >> 32n)));
            checksum = hash(checksum, Number(BigInt.asUintN(64, random.nextLong()) >> 40n));
            checksum = hash(checksum, Number(BigInt.asUintN(64, random.nextLong()) >> 37n));
        }
        break;
    }
    case 'xoroshiro-lanes': {
        const random = new XoroshiroRandomSource(0x123456789abcdef0n, -0x0fedcba987654321n);
        for (let index = 0; index < ITERATIONS; index++) {
            checksum = hash(checksum, random.nextBits(32));
            checksum = hash(checksum, random.nextBits(24));
            checksum = hash(checksum, random.nextBits(27));
        }
        break;
    }
    case 'worldgen': {
        const random = new WorldgenRandom(1234n);
        for (let index = 0; index < ITERATIONS; index++) {
            checksum = hash(checksum, random.next(32));
            checksum = hash(checksum, random.next(24));
            checksum = hash(checksum, random.next(27));
        }
        break;
    }
    default:
        throw new RangeError(`Unknown RNG benchmark arm: ${arm}`);
}
const milliseconds = performance.now() - started;
await new Promise<void>((resolve) => setImmediate(resolve));
const runtimeGcEvents = gcEvents;
observer.disconnect();

process.stdout.write(
    `${JSON.stringify({
        arm,
        draws: ITERATIONS,
        milliseconds,
        checksum: checksum.toString(16).padStart(8, '0'),
        runtimeGcEvents
    })}\n`
);
