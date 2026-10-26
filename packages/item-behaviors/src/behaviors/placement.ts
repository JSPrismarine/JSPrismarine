/**
 * Putting things in the world that are not blocks.
 *
 * Spawn eggs carry `minecraft:entity_data`, so the 88 of them are one
 * behavior over a data table. Boats, rafts, minecarts, cushions, end
 * crystals, armor stands and paintings carry nothing, so their entity comes
 * off the identifier, which is the rule Bedrock's own `entity_placer`
 * component encodes.
 */
import type { ItemHooks } from '@jsprismarine/items';
import { entityData } from '@jsprismarine/items';

import type { ItemBehaviorSpec } from '../behavior';
import { consumeOne } from '../behavior';
import { stringField } from '../raw';
import type { BlockFace, BlockPosition, BlockReference } from '../world';

/** The face offsets a placement uses, which is the one direction table this package needs. */
export const FACE_OFFSETS: Readonly<Record<BlockFace, readonly [number, number, number]>> = {
    down: [0, -1, 0],
    up: [0, 1, 0],
    north: [0, 0, -1],
    south: [0, 0, 1],
    west: [-1, 0, 0],
    east: [1, 0, 0]
};

/** The position against a block's face. */
export const againstFace = (block: BlockReference, face: BlockFace): BlockPosition => {
    const [dx, dy, dz] = FACE_OFFSETS[face];
    return { x: block.position.x + dx, y: block.position.y + dy, z: block.position.z + dz };
};

/** The center of the cell beyond a block's face, where an entity fits. */
const spawnPositionAgainstFace = (block: BlockReference, face: BlockFace): BlockPosition => {
    const adjacent = againstFace(block, face);
    return { x: adjacent.x + 0.5, y: adjacent.y, z: adjacent.z + 0.5 };
};

/** Items whose entity is not simply the identifier with its suffix removed. */
const ENTITY_OVERRIDES: Readonly<Record<string, string>> = {
    'minecraft:minecart': 'minecraft:minecart',
    'minecraft:end_crystal': 'minecraft:end_crystal',
    'minecraft:armor_stand': 'minecraft:armor_stand',
    'minecraft:painting': 'minecraft:painting'
};

/**
 * The entity one placement item spawns.
 *
 * A boat, raft or minecart item names a variant and a base: `oak_chest_boat`
 * is a `chest_boat` carrying `oak`. Bedrock models that as one entity with a
 * variant, which is what this returns.
 */
export const placedEntityOf = (identifier: string): { readonly entity: string; readonly variant?: string } => {
    const override = ENTITY_OVERRIDES[identifier];
    if (override !== undefined) return { entity: override };

    const bare = identifier.replace(/^minecraft:/, '');
    for (const base of ['chest_boat', 'chest_raft', 'boat', 'raft', 'minecart', 'cushion']) {
        if (bare === base) return { entity: `minecraft:${base}` };
        if (bare.endsWith(`_${base}`)) {
            return { entity: `minecraft:${base}`, variant: bare.slice(0, -`_${base}`.length) };
        }
    }
    return { entity: identifier };
};

/** The 88 spawn eggs, which spawn what `minecraft:entity_data` names. */
export const spawnEggBehavior: ItemBehaviorSpec = {
    name: 'vanilla:spawn_egg',
    hooks: ['onUseOn'],
    create: (context) => {
        if (!('minecraft:entity_data' in context.components)) return {};

        const onUseOn: ItemHooks['onUseOn'] = ({ itemStack, source, block, blockFace }) => {
            const data = itemStack.params(entityData);
            const identifier = stringField(data, 'id');
            if (identifier === undefined) return undefined;

            context.world.perform({
                kind: 'spawn-entity',
                identifier,
                position: spawnPositionAgainstFace(block, blockFace),
                ...(data === undefined ? {} : { data })
            });
            return { stack: consumeOne(itemStack, context.world.stateOf(source).creative) };
        };

        return { onUseOn };
    }
};

/** Boats, rafts, minecarts, cushions, end crystals, armor stands and paintings. */
export const entityPlacementBehavior: ItemBehaviorSpec = {
    name: 'vanilla:entity_placement',
    hooks: ['onUseOn'],
    create: (context) => {
        const placed = placedEntityOf(context.identifier);

        const onUseOn: ItemHooks['onUseOn'] = ({ itemStack, source, block, blockFace }) => {
            context.world.perform({
                kind: 'spawn-entity',
                identifier: placed.entity,
                position: againstFace(block, blockFace),
                ...(placed.variant === undefined ? {} : { data: { variant: placed.variant } })
            });
            return { stack: consumeOne(itemStack, context.world.stateOf(source).creative) };
        };

        return { onUseOn };
    }
};

/**
 * A banner placed as a block, carrying its patterns.
 *
 * Bedrock keeps the banner's color in the item's damage value and its
 * patterns in NBT, and Java keeps both in `minecraft:banner_patterns` plus
 * the identifier. The placement hands the world both, and the block entity is
 * the world's to write.
 */
export const bannerBehavior: ItemBehaviorSpec = {
    name: 'vanilla:banner',
    hooks: ['onUseOn'],
    create: (context) => {
        const onUseOn: ItemHooks['onUseOn'] = ({ itemStack, source, block, blockFace }) => {
            const position = againstFace(block, blockFace);
            context.world.perform({
                kind: 'place-block',
                position,
                placement: {
                    identifier: blockFace === 'up' ? 'minecraft:standing_banner' : 'minecraft:wall_banner',
                    states: {}
                }
            });
            return { stack: consumeOne(itemStack, context.world.stateOf(source).creative) };
        };

        return { onUseOn };
    }
};

/** Every behavior this file declares. */
export const PLACEMENT_BEHAVIORS: readonly ItemBehaviorSpec[] = [
    spawnEggBehavior,
    entityPlacementBehavior,
    bannerBehavior
];
