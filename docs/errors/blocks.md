---
title: '@jsprismarine/blocks errors'
description: The code, message and meaning of every error @jsprismarine/blocks throws.
group: Documents
category: Errors
---

# @jsprismarine/blocks errors

These are the errors `@jsprismarine/blocks` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.blocks -->
## Groups

Catch one of these classes to handle every error that extends it.

| Class        | What its errors mean                                                                                                                                                                                                                                                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BlockError` | Thrown for a programming mistake against this package's interface: a state name the block does not carry, a runtime id outside the palette, a palette built with a duplicate identifier. Bad pack data is not an error. It comes back as a `Diagnostic` so one broken file cannot stop a load, which is the rule `@jsprismarine/packs` and `@jsprismarine/content` already follow. |

## `BLOCKS_BLOCK_HAS_NO_STATES`

`{name} is not a state of this block (has: none)`

Thrown as `BlocksErrors.BlockHasNoStates`, which extends `BlockError`.

Code asked for a block state on a block that has none.

## `BLOCKS_BLOCKS_DID_NOT_RESOLVE_CLEANLY`

`the blocks did not resolve cleanly: {count} diagnostic(s), first: {first}`

Thrown as `BlocksErrors.BlocksDidNotResolveCleanly`, which extends `Error`.

A strict block load found problems. The error's `diagnostics` list every one, and the message
shows the first.

## `BLOCKS_DUPLICATE_CAPTURED_BLOCK`

`{id} appears twice in the Bedrock block capture`

Thrown as `BlocksErrors.DuplicateCapturedBlock`, which extends `Error`.

The captured Bedrock block table lists the same block twice, so the capture is damaged.
Recapture it with `pnpm --filter

## `BLOCKS_DUPLICATE_PALETTE_BLOCK`

`{identifier} appears twice in the palette`

Thrown as `BlocksErrors.DuplicatePaletteBlock`, which extends `BlockError`.

A palette was built from a list that names the same block identifier twice. The code building
the palette passed a duplicate.

## `BLOCKS_DUPLICATE_STATE`

`the state {name} is declared twice`

Thrown as `BlocksErrors.DuplicateState`, which extends `BlockError`.

A block declares the same state name twice.

## `BLOCKS_INVALID_STATE_VALUE`

`{given} is not a value of the state {name}`

Thrown as `BlocksErrors.InvalidStateValue`, which extends `BlockError`.

Code set a block state to a value outside that state's domain.

## `BLOCKS_LIQUID_REACTION_VARIES_BY_STATE`

`{id} is {reaction} by default but reacts differently in {states}`

Thrown as `BlocksErrors.LiquidReactionVariesByState`, which extends `Error`.

A block's liquid reaction differs between its states, which the flattened reaction table
cannot express. The capture changed shape; the reaction table needs a per-state entry for
this block.

## `BLOCKS_MISSING_COLLISION_GEOMETRY`

`{identifier} has no captured Bedrock collision geometry`

Thrown as `BlocksErrors.MissingCollisionGeometry`, which extends `Error`.

The Bedrock capture has no collision geometry for this block, so its shape cannot be sent.
Recapture the Bedrock data for the pinned server version.

## `BLOCKS_MISSING_DISPLAY_NAME`

`{identifier} has no captured Bedrock display name`

Thrown as `BlocksErrors.MissingDisplayName`, which extends `Error`.

The Bedrock capture has no display name for this block. Recapture the Bedrock data for the
pinned server version.

## `BLOCKS_PALETTE_HAS_NO_BLOCK`

`the palette has no block {identifier}`

Thrown as `BlocksErrors.PaletteHasNoBlock`, which extends `BlockError`.

Code asked the palette for a block it does not hold. The block is not registered, or the
identifier is misspelled.

## `BLOCKS_RUNTIME_ID_OUT_OF_RANGE`

`the runtime id {runtimeId} is outside 0 to {value}`

Thrown as `BlocksErrors.RuntimeIdOutOfRange`, which extends `BlockError`.

A runtime block id is outside the palette. It came from a world or a packet built against a
different palette.

## `BLOCKS_STATE_HAS_NO_VALUES`

`the state {name} has no values`

Thrown as `BlocksErrors.StateHasNoValues`, which extends `BlockError`.

A block state was declared with an empty list of values, so no block could ever hold it.

## `BLOCKS_STATE_INDEX_OUT_OF_RANGE`

`the state index {index} is outside 0 to {value}`

Thrown as `BlocksErrors.StateIndexOutOfRange`, which extends `BlockError`.

A state index is outside the number of combinations the block's states allow. The index was
saved against a different definition of the block.

## `BLOCKS_TOO_MANY_COLLISION_BOXES`

`Bedrock collision_box accepts at most 16 boxes, got {boxesCount}`

Thrown as `BlocksErrors.TooManyCollisionBoxes`, which extends `Error`.

A block's collision shape has more boxes than Bedrock's `minecraft:collision_box` component
accepts, so the client could not be sent its true shape.

## `BLOCKS_UNKNOWN_STATE`

`{name} is not a state of this block (has: {states})`

Thrown as `BlocksErrors.UnknownState`, which extends `BlockError`.

Code asked for a block state by a name the block does not have. The message lists the states
it does have.
<!-- /fact -->
