/**
 * The state half of the seam: how a Bedrock block spells the state values Java spells as words.
 *
 * Java writes a direction as `facing=north`. Bedrock writes it as a number, under a state name
 * of its own, and the number is not the same for every block: a dropper's `facing_direction`
 * calls north 2 and a piston's calls it 3, because Bedrock's piston points the other way. Nor
 * is it always a number - a redstone torch's `torch_facing_direction` spells north `south`, and
 * a door's `minecraft:cardinal_direction` spells it `east`. None of that can be worked out from
 * the state's name, so {@link import('./tables').blockStatesTable} reads it per block out of the
 * generated block mapping.
 *
 * Two functions, one each way, over a whole state record. A caller that holds Java's words -
 * `@jsprismarine/engine-systems` carries Java's redstone, fluid and piston models - reads a
 * block through {@link javaBlockStates}, works in words, and writes it back through
 * {@link bedrockBlockStates}. The round trip is exact for every state in the pinned palette; the
 * (block, state) pairs that have no word vocabulary at all are the reviewed
 * {@link import('./lossList').BLOCK_STATE_LOSSES} and travel as the Bedrock value untouched.
 */
import { blockStatesTable, blocksTable } from './tables';

/** A block state value as either edition writes one; the palette carries booleans as 0 and 1. */
export type BlockStateValue = string | number | boolean;

/** The state names each Bedrock block carries, from the block table's own target palette. */
const keysOf = new Map<string, ReadonlySet<string>>(
    blocksTable.statePalette.map(([name, keys]) => [`minecraft:${name}`, new Set(keys)])
);

/** The vocabularies of one Bedrock block, or undefined when it spells everything Java's way. */
const vocabularyOf = (name: string): Record<string, Record<string, string | number>> | undefined => {
    const index = blockStatesTable.blocks[name];
    return index === undefined ? undefined : blockStatesTable.vocabularies[index];
};

/** The reverse of one state's vocabulary, built once per state name on first use. */
const reversed = new Map<string, Map<string | number, string>>();
const wordsOf = (name: string, state: string): Map<string | number, string> | undefined => {
    const key = `${name} ${state}`;
    const cached = reversed.get(key);
    if (cached !== undefined) return cached;

    const vocabulary = vocabularyOf(name)?.[state];
    if (vocabulary === undefined) return undefined;

    // The generator refuses to emit a vocabulary that spells two words the same way, so the
    // reverse is a function.
    const words = new Map(Object.entries(vocabulary).map(([word, value]) => [value, word]));
    reversed.set(key, words);
    return words;
};

/**
 * Rewrites a block's states into the Bedrock palette's own spelling.
 *
 * Every word the block has a vocabulary for becomes the value Bedrock stores, and every state
 * this Bedrock block does not carry is dropped - Java's piston `extended` has no Bedrock state,
 * because an extended Bedrock piston is a piston with an arm block in front of it. A state the
 * block does carry and has no vocabulary for travels untouched, which is what a number, a
 * boolean, and the reviewed {@link import('./lossList').BLOCK_STATE_LOSSES} all want.
 *
 * @param {string} name - The namespaced Bedrock block identifier, such as `minecraft:piston`.
 * @param {Readonly<Record<string, BlockStateValue>>} states - The states, which may be spelled Java's way.
 * @returns {Record<string, BlockStateValue>} The states the palette holds. A block the pinned
 *   data does not know - a custom block, or one of the Bedrock-only palette entries no Java
 *   block maps onto - comes back unchanged, because there is nothing to translate it against.
 * @example
 * ```typescript
 * bedrockBlockStates('minecraft:piston', { facing_direction: 'north', extended_bit: true });
 * // { facing_direction: 3 }
 * ```
 */
export const bedrockBlockStates = (
    name: string,
    states: Readonly<Record<string, BlockStateValue>>
): Record<string, BlockStateValue> => {
    const keys = keysOf.get(name);
    if (keys === undefined) return { ...states };

    const vocabularies = vocabularyOf(name);
    const bedrock: Record<string, BlockStateValue> = {};
    for (const [state, value] of Object.entries(states)) {
        if (!keys.has(state)) continue;
        const spelled = typeof value === 'string' ? vocabularies?.[state]?.[value] : undefined;
        bedrock[state] = spelled ?? value;
    }
    return bedrock;
};

/**
 * Rewrites a block's states into Java's words, the inverse of {@link bedrockBlockStates}.
 *
 * Nothing is dropped and nothing is added: a state with no vocabulary, which is every number
 * and every boolean, travels untouched.
 *
 * @param {string} name - The namespaced Bedrock block identifier.
 * @param {Readonly<Record<string, BlockStateValue>>} states - The states as the palette holds them.
 * @returns {Record<string, BlockStateValue>} The same states, with Java's word wherever one exists.
 * @example
 * ```typescript
 * javaBlockStates('minecraft:piston', { facing_direction: 3 }); // { facing_direction: 'north' }
 * ```
 */
export const javaBlockStates = (
    name: string,
    states: Readonly<Record<string, BlockStateValue>>
): Record<string, BlockStateValue> => {
    if (vocabularyOf(name) === undefined) return { ...states };

    const java: Record<string, BlockStateValue> = {};
    for (const [state, value] of Object.entries(states)) {
        const word = typeof value === 'boolean' ? undefined : wordsOf(name, state)?.get(value);
        java[state] = word ?? value;
    }
    return java;
};
