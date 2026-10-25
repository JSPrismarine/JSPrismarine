/**
 * Buckets and the other containers you fill from the world.
 *
 * Buckets are the clearest case of the plan's split. Java publishes
 * `minecraft:bucket_entity_data` for the seven mob buckets, so releasing a
 * bucketed fish is data; nothing in either edition publishes which block a
 * water bucket picks up, so that part is a table here.
 */
import type { ItemHooks, ItemStack } from '@jsprismarine/items';
import { bucketEntityData } from '@jsprismarine/items';

import type { BehaviorContext, ItemBehaviorSpec } from '../behavior';
import type { BlockPosition, BlockReference, ItemSource } from '../world';

/** What an empty bucket picks each block up as, and the sound it makes. */
export const BUCKET_PICKUPS: Readonly<Record<string, { readonly item: string; readonly sound: string }>> = {
    'minecraft:water': { item: 'minecraft:water_bucket', sound: 'minecraft:item.bucket.fill' },
    'minecraft:flowing_water': { item: 'minecraft:water_bucket', sound: 'minecraft:item.bucket.fill' },
    'minecraft:lava': { item: 'minecraft:lava_bucket', sound: 'minecraft:item.bucket.fill_lava' },
    'minecraft:flowing_lava': { item: 'minecraft:lava_bucket', sound: 'minecraft:item.bucket.fill_lava' },
    'minecraft:powder_snow': {
        item: 'minecraft:powder_snow_bucket',
        sound: 'minecraft:item.bucket.fill_powder_snow'
    }
};

/**
 * What a filled bucket puts down, and the sound it makes.
 *
 * Keyed by Bedrock identifier, which `registry.test.ts` checks against the
 * item table.
 */
export const BUCKET_CONTENTS: Readonly<Record<string, { readonly block: string; readonly sound: string }>> = {
    'minecraft:water_bucket': { block: 'minecraft:water', sound: 'minecraft:item.bucket.empty' },
    'minecraft:lava_bucket': { block: 'minecraft:lava', sound: 'minecraft:item.bucket.empty_lava' },
    'minecraft:powder_snow_bucket': {
        block: 'minecraft:powder_snow',
        sound: 'minecraft:item.bucket.empty_powder_snow'
    }
};

/** What a mob bucket pours out with the entity, keyed by the bucket. */
const MOB_BUCKET_FLUIDS: Readonly<Record<string, string>> = {
    'minecraft:powder_snow_bucket': 'minecraft:powder_snow'
};

/** Where a placement goes: into the block when it is replaceable, otherwise against the face. */
const placementPosition = (block: BlockReference, face: string): BlockPosition => {
    const offsets: Readonly<Record<string, readonly [number, number, number]>> = {
        down: [0, -1, 0],
        up: [0, 1, 0],
        north: [0, 0, -1],
        south: [0, 0, 1],
        west: [-1, 0, 0],
        east: [1, 0, 0]
    };
    const [dx, dy, dz] = offsets[face] ?? [0, 1, 0];
    return { x: block.position.x + dx, y: block.position.y + dy, z: block.position.z + dz };
};

/** Replaces the held bucket with another item, or with nothing when the holder is creative. */
const swapHeld = (
    context: BehaviorContext,
    stack: ItemStack,
    source: ItemSource,
    identifier: string
): ItemStack | undefined => {
    const creative = context.world.stateOf(source).creative;
    if (creative) return stack.copy();

    const replacement = context.items.create(identifier);
    if (replacement === undefined) return undefined;
    if (stack.count <= 1) return replacement;

    context.world.perform({ kind: 'give-item', source, item: replacement });
    return stack.copy(stack.count - 1);
};

/**
 * Filling and emptying a bucket.
 *
 * An empty bucket on a source block takes it; a filled one puts its contents
 * against the face it was used on. Java's rule for which side the fluid lands
 * on is "inside the block when it is replaceable, otherwise against the
 * face"; the world decides replaceability, so this asks it for the block.
 */
