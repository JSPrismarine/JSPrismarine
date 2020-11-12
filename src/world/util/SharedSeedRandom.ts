import Random from './Random';

export default class SharedSeedRandom extends Random {
    private count: number = 0;

    constructor(
        seed: bigint | number = Random._seedUniquifier() ^
            process.hrtime.bigint()
    ) {
        super(seed);
    }

    consumeCount(bits: number) {
        for (let i = 0; i < bits; ++i) {
            this.next(1);
        }
    }

    next(bits: number) {
        ++this.count;
        return super.next(bits);
    }

    setBaseChunkSeed(x: number, z: number): bigint {
        const i = BigInt(x) * 341873128712n + BigInt(z) * 132897987541n;
        this.setSeed(i);

        return i;
    }

    setDecorationSeed(baseSeed: bigint, x: number, z: number): bigint {
        this.setSeed(baseSeed);
        const i = this.nextLong() | 1n,
            j = this.nextLong() | 1n,
            k = (BigInt(x) * i + BigInt(z) * j) ^ baseSeed;

        this.setSeed(k);
        return k;
    }

    setLargeFeatureSeed(baseSeed: bigint, x: number, z: number): bigint {
        this.setSeed(baseSeed);
        const i = this.nextLong(),
            j = this.nextLong(),
            k = (BigInt(x) * i) ^ (BigInt(z) * j) ^ baseSeed;

        this.setSeed(k);
        return k;
    }

    setLargeFeatureSeedWithSalt(
        baseSeed: bigint,
        x: number,
        z: number,
        modifier: number
    ): bigint {
        const i =
            BigInt(x) * 341873128712n +
            BigInt(z) * 132897987541n +
            baseSeed +
            BigInt(modifier);
        this.setSeed(i);
        return i;
    }

    seedSlimeChunk(
        x: number,
        z: number,
        baseSeed: bigint,
        modifier: bigint
    ): Random {
        return new Random(
            (baseSeed +
                BigInt(x * x * 4987142) +
                BigInt(x * 5947611) +
                BigInt(z * z) * 4392871n +
                BigInt(z * 389711)) ^
                modifier
        );
    }
}
