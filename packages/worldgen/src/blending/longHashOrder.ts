/**
 * The order fastutil's `Long2ObjectOpenHashMap.forEach` visits its entries in.
 *
 * Java's blender keeps its per-chunk data in that map and walks it with `forEach`. The walk order
 * decides two things: the order a weighted sum adds its terms in, and which of two biomes at the
 * same distance wins, because the blender keeps the first strictly closer one. Matching Java
 * means replaying the map: the same hash, the same linear probing, the same growth points and the
 * same rehash walk. This module does that for the default constructor, which is the only one the
 * blender uses (16 expected entries, load factor 0.75).
 */

/** fastutil's `HashCommon.INT_PHI` widened to a long, the golden-ratio multiplier `mix` uses. */
const LONG_PHI = -7046029254386353131n;

/** fastutil's `Hash.DEFAULT_LOAD_FACTOR`. */
const LOAD_FACTOR = 0.75;

/** fastutil's `Hash.DEFAULT_INITIAL_SIZE`. */
const DEFAULT_EXPECTED = 16;

/** `HashCommon.mix`, truncated to the low 32 bits the way `(int) mix(key)` is. */
const mixLow = (key: bigint): number => {
    let h = BigInt.asUintN(64, key * LONG_PHI);
    h ^= h >> 32n;
    h ^= h >> 16n;
    return Number(h & 0xffffffffn);
};

const nextPowerOfTwo = (value: number): number => (value <= 1 ? 1 : 2 ** Math.ceil(Math.log2(value)));

/** `HashCommon.arraySize`. */
const arraySize = (expected: number): number => Math.max(2, nextPowerOfTwo(Math.ceil(expected / LOAD_FACTOR)));

/** `HashCommon.maxFill`. */
const maxFill = (n: number): number => Math.min(Math.ceil(n * LOAD_FACTOR), n - 1);

/**
 * Java's `ChunkPos.pack`: x in the low 32 bits and z in the high 32, as a signed long.
 *
 * @param chunkX - The chunk x coordinate.
 * @param chunkZ - The chunk z coordinate.
 */
export const packChunkPos = (chunkX: number, chunkZ: number): bigint =>
    BigInt.asIntN(64, (BigInt(chunkX) & 0xffffffffn) | ((BigInt(chunkZ) & 0xffffffffn) << 32n));

/** One occupied slot of the table. */
interface Entry<V> {
    readonly key: bigint;
    value: V;
}

/**
 * A replay of a default `Long2ObjectOpenHashMap` that remembers values and gives them back in
 * `forEach` order.
 *
 * Java marks an empty slot with key 0 and keeps key 0 itself in an extra slot past the table.
 * This keeps the same layout, with an empty slot as `undefined` rather than as key 0. It does not
 * support removal, because the blender never removes.
 */
export class LongHashOrder<V> {
    private n = arraySize(DEFAULT_EXPECTED);
    private mask = this.n - 1;
    private fill = maxFill(this.n);
    private size = 0;
    /** `n` table slots, then the slot for key 0. */
    private slots: (Entry<V> | undefined)[] = new Array<Entry<V> | undefined>(this.n + 1);

    /** How many entries the map holds. */
    public get length(): number {
        return this.size;
    }

    /**
     * `Long2ObjectOpenHashMap.put`. A key already present keeps its slot and takes the new value.
     *
     * @param key - The long key, such as one {@link packChunkPos} made.
     * @param value - The value to store.
     */
    public put(key: bigint, value: V): void {
        const pos = this.find(key);
        const existing = this.slots[pos];
        if (existing !== undefined) {
            existing.value = value;
            return;
        }

        this.slots[pos] = { key, value };
        if (this.size++ >= this.fill) this.rehash(arraySize(this.size + 1));
    }

    /**
     * `Long2ObjectOpenHashMap.get`.
     *
     * @param key - The long key to look up.
     */
    public get(key: bigint): V | undefined {
        return this.slots[this.find(key)]?.value;
    }

    /** The values in the order `Long2ObjectOpenHashMap.forEach` would hand them over. */
    public ordered(): V[] {
        const ordered: V[] = [];
        const nullKey = this.slots[this.n];
        if (nullKey !== undefined) ordered.push(nullKey.value);
        for (let pos = this.n - 1; pos >= 0; pos--) {
            const entry = this.slots[pos];
            if (entry !== undefined) ordered.push(entry.value);
        }
        return ordered;
    }

    /** The slot holding `key`, or the empty slot it would go in. */
    private find(key: bigint): number {
        if (key === 0n) return this.n;

        let pos = mixLow(key) & this.mask;
        for (;;) {
            const entry = this.slots[pos];
            if (entry === undefined || entry.key === key) return pos;
            pos = (pos + 1) & this.mask;
        }
    }

    /** `Long2ObjectOpenHashMap.rehash`, which walks the old table from its top down. */
    private rehash(newN: number): void {
        const mask = newN - 1;
        const slots = new Array<Entry<V> | undefined>(newN + 1);
        for (let i = this.n - 1; i >= 0; i--) {
            const entry = this.slots[i];
            if (entry === undefined) continue;
            let pos = mixLow(entry.key) & mask;
            while (slots[pos] !== undefined) pos = (pos + 1) & mask;
            slots[pos] = entry;
        }
        slots[newN] = this.slots[this.n];

        this.n = newN;
        this.mask = mask;
        this.fill = maxFill(newN);
        this.slots = slots;
    }
}
