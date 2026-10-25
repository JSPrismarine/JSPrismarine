/**
 * Block runtime ids, and the check that keeps a generated block registry
 * from desynchronizing a client.
 *
 * `StartGamePacket.BlockNetworkIds Are Hashes` is true on this server, which
 * means a block state's runtime id is the FNV-1a 32 hash of its own
 * `{name, states}` compound and nothing else. That is the scheme that makes
 * a data-driven block registry possible: neither side needs the other's
 * ordering, and adding a block renumbers nothing. The alternative, an index
 * into a palette both sides sort by the FNV-1 64 hash of the block name,
 * renumbers every vanilla block the moment a pack adds one.
 *
 * The price is that the two sides have to agree byte for byte on what they
 * hash. {@link verifyBlockRuntimeIds} checks the hash against the ids a real
 * server put in the creative catalog, and {@link assertBlockPaletteAgrees}
 * checks that a generated `Block Properties` list declares the states the
 * captured palette has, so a mismatch fails a build rather than a session.
 */
import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTTagCompound, NBTWriter, Types } from '@jsprismarine/nbt';
import type { BlockProperty } from '@jsprismarine/protocol';

import type { NbtValue } from './nbt';
import { nbtByte, nbtCompound, nbtInt, nbtString, readNetworkNbt } from './nbt';

import type { BlockPalette, BlockStateValue } from '@jsprismarine/blocks';

const FNV1_32_OFFSET_BASIS = 0x811c9dc5;
const FNV1_32_PRIME = 0x01000193;

/**
 * FNV-1a, 32 bit, as a signed integer.
 *
 * @see http://www.isthe.com/chongo/tech/comp/fnv/
 */
export const fnv1a32 = (data: Buffer): number => {
    let hash = FNV1_32_OFFSET_BASIS;
    for (const byte of data) {
        hash ^= byte;
        // 32 bit multiplication; `*` would lose precision above 2^53.
        hash = Math.imul(hash, FNV1_32_PRIME);
    }

    return hash | 0;
};

/** The id vanilla reserves for a state it cannot resolve. */
export const UNKNOWN_RUNTIME_ID = -2;

/** The name whose every state is {@link UNKNOWN_RUNTIME_ID}. */
export const UNKNOWN_BLOCK_NAME = 'minecraft:unknown';

const stateTag = (value: BlockStateValue): NbtValue => {
    if (typeof value === 'boolean') return nbtByte(value);
    if (typeof value === 'number') return nbtInt(value);
    return nbtString(value);
};

/**
 * The `{name, states}` compound a runtime id is the hash of.
 *
 * The states are sorted by name, which `nbtCompound` does, because the two
 * sides hash the bytes and not the meaning: a different key order is a
 * different id. For the same reason a flag has to arrive as a boolean and
 * not as 0 or 1: Bedrock writes a flag as a byte and a number as an int,
 * and the two hash differently. `BlockStateModel` already normalizes a flag
 * to a boolean, so a state read off the palette is in the right shape.
 */
export const blockStateCompound = (
    name: string,
    states: Readonly<Record<string, BlockStateValue>> = {}
): NBTTagCompound => {
    const tags: Record<string, NbtValue> = {};
    for (const [key, value] of Object.entries(states)) tags[key] = stateTag(value);

    return nbtCompound({ name: nbtString(name), states: nbtCompound(tags) });
};

/**
 * The bytes a block state hashes to: little endian NBT with fixed-width
 * lengths, not the varint network flavor, which would hash differently.
 */
export const serializeBlockState = (name: string, states: Readonly<Record<string, BlockStateValue>> = {}): Buffer => {
    const stream = new BinaryStream();
    const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
    writer.setUseVarint(false);
    writer.writeCompound(blockStateCompound(name, states));

    return stream.getBuffer();
};

/** The number a block state travels as in a chunk palette. */
export const blockRuntimeId = (name: string, states: Readonly<Record<string, BlockStateValue>> = {}): number =>
    name === UNKNOWN_BLOCK_NAME ? UNKNOWN_RUNTIME_ID : fnv1a32(serializeBlockState(name, states));

/** One block state a real server recorded, together with the number it gave it. */
export interface CapturedBlockState {
    readonly name: string;
    readonly states: Readonly<Record<string, BlockStateValue>>;
    /** The server's own `network_id`, which is what the client will compute. */
    readonly networkId: number;
}

/**
 * Reads a captured block state out of the compound the creative catalog
 * carries, which is a plain little endian NBT blob holding `name`, `states`
 * and `network_id`.
 *
 * @param blockStates - The compound, or the base64 the catalog stores.
 */
