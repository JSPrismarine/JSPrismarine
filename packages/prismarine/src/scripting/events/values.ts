/**
 * The values the world events of a level's scripts carry, built from the server's own objects:
 * an entity, a player, a block, a permutation, a stack, a dimension and a vector, as
 * `ScriptEventValue` names each.
 */
import type { BlockFace } from '@jsprismarine/blocks';
import type { ScriptDirection, ScriptEventValue } from '@jsprismarine/script-host/host/world';

import type { StoreActor } from '../../entity/data/storeActors';
import type { BrokenBlock } from '../../events/player/PlayerBreakBlockEvent';
import type { Item } from '../../item/Item';
import type { World } from '../../world/World';
import { scriptItemOf } from '../levelScriptAccess';
import { scriptEntityRef } from '../scriptEntityEvents';

/** A block face as the Script API's `Direction` names it. */
export const DIRECTIONS: Readonly<Record<BlockFace, ScriptDirection>> = {
    down: 'Down',
    up: 'Up',
    north: 'North',
    south: 'South',
    west: 'West',
    east: 'East'
};

/** The type the scripts give a player. */
const PLAYER = 'minecraft:player';

/** A player by their runtime id, as the scripts know them. */
export const playerValue = (runtimeId: bigint): ScriptEventValue => ({
    entity: { id: String(runtimeId), typeId: PLAYER }
});

/** An entity, by its actor. */
export const entityValue = (actor: StoreActor): ScriptEventValue => ({ entity: scriptEntityRef(actor) });

/** A block position in a world. */
export const blockValue = (world: World, { x, y, z }: { x: number; y: number; z: number }): ScriptEventValue => ({
    block: { dimension: world.getDimension().bedrockName, x, y, z }
});

/** The type and states of a block. */
export const permutationValue = ({ name, states }: Pick<BrokenBlock, 'name' | 'states'>): ScriptEventValue => ({
    permutation: { typeId: name, states }
});

/** A stack, or undefined for an empty hand or slot, which a member reads as `undefined`. */
export const itemValue = (item: Item | null): ScriptEventValue | undefined => {
    const read = scriptItemOf(item);
    return read === null ? undefined : { item: read };
};

/** A world's dimension. */
export const dimensionValue = (world: World): ScriptEventValue => ({ dimension: world.getDimension().bedrockName });

/** A position or a direction. */
export const vectorValue = (x: number, y: number, z: number): ScriptEventValue => ({ vector: { x, y, z } });

/**
 * The fields of an event, without the ones that have no value, which a member reads as
 * `undefined`.
 */
export const fieldsOf = (
    fields: Readonly<Record<string, ScriptEventValue | undefined>>
): Record<string, ScriptEventValue> => {
    const kept: Record<string, ScriptEventValue> = {};
    for (const [name, value] of Object.entries(fields)) if (value !== undefined) kept[name] = value;
    return kept;
};
