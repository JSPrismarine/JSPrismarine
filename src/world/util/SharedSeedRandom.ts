import Random from './Random';

export default class SharedSeedRandom extends Random {
    public constructor(
        seed: bigint | number = Random._seedUniquifier() ^
            process.hrtime.bigint()
    ) {
        super(seed);
    }

    public consumeCount(bits: number) {
        for (let i = 0; i < bits; ++i) {
            this.next(1);
        }
    }

    public next(bits: number) {
        return super.next(bits);
    }

    public setBaseChunkSeed(x: number, z: number): bigint {
        const i = BigInt(x) * 341873128712n + BigInt(z) * 132897987541n;
        this.setSeed(i);

        return i;
    }

    public setDecorationSeed(baseSeed: bigint, x: number, z: number): bigint {
        this.setSeed(baseSeed);
        const i = this.nextLong() | 1n;
        const j = this.nextLong() | 1n;
        const k = (BigInt(x) * i + BigInt(z) * j) ^ baseSeed;

        this.setSeed(k);
        return k;
    }

    public setLargeFeatureSeed(baseSeed: bigint, x: number, z: number): bigint {
        this.setSeed(baseSeed);
        const i = this.nextLong();
        const j = this.nextLong();
        const k = (BigInt(x) * i) ^ (BigInt(z) * j) ^ baseSeed;

        this.setSeed(k);
        return k;
    }

    public setLargeFeatureSeedWithSalt(
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

    public seedSlimeChunk(
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