export const readCapturedBlockState = (blockStates: Buffer | string): CapturedBlockState => {
    const buffer = typeof blockStates === 'string' ? Buffer.from(blockStates, 'base64') : blockStates;
    const compound = NBTTagCompound.readFromStream(new BinaryStream(buffer), ByteOrder.LITTLE_ENDIAN);
    const states: Record<string, BlockStateValue> = {};

    for (const [key, value] of compound.getCompound('states', true)?.entries() ?? []) {
        // Tag wrappers from `@jsprismarine/nbt` share only `getValue`, and
        // the catalog writes a state as a byte, an int or a string. The byte
        // becomes a boolean so that rewriting it produces a byte again; kept
        // as a number it would be rewritten as an int and hash differently.
        const raw: unknown = (value as { getValue(): unknown }).getValue();
        if (value instanceof Types.ByteVal) states[key] = raw === 1;
        else if (typeof raw === 'number' || typeof raw === 'string') states[key] = raw;
    }

    return { name: compound.getString('name', ''), states, networkId: compound.getNumber('network_id', 0) };
};

/** One state whose hash is not the number the server gave it. */
export interface RuntimeIdDisagreement {
    readonly name: string;
    readonly states: Readonly<Record<string, BlockStateValue>>;
    readonly computed: number;
    readonly captured: number;
}

/** What {@link verifyBlockRuntimeIds} found. */
export interface RuntimeIdReport {
    readonly checked: number;
    readonly disagreements: readonly RuntimeIdDisagreement[];
}

/**
 * Recomputes the runtime id of every captured state and compares it to the
 * number the server recorded.
 *
 * One disagreement means this server would put a different number on the
 * wire than the client computes for the same block, which shows up as the
 * wrong block rendered rather than as an error.
 */
export const verifyBlockRuntimeIds = (states: Iterable<CapturedBlockState>): RuntimeIdReport => {
    const disagreements: RuntimeIdDisagreement[] = [];
    let checked = 0;

    for (const state of states) {
        checked++;
        const computed = blockRuntimeId(state.name, state.states);
        if (computed !== state.networkId) {
            disagreements.push({ name: state.name, states: state.states, computed, captured: state.networkId });
        }
    }

    return { checked, disagreements };
};

/** One way a generated definition and the captured palette disagree. */
export interface PaletteDisagreement {
    readonly block: string;
    readonly detail: string;
}

/** Thrown when a generated block registry would not match the client's. */
export class BlockPaletteError extends Error {
    public override name = 'BlockPaletteError';

    public constructor(public readonly disagreements: readonly PaletteDisagreement[]) {
        super(
            `the block registry disagrees with the captured palette in ${disagreements.length} place(s), ` +
                `first: ${disagreements[0]?.block} ${disagreements[0]?.detail}`
        );
    }
}

const propertyNames = (definition: Buffer): ReadonlyMap<string, readonly BlockStateValue[]> => {
    const declared = new Map<string, readonly BlockStateValue[]>();
    const properties = readNetworkNbt(definition).getList('properties', false);
    if (properties === null) return declared;

    for (const property of properties) {
        if (!(property instanceof NBTTagCompound)) continue;
        const values: BlockStateValue[] = [];
        for (const value of property.getList('enum', true) ?? []) {
            const raw: unknown = (value as { getValue(): unknown }).getValue();
            if (typeof raw === 'number' || typeof raw === 'string' || typeof raw === 'boolean') values.push(raw);
        }
        declared.set(property.getString('name', ''), values);
    }

    return declared;
};

const sameValues = (left: readonly BlockStateValue[], right: readonly BlockStateValue[]): boolean =>
    left.length === right.length &&
    left.every((value, index) => {
        const other = right[index];
        // A palette bit reads as a boolean and a definition writes it as a
        // byte, so compare the two as numbers when either is a flag.
        if (typeof value === 'boolean' || typeof other === 'boolean') return Number(value) === Number(other);
        return value === other;
    });

/**
 * Checks a generated `Block Properties` list against the captured palette.
 *
 * It is a build-time guard rather than a runtime one: the client will not
 * complain about a block registry that disagrees with its own, it will draw
 * the wrong block, so the disagreement has to be found here.
 *
 * @param properties - What {@link buildBlockProperties} produced.
 * @param palette - The captured palette, from `vanillaBlockPalette()`.
 * @throws {BlockPaletteError} When any declared block is absent from the
 *   palette or declares a state the palette does not have.
 */
export const assertBlockPaletteAgrees = (properties: Iterable<BlockProperty>, palette: BlockPalette): void => {
    const disagreements: PaletteDisagreement[] = [];

    for (const property of properties) {
        const entry = palette.entry(property.name);
        if (entry === undefined) {
            // A pack's own block is expected to be absent; a block the
            // definition says is vanilla is not.
            if (property.name.startsWith('minecraft:')) {
                disagreements.push({
                    block: property.name,
                    detail: 'is declared as a vanilla block but is not in the captured palette'
                });
            }
            continue;
        }

        for (const [name, values] of propertyNames(property.definition)) {
            const state = entry.model.state(name);
            if (state === undefined) {
                disagreements.push({
                    block: property.name,
                    detail: `declares the state ${name}, which the palette does not have`
                });
                continue;
            }
            if (!sameValues(values, state.values)) {
                disagreements.push({
                    block: property.name,
                    detail: `declares ${name} as ${JSON.stringify(values)}, the palette has ${JSON.stringify(state.values)}`
                });
            }
        }
    }

    if (disagreements.length > 0) throw new BlockPaletteError(disagreements);
};