export const bucketBehavior: ItemBehaviorSpec = {
    name: 'vanilla:bucket',
    hooks: ['onUseOn'],
    create: (context) => {
        const contents = BUCKET_CONTENTS[context.identifier];
        const pickup = context.identifier === 'minecraft:bucket';
        if (!pickup && contents === undefined) return {};

        const onUseOn: ItemHooks['onUseOn'] = ({ itemStack, source, block, blockFace }) => {
            if (contents === undefined) {
                const filled = BUCKET_PICKUPS[block.identifier];
                if (filled === undefined) return undefined;

                context.world.perform({ kind: 'break-block', position: block.position });
                context.world.perform({ kind: 'play-sound', sound: filled.sound, position: block.position });
                const swapped = swapHeld(context, itemStack, source, filled.item);
                return swapped === undefined ? undefined : { stack: swapped };
            }

            const position = placementPosition(block, blockFace);
            context.world.perform({
                kind: 'place-block',
                position,
                placement: { identifier: contents.block, states: {} }
            });
            context.world.perform({ kind: 'play-sound', sound: contents.sound, position });
            const swapped = swapHeld(context, itemStack, source, 'minecraft:bucket');
            return swapped === undefined ? undefined : { stack: swapped };
        };

        return { onUseOn };
    }
};

/**
 * Pouring a mob bucket out: the water goes down and the entity comes out with
 * the data the bucket stored, which is variant, name and tropical fish
 * pattern.
 */
export const mobBucketBehavior: ItemBehaviorSpec = {
    name: 'vanilla:mob_bucket',
    hooks: ['onUseOn'],
    create: (context) => {
        if (!('minecraft:bucket_entity_data' in context.components)) return {};

        const onUseOn: ItemHooks['onUseOn'] = ({ itemStack, source, block, blockFace }) => {
            const position = placementPosition(block, blockFace);
            const fluid = MOB_BUCKET_FLUIDS[context.identifier] ?? 'minecraft:water';
            context.world.perform({ kind: 'place-block', position, placement: { identifier: fluid, states: {} } });

            const data = itemStack.params(bucketEntityData);
            context.world.perform({
                kind: 'spawn-entity',
                identifier: entityOfBucket(context.identifier),
                position,
                ...(data === undefined ? {} : { data })
            });
            context.world.perform({ kind: 'play-sound', sound: 'minecraft:item.bucket.empty_fish', position });

            const swapped = swapHeld(context, itemStack, source, 'minecraft:bucket');
            return swapped === undefined ? undefined : { stack: swapped };
        };

        return { onUseOn };
    }
};

/**
 * The entity behind a mob bucket's identifier.
 *
 * Java names the item after the mob (`cod_bucket` holds a `cod`), so the
 * identifier is the mapping and no table is needed. The one exception is the
 * tadpole, which is also named after its mob, so the rule is total.
 */
export const entityOfBucket = (identifier: string): string => identifier.replace(/_bucket$/, '');

/**
 * Filling a glass bottle or a bowl from the world.
 *
 * Both are "use on something and get a different item", and what you get
 * depends on what you used it on, which is the block family's knowledge. The
 * behavior asks for the block and maps the three vanilla cases.
 */
export const fillableBehavior: ItemBehaviorSpec = {
    name: 'vanilla:fillable',
    hooks: ['onUseOn'],
    create: (context) => {
        const fills: Readonly<Record<string, Readonly<Record<string, string>>>> = {
            'minecraft:glass_bottle': {
                'minecraft:water': 'minecraft:potion',
                'minecraft:water_cauldron': 'minecraft:potion',
                'minecraft:beehive': 'minecraft:honey_bottle',
                'minecraft:bee_nest': 'minecraft:honey_bottle'
            },
            'minecraft:bowl': {}
        };
        const table = fills[context.identifier];
        if (table === undefined) return {};

        const onUseOn: ItemHooks['onUseOn'] = ({ itemStack, source, block }) => {
            const filled = table[block.identifier];
            if (filled === undefined) return undefined;

            context.world.perform({
                kind: 'play-sound',
                sound: 'minecraft:item.bottle.fill',
                position: block.position
            });
            const swapped = swapHeld(context, itemStack, source, filled);
            return swapped === undefined ? undefined : { stack: swapped };
        };

        return { onUseOn };
    }
};

/** Every behavior this file declares. */
export const FLUID_BEHAVIORS: readonly ItemBehaviorSpec[] = [mobBucketBehavior, bucketBehavior, fillableBehavior];
