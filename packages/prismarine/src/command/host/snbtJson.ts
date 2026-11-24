/**
 * SNBT a player typed, read as the JSON a datapack would have written for the same value, which
 * is what the loot and predicate grammars compile.
 */
import { NbtErrors } from '@jsprismarine/errors/nbt';
import { parseSnbt } from '@jsprismarine/nbt/snbt';
import type { NbtTag } from '@jsprismarine/nbt/tag';

import { refuse } from './support';

/** A tag as the JSON a datapack would have written for it. */
const jsonOf = (tag: NbtTag): unknown => {
    switch (tag.type) {
        case 'compound':
            return Object.fromEntries(Object.entries(tag.value).map(([key, entry]) => [key, jsonOf(entry)]));
        case 'list':
            return tag.value.map(jsonOf);
        case 'byte_array':
        case 'int_array':
            return [...tag.value];
        case 'long_array':
            return [...tag.value].map(Number);
        case 'long':
            return Number(tag.value);
        default:
            return tag.value;
    }
};

/**
 * Reads SNBT as JSON.
 *
 * @throws {CommandSyntaxException} When the text is not SNBT, with the reader's message.
 */
export const jsonOfSnbt = (text: string): unknown => {
    try {
        return jsonOf(parseSnbt(text));
    } catch (error) {
        if (error instanceof NbtErrors.SnbtSyntax) refuse(error.message);
        throw error;
    }
};
