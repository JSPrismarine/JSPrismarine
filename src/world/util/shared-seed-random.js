const Random = require('./random');

module.exports = class SharedSeedRandom extends Random {
    /** @type {number} */
    #count;
    /**
     * 
     * @param {bigint} seed 
     */
    constructor(seed = Random._seedUniquifier() ^ process.hrtime.bigint()) {
        super(seed);
    }
    
    /**
     * @param {number} bits 
     */
    consumeCount(bits) {
        for (let i = 0; i < bits; ++i) {
            this.next(1);
        }
    }

    /**
     * 
     * @param {number} bits 
     */
    next(bits) {
        ++this.#count;
        return super.next(bits);
    }

    /**
     * 
     * @param {number} x 
     * @param {number} z 
     * @returns {bigint}
     */
    setBaseChunkSeed(x, z) {
        const i = BigInt(x) * 341873128712n + BigInt(z) * 132897987541n;
        this.setSeed(i);

        return i;
    }

    /**
     * 
     * @param {bigint} baseSeed
     * @param {number} x 
     * @param {number} z 
     * @returns {bigint}
     */
    setDecorationSeed(baseSeed, x, z) {
        this.setSeed(baseSeed);
        const i = this.nextLong() | 1n,
            j = this.nextLong() | 1n,
            k = BigInt(x) * i + BigInt(z) * j ^ baseSeed;

        this.setSeed(k);
        return k;
    }

    /**
     * 
     * @param {bigint} baseSeed
     * @param {number} x 
     * @param {number} z 
     * @returns {bigint}
     */
    setLargeFeatureSeed(baseSeed, x, z) {
        this.setSeed(baseSeed);
        const i = this.nextLong(),
            j = this.nextLong(),
            k = BigInt(x) * i ^ BigInt(z) * j ^ baseSeed;

        this.setSeed(k);
        return k;
    }

    /**
     * 
     * @param {bigint} baseSeed
     * @param {number} x 
     * @param {number} z 
     * @param {number} modifier
     * @returns {bigint}
     */
    setLargeFeatureSeedWithSalt(baseSeed, x, z, modifier) {
        const i = BigInt(x) * 341873128712n + BigInt(z) * 132897987541n + baseSeed + BigInt(modifier);
        this.setSeed(i);
        return i;
    }

    /**
     * 
     * @param {number} x
     * @param {number} z
     * @param {bigint} baseSeed 
     * @param {bigint} modifier
     * @returns {Random}
     */
    seedSlimeChunk(x, z, baseSeed, modifier) {
        return new Random(baseSeed + BigInt(x * x * 4987142) + BigInt(x * 5947611) + BigInt(z * z) * 4392871n + BigInt(z * 389711) ^ modifier);
    }
};
