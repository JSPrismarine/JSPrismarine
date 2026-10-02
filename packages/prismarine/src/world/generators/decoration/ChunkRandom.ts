/**
 * A random number generator tied to one chunk.
 *
 * Decoration has to be reproducible: a chunk must come out the same however many times it
 * is generated and in whatever order its neighbours were. Seeding from the world seed and
 * the chunk's own coordinates gives that for free - no shared state between chunks, so
 * generation order cannot leak into the result.
 *
 * This is xorshift32, which is small, fast and has a long enough period for the few hundred
 * numbers a chunk needs. Nothing here is cryptographic and nothing needs to be.
 */
export class ChunkRandom {
    private state: number;

    public constructor(seed: number, chunkX: number, chunkZ: number, salt = 0) {
        // Mixing the coordinates rather than adding them keeps neighbouring chunks from
        // getting neighbouring seeds, which would make their decoration visibly correlated.
        let mixed = Math.imul(chunkX, 0x1f1f1f1f) ^ Math.imul(chunkZ, 0x27d4eb2d) ^ Math.imul(salt, 0x9e3779b1);
        mixed ^= seed | 0;
        mixed = Math.imul(mixed ^ (mixed >>> 16), 0x2c1b3c6d);
        mixed ^= mixed >>> 15;

        // xorshift stalls forever on zero.
        this.state = mixed === 0 ? 0x9e3779b1 : mixed;
    }

    private next(): number {
        let x = this.state;
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        this.state = x | 0;

        return (this.state >>> 0) / 0x100000000;
    }

    /** A float in [0, 1). */
    public nextFloat(): number {
        return this.next();
    }

    /** An integer in [0, bound). */
    public nextInt(bound: number): number {
        return Math.floor(this.next() * bound);
    }

    /** An integer in [min, max], both included. */
    public nextRange(min: number, max: number): number {
        return min + this.nextInt(max - min + 1);
    }

    /** True with the given probability. */
    public chance(probability: number): boolean {
        return this.next() < probability;
    }

    /** One of the given values. */
    public pick<T>(values: readonly T[]): T {
        return values[this.nextInt(values.length)]!;
    }
}

export default ChunkRandom;
