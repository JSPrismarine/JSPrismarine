import { ContentError } from '@jsprismarine/errors/content';
import { defineErrors } from './defineErrors';

/**
 * Thrown for a programming mistake against this package's interface: a state
 * name the block does not carry, a runtime id outside the palette, a palette
 * built with a duplicate identifier.
 *
 * Bad pack data is not an error. It comes back as a `Diagnostic` so one
 * broken file cannot stop a load, which is the rule `@jsprismarine/packs` and
 * `@jsprismarine/content` already follow.
 */
export abstract class BlockError extends ContentError {
    public override name = 'BlockError';
}

/** The errors `@jsprismarine/blocks` throws. */
export const BlocksErrors = defineErrors('blocks', {
    /**
     * The captured Bedrock block table lists the same block twice, so the capture is damaged.
     * Recapture it with `pnpm --filter @jsprismarine/bedrock-data run dump:bedrock`.
     */
    DuplicateCapturedBlock: '{id} appears twice in the Bedrock block capture',
    /**
     * A palette was built from a list that names the same block identifier twice. The code building
     * the palette passed a duplicate.
     */
    DuplicatePaletteBlock: { message: '{identifier} appears twice in the palette', base: BlockError },
    /**
     * A block's collision shape has more boxes than Bedrock's `minecraft:collision_box` component
     * accepts, so the client could not be sent its true shape.
     */
    TooManyCollisionBoxes: 'Bedrock collision_box accepts at most 16 boxes, got {boxesCount}',
    /**
     * The Bedrock capture has no collision geometry for this block, so its shape cannot be sent.
     * Recapture the Bedrock data for the pinned server version.
     */
    MissingCollisionGeometry: '{identifier} has no captured Bedrock collision geometry',
    /**
     * The Bedrock capture has no display name for this block. Recapture the Bedrock data for the
     * pinned server version.
     */
    MissingDisplayName: '{identifier} has no captured Bedrock display name',
    /**
     * A block's liquid reaction differs between its states, which the flattened reaction table
     * cannot express. The capture changed shape; the reaction table needs a per-state entry for
     * this block.
     */
    LiquidReactionVariesByState: '{id} is {reaction} by default but reacts differently in {states}',
    /**
     * Code asked for a block state by a name the block does not have. The message lists the states
     * it does have.
     */
    UnknownState: { message: '{name} is not a state of this block (has: {states})', base: BlockError },
    /** Code asked for a block state on a block that has none. */
    BlockHasNoStates: { message: '{name} is not a state of this block (has: none)', base: BlockError },
    /** Code set a block state to a value outside that state's domain. */
    InvalidStateValue: { message: '{given} is not a value of the state {name}', base: BlockError },
    /**
     * Code asked the palette for a block it does not hold. The block is not registered, or the
     * identifier is misspelled.
     */
    PaletteHasNoBlock: { message: 'the palette has no block {identifier}', base: BlockError },
    /**
     * A runtime block id is outside the palette. It came from a world or a packet built against a
     * different palette.
     */
    RuntimeIdOutOfRange: { message: 'the runtime id {runtimeId} is outside 0 to {value}', base: BlockError },
    /** A block state was declared with an empty list of values, so no block could ever hold it. */
    StateHasNoValues: { message: 'the state {name} has no values', base: BlockError },
    /**
     * A state index is outside the number of combinations the block's states allow. The index was
     * saved against a different definition of the block.
     */
    StateIndexOutOfRange: { message: 'the state index {index} is outside 0 to {value}', base: BlockError },
    /** A block declares the same state name twice. */
    DuplicateState: { message: 'the state {name} is declared twice', base: BlockError },
    /**
     * A strict block load found problems. The error's `diagnostics` list every one, and the message
     * shows the first.
     */
    BlocksDidNotResolveCleanly: 'the blocks did not resolve cleanly: {count} diagnostic(s), first: {first}'
});
