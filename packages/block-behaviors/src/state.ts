/**
 * Reading and rewriting block state values.
 *
 * The palette stores a state as a string, a number or a boolean, and the wire
 * carries a boolean as 0 or 1, so a family that reads `open_bit` has to cope
 * with both. These readers do that once.
 */
import type { BlockStateValue, HookBlock } from '@jsprismarine/blocks';

import type { BlockStates, WorldActions } from './world';

/** A state value as a number, with 0 and 1 for a boolean. */
export const stateNumber = (block: Pick<HookBlock, 'states'>, name: string, fallback = 0): number => {
    const value = block.states[name];
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
};

/** A state value as a boolean, counting any nonzero number as true. */
export const stateBoolean = (block: HookBlock, name: string, fallback = false): boolean => {
    const value = block.states[name];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value === 'true';
    return fallback;
};

/** A state value as a string, with numbers and booleans printed. */
export const stateString = (block: HookBlock, name: string, fallback = ''): string => {
    const value = block.states[name];
    if (value === undefined) return fallback;
    return typeof value === 'string' ? value : String(value);
};

/** Whether the block carries a state under this name. */
export const hasState = (block: HookBlock, name: string): boolean => block.states[name] !== undefined;

/**
 * The block's states with a patch applied.
 *
 * A patch entry whose value is undefined is left out, so a caller can write a
 * conditional patch without building the object twice.
 */
export const patchStates = (
    block: HookBlock,
    patch: Readonly<Record<string, BlockStateValue | undefined>>
): BlockStates => {
    const states: Record<string, BlockStateValue> = { ...block.states };
    for (const [name, value] of Object.entries(patch)) {
        if (value !== undefined) states[name] = value;
    }
    return states;
};

/**
 * A state value with a boolean written as the 0 or 1 the wire carries, so the
 * `false` a family computes compares equal to the `0` a chunk hands back.
 */
const normalized = (value: BlockStateValue | undefined): BlockStateValue | undefined =>
    typeof value === 'boolean' ? (value ? 1 : 0) : value;

/**
 * Whether a patch would move any of the block's state values.
 *
 * {@link patchStates} only adds and overwrites, so a patch whose every value is already
 * there produces the record the block has.
 */
const movesAnyState = (block: HookBlock, patch: Readonly<Record<string, BlockStateValue | undefined>>): boolean =>
    Object.entries(patch).some(
        ([name, value]) => value !== undefined && normalized(block.states[name]) !== normalized(value)
    );

/**
 * Rewrites a block in place with some of its states changed, keeping its
 * identifier and every state the patch leaves out.
 *
 * A patch that moves nothing writes nothing. The write is not free: it notifies the six
 * neighbors, so the five families that recompute a derived state on a neighbor change
 * without comparing first - the wall, fence and pane connections, scaffolding's
 * `stability`, the campfire's `extinguished` - each rewrote their unchanged value and
 * notified back, and a settled run never reached a fixed point. One notification on a
 * settled four-block scaffolding run spent 9.5 seconds inside a single tick before the
 * chained-update cap of one million stopped it.
 *
 * The stairs corner, the fence gate's `in_wall_bit` and the redstone diodes already
 * compared before writing; this is that check in the one place they all go through.
 */
export const setStates = (
    world: WorldActions,
    block: HookBlock,
    patch: Readonly<Record<string, BlockStateValue | undefined>>
): void => {
    if (!movesAnyState(block, patch)) return;
    world.setBlock(block.position, block.identifier, patchStates(block, patch));
};

/** Replaces a block with another identifier, carrying its current states over. */
export const replaceKeepingStates = (world: WorldActions, block: HookBlock, identifier: string): void => {
    world.setBlock(block.position, identifier, block.states);
};

/** The identifier with its namespace removed, which the family rules match on. */
export const bareName = (identifier: string): string => identifier.replace(/^[^:]*:/, '');

/** The identifier's namespace, `minecraft` for a vanilla block. */
export const namespaceOf = (identifier: string): string => {
    const colon = identifier.indexOf(':');
    return colon === -1 ? 'minecraft' : identifier.slice(0, colon);
};

/** Puts a bare name back in its namespace, which is how a family names a sibling block. */
export const sibling = (identifier: string, name: string): string => `${namespaceOf(identifier)}:${name}`;
