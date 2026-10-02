import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTWriter } from '@jsprismarine/nbt';

import type { BlockState, BlockStateValue } from './BlockState';
import { BlockStateSchemas } from './BlockStateSchema';

const FNV1_32_INIT = 0x811c9dc5;
const FNV1_PRIME_32 = 0x01000193;

/** The id vanilla reserves for a state it cannot resolve. */
export const UNKNOWN_RUNTIME_ID = -2;
export const UNKNOWN_BLOCK_NAME = 'minecraft:unknown';

/**
 * FNV-1a, 32 bit. Kept separate from the NBT work so it can be checked against the
 * published test vectors for the algorithm.
 * @see http://www.isthe.com/chongo/tech/comp/fnv/
 */
export const fnv1a32 = (data: Buffer): number => {
    let hash = FNV1_32_INIT;
    for (const byte of data) {
        hash ^= byte;
        // Multiplication in 32 bit arithmetic; Math.imul avoids the precision loss of `*`.
        hash = Math.imul(hash, FNV1_PRIME_32);
    }

    return hash | 0;
};

/**
 * Turns a block state into the number that travels in chunk palettes.
 *
 * The id is the FNV-1a hash of the block's own `{name, states}` compound, serialised as
 * little endian NBT. That choice is what `StartGamePacket` announces with
 * `block_network_ids_are_hashes`, and it is what keeps blocks modular: an id depends on
 * nothing but the block itself, so a plugin can add blocks without renumbering anyone
 * else's, and the server never needs a copy of the client's internal palette ordering.
 *
 * The alternative the protocol allows - the id being a position in the client's canonical
 * list - would mean shipping and maintaining that exact ordered list for every client
 * version, and would make every plugin block shift the ids of vanilla ones.
 * @see https://gist.github.com/Alemiz112/504d0f79feac7ef57eda174b668dd345
 */
export class BlockRuntimeIds {
    private static readonly cache = new Map<string, number>();
    private static reverseIndex: Map<number, BlockState> | null = null;
    private static indexedRevision = -1;
    private static readonly namedCache = new Map<string, number>();
    private static namedRevision = -1;

    /** Keyed by name and properties together - see {@link tryGetByState}. */
    private static readonly statedCache = new Map<string, number | null>();
    private static statedRevision = -1;

    /**
     * The little endian NBT bytes a state hashes to. Exposed because it is also exactly
     * what `StartGamePacket` sends for a plugin's custom blocks.
     */
    public static serialize(state: BlockState): Buffer {
        const schema = BlockStateSchemas.get(state.name);
        if (!schema) {
            throw new Error(`No block state schema registered for ${state.name}`);
        }

        const stream = new BinaryStream();
        const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
        // Fixed width, not varints: the network encoding used elsewhere would produce
        // different bytes and therefore a different hash.
        writer.setUseVarint(false);
        writer.writeCompound(state.toNBT(schema.getPropertyTypes()));

        return stream.getBuffer();
    }

    /**
     * The id of a block in its default state, for the many callers that only know a name.
     * Replaces the old name-keyed mapping, which had no way to say *which* oak log it meant.
     */
    public static getByName(name: string): number {
        // Memoised because world generation calls this per block placed - around 18000
        // times per chunk - and `getDefaultState` builds a fresh BlockState every time.
        if (this.namedRevision !== BlockStateSchemas.revision) {
            this.namedCache.clear();
            this.namedRevision = BlockStateSchemas.revision;
        }

        const cached = this.namedCache.get(name);
        if (cached !== undefined) return cached;

        const schema = BlockStateSchemas.get(name);
        if (!schema) {
            throw new Error(`No block state schema registered for ${name}`);
        }

        const runtimeId = this.get(schema.getDefaultState());
        this.namedCache.set(name, runtimeId);
        return runtimeId;
    }

    /**
     * The same as {@link getByName}, but `null` rather than a throw for a name that is not a
     * block.
     *
     * Items are why this exists. `minecraft:stick` has no block state and never will, so
     * asking what block it places is an ordinary question with an ordinary answer - not an
     * error, and certainly not one that should cost the packet it was being written into.
     */
    public static tryGetByName(name: string): number | null {
        return BlockStateSchemas.get(name) ? this.getByName(name) : null;
    }

    /**
     * The id of a block in a particular state, or null if this server has no such block or state.
     *
     * The default state is enough for most callers, and {@link getByName} serves them. It is not
     * enough for anything that builds or simulates: a roof is stairs facing four ways, a door is
     * two halves that must agree, and flowing water is the same block at eight different depths.
     * Those are one name with different properties, which a name alone cannot distinguish.
     *
     * Memoised, because the callers are world generation and block physics - both of which resolve
     * the same handful of states thousands of times - and building the state object is most of the
     * cost of asking.
     * @param {string} name - The block's namespace id.
     * @param {Record<string, BlockStateValue>} [states] - Properties to set; the rest take defaults.
     * @returns {number | null} The runtime id, or null rather than a throw: a caller that cannot
     * find a block should lose that detail, not take world generation or the tick down with it.
     */
    public static tryGetByState(name: string, states?: Readonly<Record<string, BlockStateValue>>): number | null {
        if (this.statedRevision !== BlockStateSchemas.revision) {
            this.statedCache.clear();
            this.statedRevision = BlockStateSchemas.revision;
        }

        const key = states ? `${name}${JSON.stringify(states)}` : name;
        const cached = this.statedCache.get(key);
        if (cached !== undefined) return cached;

        let runtimeId: number | null = null;
        try {
            const schema = BlockStateSchemas.get(name);
            if (schema) runtimeId = this.get(states ? schema.createState({ ...states }) : schema.getDefaultState());
        } catch {
            // A property this server's catalogue does not accept; left null.
        }

        this.statedCache.set(key, runtimeId);
        return runtimeId;
    }

    /**
     * The state an id came from, for reading a chunk back.
     *
     * A hash cannot be inverted, so this indexes every state the catalogue can produce and
     * looks the id up. Building it costs a pass over ~14k states, so it is deferred until
     * something actually reads a block, and rebuilt when a plugin changes the catalogue.
     */
    public static getState(runtimeId: number): BlockState | null {
        if (this.reverseIndex === null || this.indexedRevision !== BlockStateSchemas.revision) {
            this.reverseIndex = new Map();
            this.indexedRevision = BlockStateSchemas.revision;

            for (const name of BlockStateSchemas.names()) {
                for (const state of BlockStateSchemas.get(name)!.getAllStates()) {
                    this.reverseIndex.set(this.get(state), state);
                }
            }
        }

        return this.reverseIndex.get(runtimeId) ?? null;
    }

    public static get(state: BlockState): number {
        if (state.name === UNKNOWN_BLOCK_NAME) return UNKNOWN_RUNTIME_ID;

        const key = state.toString();
        const cached = this.cache.get(key);
        if (cached !== undefined) return cached;

        const runtimeId = fnv1a32(this.serialize(state));
        this.cache.set(key, runtimeId);
        return runtimeId;
    }

    /** Drops memoised ids. Needed after a plugin changes a schema, and by tests. */
    public static reset(): void {
        this.cache.clear();
        this.namedCache.clear();
        this.namedRevision = -1;
        this.statedCache.clear();
        this.statedRevision = -1;
        this.reverseIndex = null;
        this.indexedRevision = -1;
    }
}

export default BlockRuntimeIds;
