/**
 * The LevelDB record `jsprismarine:command_storage`: a level's command storage, which Bedrock
 * Dedicated Server has no record for.
 *
 * The record is a compound with one entry per storage, named by the storage's id and holding its
 * compound as SNBT. The binary codec infers a tag's type from the wrapper around its value, so it
 * cannot write the typed tags commands edit; SNBT keeps every type, and no Bedrock tool reads the
 * record to need anything else.
 *
 * A `TAG_String` holds at most 65,535 bytes, so SNBT longer than {@link CHUNK_LENGTH} is written as
 * a list of strings that the reader joins back together.
 */
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { isJSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';
import { formatSnbt, parseSnbtCompound } from '@jsprismarine/nbt/snbt';

import type { SavedCommandStorage } from '../../CommandStorage';
import type { NbtCompoundTag } from '@jsprismarine/nbt/tag';

/**
 * The most UTF-16 code units one string holds. A code unit is at most 3 bytes of UTF-8, so a
 * chunk stays under the 65,535 bytes a `TAG_String` can hold.
 */
const CHUNK_LENGTH = 16_384;

/** Splits text into chunks of at most {@link CHUNK_LENGTH} code units, never inside a surrogate pair. */
const chunksOf = (text: string): string[] => {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
        let end = Math.min(start + CHUNK_LENGTH, text.length);
        const last = text.charCodeAt(end - 1);
        if (end < text.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
        chunks.push(text.slice(start, end));
        start = end;
    }
    return chunks;
};

/** Writes each storage's compound as SNBT under its id, as one string or a list of chunks. */
export const commandStorageToNbt = (saved: SavedCommandStorage): NBTTagCompound => {
    const root = new NBTTagCompound('');
    for (const [id, compound] of saved) {
        const text = formatSnbt(compound);
        if (text.length <= CHUNK_LENGTH) root.addValue(id, new Types.StringVal(text));
        else root.addValue(id, new Set(chunksOf(text).map((chunk) => new Types.StringVal(chunk))));
    }
    return root;
};

/** The SNBT an entry holds, or undefined when it is neither a string nor a list of strings. */
const textOf = (tag: unknown): string | undefined => {
    if (tag instanceof Types.StringVal) return tag.getValue();
    if (!(tag instanceof Set)) return undefined;
    let text = '';
    for (const chunk of tag) {
        if (!(chunk instanceof Types.StringVal)) return undefined;
        text += chunk.getValue();
    }
    return text;
};

/** Reads the record back, skipping an entry that does not hold an SNBT compound. */
export const commandStorageFromNbt = (root: NBTTagCompound): Map<string, NbtCompoundTag> => {
    const saved = new Map<string, NbtCompoundTag>();
    for (const [id, tag] of root.entries()) {
        const text = textOf(tag);
        if (text === undefined) continue;
        try {
            // Java prints a stored infinity as `Infinityd`, which only this option reads back.
            saved.set(id, parseSnbtCompound(text, { nonFinite: true }));
        } catch (error) {
            if (!isJSPrismarineError(error)) throw error;
        }
    }
    return saved;
};
