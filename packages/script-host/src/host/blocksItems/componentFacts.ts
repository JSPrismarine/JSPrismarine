/**
 * The id and validity of the block and item component objects this folder's members make, which
 * `Component.typeId` and `Component.isValid` read for every component.
 */
import { blockKeyOf } from '../serverObjects';
import type { ScriptWorld } from '../world';
import { BLOCK_ITEM_TAG } from './tags';
import { isRecord } from '../../isRecord';

/** What a block component object carries: its block and its id. */
export interface BlockComponentKey {
    readonly block: string;
    readonly id: string;
}

/** Reads a block component object's state. The host wrote it, so a bad one is a host bug. */
export const blockComponentKeyOf = (state: string): BlockComponentKey | undefined => {
    // The host wrote the string with JSON.stringify.
    const parsed: unknown = JSON.parse(state);
    return isRecord(parsed) && typeof parsed.block === 'string' && typeof parsed.id === 'string'
        ? { block: parsed.block, id: parsed.id }
        : undefined;
};

/** The id a component object reads as its `typeId`, and whether it is still valid; undefined for another kind. */
export const blockItemComponentFacts = (
    world: ScriptWorld,
    tag: number,
    state: string
): { readonly typeId: string; readonly isValid: boolean } | undefined => {
    // An item component reads its stack, which a script holds, so it stays valid.
    if (tag === BLOCK_ITEM_TAG.itemComponent) return { typeId: state, isValid: true };
    if (tag !== BLOCK_ITEM_TAG.blockComponent) return undefined;
    const key = blockComponentKeyOf(state);
    if (key === undefined) return undefined;
    const block = blockKeyOf(key.block);
    return { typeId: key.id, isValid: world.block(block.dimension, block) !== undefined };
};
