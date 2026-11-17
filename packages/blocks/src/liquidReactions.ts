/**
 * Turns the water answers of Bedrock's captured block registry into one liquid reaction per block.
 *
 * The `block-types` table that the `dump` pass of
 * `pnpm --filter @jsprismarine/bedrock-data run dump:bedrock` writes asks the Script API four
 * questions about water for each block type's default permutation, and lists every other
 * permutation that answers differently. `utils/generate-liquid-reactions.mjs` runs
 * {@link liquidReactionsOf} over that table to write `src/tables/blockLiquidReactions.json`.
 */
import type { LiquidReaction } from './geometry';
import { BlocksErrors } from '@jsprismarine/errors/blocks';

/** What the Script API answers about water for one block permutation. */
export interface WaterAnswers {
    /** `canContainLiquid`: water can share the block's cell, which is waterlogging. */
    readonly contain: boolean;
    /** `isLiquidBlocking`: the block dams flowing water. */
    readonly blocking: boolean;
    /** `canBeDestroyedByLiquidSpread`: flowing water destroys the block. */
    readonly destroyed: boolean;
    /** `liquidSpreadCausesSpawn`: flowing water breaks the block and drops it as an item. */
    readonly spawns: boolean;
}

/** A permutation whose water answers differ from its block type's default permutation. */
export interface WaterPermutation {
    /** The permutation's full state, as the Script API reports it. */
    readonly states: Readonly<Record<string, unknown>>;
    readonly water: WaterAnswers;
}

/** The part of one `block-types` row this module reads. */
export interface BlockTypeWaterRow {
    readonly id: string;
    /** The default permutation's answers. */
    readonly water: WaterAnswers;
    /** Every permutation that answers differently from {@link water}. Empty when none does. */
    readonly waterPermutations: readonly WaterPermutation[];
}

/**
 * The reaction Bedrock's `liquidReactionOnTouch` names, from the Script API's water answers.
 *
 * A block that dams water is `blocking`. Otherwise water breaks it and drops it (`popped`), breaks
 * it with no drop (`broken`), or shares its cell (`none`). The pinned server's capture agrees with
 * the reactions CloudburstMC/Data dumped from the same server for all 1477 block types.
 * @param water - The answers for one permutation.
 * @returns The liquid reaction.
 */
export const liquidReactionOfWater = ({ blocking, destroyed, spawns }: WaterAnswers): LiquidReaction => {
    if (blocking) return 'blocking';
    if (spawns) return 'popped';
    if (destroyed) return 'broken';
    return 'none';
};

/**
 * One liquid reaction per block type, sorted by identifier.
 *
 * A block type keeps one reaction for all its states because that is what `bedrockLiquidReactionOf`
 * answers. A permutation may still differ in whether it holds water, which leaves the reaction
 * alone. A permutation that reacts differently fails the run and names the block, so a capture that
 * needs a per-state reaction cannot be flattened by mistake.
 * @param rows - The rows of the captured `block-types` table.
 * @returns The reaction of each block type, keyed by identifier.
 * @throws {Error} When a block type appears twice or reacts differently in some state.
 */
export const liquidReactionsOf = (rows: readonly BlockTypeWaterRow[]): Record<string, LiquidReaction> => {
    const reactions = new Map<string, LiquidReaction>();
    for (const row of rows) {
        if (reactions.has(row.id)) throw new BlocksErrors.DuplicateCapturedBlock({ id: row.id });
        const reaction = liquidReactionOfWater(row.water);
        const differing = row.waterPermutations.filter(
            (permutation) => liquidReactionOfWater(permutation.water) !== reaction
        );
        if (differing.length > 0) {
            const states = differing.map((permutation) => JSON.stringify(permutation.states)).join(', ');
            throw new BlocksErrors.LiquidReactionVariesByState({ id: row.id, reaction, states });
        }
        reactions.set(row.id, reaction);
    }
    return Object.fromEntries([...reactions].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)));
};
