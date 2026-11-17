import BinaryStream from '@jsprismarine/binaryutils';
import type { NBTTagCompound } from '@jsprismarine/nbt';
import { ByteOrder, NBTReader, NBTWriter, Types } from '@jsprismarine/nbt';
import { blockSchemas } from '@jsprismarine/minecraft';

import { UNKNOWN_RUNTIME_ID } from '@jsprismarine/protocol';
import { BlockRuntimeIds } from '../../../block/state/BlockRuntimeIds';
import { BlockStateSchemas } from '../../../block/state/BlockStateSchema';
import type { BlockStateValue } from '../../../block/state/BlockState';
import { PrismarineWorldErrors } from '@jsprismarine/errors/prismarine/world';

const versionParts = blockSchemas.minecraftVersion.split('.').map(Number);
const [majorVersion, minorVersion, patchVersion] = versionParts;
if (
    versionParts.length !== 3 ||
    majorVersion === undefined ||
    minorVersion === undefined ||
    patchVersion === undefined ||
    !Number.isInteger(majorVersion) ||
    !Number.isInteger(minorVersion) ||
    !Number.isInteger(patchVersion) ||
    majorVersion < 0 ||
    majorVersion > 0xff ||
    minorVersion < 0 ||
    minorVersion > 0xff ||
    patchVersion < 0 ||
    patchVersion > 0xff
) {
    throw new PrismarineWorldErrors.InvalidMinecraftCatalogVersion({ minecraftVersion: blockSchemas.minecraftVersion });
}

/**
 * The Bedrock state version packs the catalog's Minecraft major, minor, and patch numbers into
 * the top three bytes, with state revision 1 in the low byte.
 *
 * Written on the way out because the game uses it to decide whether a state needs running through
 * its upgrade schema. Understate it and blocks come back as `minecraft:unknown` after the game has
 * "fixed" them; the field is ignored on the way in, since it is not part of a block's identity.
 */
export const BLOCK_STATE_VERSION = (majorVersion << 24) | (minorVersion << 16) | (patchVersion << 8) | 1;

/**
 * Each runtime id's entry as {@link encodePaletteEntry} last wrote it. An entry depends only on
 * the id and the schema its block's property types come from, and a world's sub chunks repeat a
 * few hundred states, so a save writes these bytes instead of building the compound again.
 */
const encodedEntries = new Map<number, Buffer>();
/** The schema revision {@link encodedEntries} was written under. */
let encodedRevision = -1;
/** Enough for every state a world holds; a registry that reaches it starts over. */
const ENCODED_ENTRY_LIMIT = 1 << 16;

/**
 * A palette entry as it sits on disk: `{name, states, version}` in little endian, fixed width NBT.
 *
 * The network form of the same palette is a list of runtime ids, which are hashes of exactly this
 * compound minus the version - so the two representations share `BlockRuntimeIds` and there is no
 * separate mapping table to keep in step.
 */
export const encodePaletteEntry = (runtimeId: number, stream: BinaryStream): void => {
    const revision = BlockStateSchemas.getRevision();
    if (revision !== encodedRevision || encodedEntries.size >= ENCODED_ENTRY_LIMIT) {
        encodedEntries.clear();
        encodedRevision = revision;
    }

    let bytes = encodedEntries.get(runtimeId);
    if (bytes === undefined) {
        const entry = new BinaryStream();
        const writer = new NBTWriter(entry, ByteOrder.LITTLE_ENDIAN);
        writer.setUseVarint(false);
        writer.writeCompound(paletteEntryCompound(runtimeId));
        bytes = Buffer.from(entry.getBuffer());
        encodedEntries.set(runtimeId, bytes);
    }
    stream.write(bytes);
};

/**
 * The `{name, states, version}` compound for a runtime id, which a palette entry is and a pending
 * tick's `blockState` is too.
 *
 * @throws When no registered block produces the runtime id, or its block has no state schema.
 */
export const paletteEntryCompound = (runtimeId: number): NBTTagCompound => {
    const state = BlockRuntimeIds.getState(runtimeId);
    if (state === null) {
        throw new PrismarineWorldErrors.UnsavableRuntimeId({ runtimeId });
    }

    const schema = BlockStateSchemas.get(state.name);
    if (!schema) throw new PrismarineWorldErrors.UnknownBlock({ name: state.name });

    const compound = state.toNBT(schema.getPropertyTypes());
    compound.addValue('version', new Types.NumberVal(BLOCK_STATE_VERSION));
    return compound;
};

/**
 * Reads one palette entry back to a runtime id.
 *
 * A state the server has no schema for - a block from a version we do not know, or from a
 * behavior pack - resolves to `UNKNOWN_RUNTIME_ID` rather than throwing, so one unrecognized
 * block cannot make a whole world unopenable.
 */
export const decodePaletteEntry = (stream: BinaryStream): number => {
    const reader = new NBTReader(stream, ByteOrder.LITTLE_ENDIAN);
    reader.setUseVarint(false);

    return runtimeIdOf(reader.parse());
};

export const runtimeIdOf = (compound: NBTTagCompound): number => {
    const name = compound.getString('name', '');
    if (name.length === 0) throw new PrismarineWorldErrors.UnnamedPaletteEntry();

    const schema = BlockStateSchemas.get(name);
    if (!schema) return UNKNOWN_RUNTIME_ID;

    const states = compound.getCompound('states', false);
    const properties: Record<string, BlockStateValue> = {};

    if (states) {
        for (const [key, value] of states.entries()) {
            properties[key] = value?.getValue?.() ?? value;
        }
    }

    // Through the schema rather than straight from the file. A world written by a different
    // version may name a property we do not have or leave out one we do, and `createState`
    // fills in the defaults - so the block still resolves to itself rather than to nothing.
    const types = schema.getPropertyTypes();
    const known: Record<string, BlockStateValue> = {};

    for (const [key, type] of Object.entries(types)) {
        const value = properties[key];
        if (value === undefined) continue;

        // Vanilla writes booleans as bytes. Which of the three NBT types a property uses is part
        // of the block's identity, because the runtime id is hashed over the tag byte too.
        known[key] = type === 'string' ? String(value) : Number(value);
    }

    try {
        return BlockRuntimeIds.get(schema.createState(known));
    } catch {
        // A value this version does not accept. The block itself is still real, so fall back to
        // its default state rather than losing it to `minecraft:unknown`.
        return BlockRuntimeIds.getByName(name);
    }
};
