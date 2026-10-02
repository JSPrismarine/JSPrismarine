import type BinaryStream from '@jsprismarine/binaryutils';
import type { NBTTagCompound } from '@jsprismarine/nbt';
import { ByteOrder, NBTReader, NBTWriter, Types } from '@jsprismarine/nbt';

import { BlockRuntimeIds, UNKNOWN_RUNTIME_ID } from '../../../block/state/BlockRuntimeIds';
import { BlockStateSchemas } from '../../../block/state/BlockStateSchema';
import type { BlockStateValue } from '../../../block/state/BlockState';

/**
 * The `version` every state in the vanilla dump carries: 0x01152801, which is 1.21.40 revision 1.
 *
 * Written on the way out because the game uses it to decide whether a state needs running through
 * its upgrade schema. Understate it and blocks come back as `minecraft:unknown` after the game has
 * "fixed" them; the field is ignored on the way in, since it is not part of a block's identity.
 * @see packages/bedrock-data/src/resources/canonical_block_states.nbt
 */
export const BLOCK_STATE_VERSION = 18163713;

/**
 * A palette entry as it sits on disk: `{name, states, version}` in little endian, fixed width NBT.
 *
 * The network form of the same palette is a list of runtime ids, which are hashes of exactly this
 * compound minus the version - so the two representations share `BlockRuntimeIds` and there is no
 * separate mapping table to keep in step.
 */
export const encodePaletteEntry = (runtimeId: number, stream: BinaryStream): void => {
    const state = BlockRuntimeIds.getState(runtimeId);
    if (state === null) {
        throw new Error(`Cannot write runtime id ${runtimeId}: no registered block produces it`);
    }

    const schema = BlockStateSchemas.get(state.name);
    if (!schema) throw new Error(`No block state schema registered for ${state.name}`);

    const compound = state.toNBT(schema.getPropertyTypes());
    compound.addValue('version', new Types.NumberVal(BLOCK_STATE_VERSION));

    const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
    writer.setUseVarint(false);
    writer.writeCompound(compound);
};

/**
 * Reads one palette entry back to a runtime id.
 *
 * A state the server has no schema for - a block from a version we do not know, or from a
 * behaviour pack - resolves to `UNKNOWN_RUNTIME_ID` rather than throwing, so one unrecognised
 * block cannot make a whole world unopenable.
 */
export const decodePaletteEntry = (stream: BinaryStream): number => {
    const reader = new NBTReader(stream, ByteOrder.LITTLE_ENDIAN);
    reader.setUseVarint(false);

    return runtimeIdOf(reader.parse());
};

export const runtimeIdOf = (compound: NBTTagCompound): number => {
    const name = compound.getString('name', '');
    if (name.length === 0) throw new Error('Palette entry has no name');

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
