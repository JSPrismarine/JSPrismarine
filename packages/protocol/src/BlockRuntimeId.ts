/**
 * The number a block state travels as, once `StartGamePacket.BlockNetworkIds Are Hashes` is set.
 *
 * With that flag the runtime id of a state is the FNV-1a 32 hash of its own `{name, states}`
 * compound and nothing else, so neither side needs the other's ordering and adding a block
 * renumbers nothing. The price is that both sides have to agree byte for byte on what they hash,
 * which is why the serialization and the hash live together here rather than once per consumer.
 *
 * The alternative the protocol allows, an index into a palette both sides sort by the FNV-1 64
 * hash of the block name, renumbers every vanilla block the moment a pack adds one.
 * @see https://gist.github.com/Alemiz112/504d0f79feac7ef57eda174b668dd345
 */
import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTTagCompound, NBTWriter, Types } from '@jsprismarine/nbt';

const FNV1_32_OFFSET_BASIS = 0x811c9dc5;
const FNV1_32_PRIME = 0x01000193;

/** The id vanilla reserves for a state it cannot resolve. */
export const UNKNOWN_RUNTIME_ID = -2;

/** The name whose every state is {@link UNKNOWN_RUNTIME_ID}. */
export const UNKNOWN_BLOCK_NAME = 'minecraft:unknown';

/**
 * FNV-1a, 32 bit, as a signed integer.
 *
 * Kept apart from the NBT work so it can be checked against the published test vectors for the
 * algorithm rather than only against block ids.
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

/** What a block state property can hold. A flag is a boolean, not 0 or 1 - see {@link stateTag}. */
export type BlockStateValue = string | number | boolean;

/**
 * The tag type a property value hashes as. Bedrock writes a flag as a byte and a number as an
 * int, and the two hash differently, so a flag has to arrive as a boolean to come out right.
 */
const stateTag = (value: BlockStateValue): Types.ByteVal | Types.NumberVal | Types.StringVal => {
    if (typeof value === 'boolean') return new Types.ByteVal(value ? 1 : 0);
    if (typeof value === 'number') return new Types.NumberVal(value);
    return new Types.StringVal(value);
};

/**
 * The `{name, states}` compound a runtime id is the hash of.
 *
 * The properties are sorted by name because the two sides hash the bytes and not the meaning: a
 * different key order is a different id.
 * @param name - The block's namespaced identifier.
 * @param states - Its properties; an empty compound is written when there are none.
 */
export const blockStateCompound = (
    name: string,
    states: Readonly<Record<string, BlockStateValue>> = {}
): NBTTagCompound => {
    const properties = new NBTTagCompound('states');
    for (const key of Object.keys(states).sort()) properties.addValue(key, stateTag(states[key]!));

    const compound = new NBTTagCompound('');
    compound.addValue('name', new Types.StringVal(name));
    compound.addValue('states', properties);
    return compound;
};

/**
 * The bytes a block state hashes to: little endian NBT with fixed-width lengths, not the varint
 * network flavor, which would produce different bytes and therefore a different id.
 */
export const writeBlockStateNbt = (compound: NBTTagCompound): Buffer => {
    const stream = new BinaryStream();
    const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
    writer.setUseVarint(false);
    writer.writeCompound(compound);

    return stream.getBuffer();
};

/**
 * The runtime id of an already-built `{name, states}` compound, for a caller that builds the
 * compound its own way - from a schema that knows each property's vanilla tag type, say.
 */
export const blockRuntimeIdOf = (compound: NBTTagCompound): number => fnv1a32(writeBlockStateNbt(compound));

/**
 * The runtime id of a block state given by name and properties.
 * @returns {@link UNKNOWN_RUNTIME_ID} for {@link UNKNOWN_BLOCK_NAME}, which is not hashed.
 */
export const blockRuntimeId = (name: string, states: Readonly<Record<string, BlockStateValue>> = {}): number =>
    name === UNKNOWN_BLOCK_NAME ? UNKNOWN_RUNTIME_ID : blockRuntimeIdOf(blockStateCompound(name, states));
