/**
 * Mining: the durability a tool spends, and the blocks a tool changes.
 *
 * The speed itself is not here. `miningSpeed` in `formulas.ts` is a pure
 * function the server calls while it decides how long a break takes, because
 * the hook table has no "how fast" hook and a formula is not an event.
 *
 * What is here is the part that happens when a block actually breaks or is
 * right-clicked: `Item.mineBlock`'s durability rule, and the
 * `minecraft:block_transformer` table that turns a log into a stripped log, a
 * grass block into a path and dirt into farmland.
 */
import type { ItemHooks } from '@jsprismarine/items';
import { blockTransformer } from '@jsprismarine/items';

import type { ItemBehaviorSpec } from '../behavior';
import { spendItemDurability } from '../behavior';
import { toolOf } from '../formulas';

/** The sound the axe, shovel and hoe transforms play, keyed by transformer. */
const TRANSFORM_SOUNDS: Readonly<Record<string, string>> = {
    'minecraft:axe': 'minecraft:item.axe.strip',
    'minecraft:shovel': 'minecraft:item.shovel.flatten',
    'minecraft:hoe': 'minecraft:item.hoe.till'
};

/**
 * The durability a tool spends on a broken block, which is `Item.mineBlock`:
 *
 * ```java
 * if (!level.isClientSide() && state.getDestroySpeed(level, pos) != 0.0F && tool.damagePerBlock() > 0) {
 *     itemStack.hurtAndBreak(tool.damagePerBlock(), owner, EquipmentSlot.MAINHAND);
 * }
 * ```
 *
 * A block with zero hardness costs nothing, which is why breaking tall grass
 * with a sword is free and breaking a cobweb with it is not.
 */
export const miningToolBehavior: ItemBehaviorSpec = {
    name: 'vanilla:mining_tool',
    hooks: ['onMineBlock'],
    create: (context) => {
        if (!('minecraft:tool' in context.components)) return {};

        const onMineBlock: ItemHooks['onMineBlock'] = ({ itemStack, source, block }) => {
            const damagePerBlock = toolOf(itemStack)?.damage_per_block ?? 1;
            if (damagePerBlock <= 0) return;
            if (context.world.hardnessOf(block) === 0) return;

            spendItemDurability(context.world, itemStack, source, damagePerBlock);
        };

        return { onMineBlock };
    }
};

/**
 * Stripping, pathing and tilling, from `minecraft:block_transformer`.
 *
 * 26.3 moved the whole table into the `block_transformer` registry, so the
 * item names a transformer and the world resolves what the block becomes.
 * The interaction is still code, which is this behavior; the mapping is data,
 * which is `WorldActions.transform`.
 */
export const blockTransformerBehavior: ItemBehaviorSpec = {
    name: 'vanilla:block_transformer',
    hooks: ['onUseOn'],
    create: (context) => {
        if (!('minecraft:block_transformer' in context.components)) return {};

        const onUseOn: ItemHooks['onUseOn'] = ({ itemStack, source, block }) => {
            const transformer = itemStack.params(blockTransformer);
            if (typeof transformer !== 'string') return undefined;

            const placement = context.world.transform(transformer, block);
            if (placement === undefined) return undefined;

            context.world.perform({ kind: 'place-block', position: block.position, placement });
            const sound = TRANSFORM_SOUNDS[transformer];
            if (sound !== undefined) {
                context.world.perform({ kind: 'play-sound', sound, position: block.position });
            }

            return { stack: spendItemDurability(context.world, itemStack, source, 1) };
        };

        return { onUseOn };
    }
};

/**
 * Shears on an entity: a sheep, a snow golem, a mooshroom, or a piece of
 * equipment marked `can_be_sheared`.
 *
 * Shearing a block, a beehive or a pumpkin is the block family's side of the
 * interaction; this is the entity side, which is the one no component in
 * either edition expresses.
 */
export const shearsBehavior: ItemBehaviorSpec = {
    name: 'vanilla:shears',
    hooks: ['onUse'],
    create: (context) => {
        const onUse: ItemHooks['onUse'] = ({ itemStack, source }) => {
            const target = context.world.targetOf(source);
            if (target === undefined) return undefined;

            context.world.perform({ kind: 'shear-entity', target });
            context.world.perform({
                kind: 'play-sound',
                sound: 'minecraft:mob.sheep.shear',
                position: context.world.stateOf(target).position
            });

            return { stack: spendItemDurability(context.world, itemStack, source, 1) };
        };

        return { onUse };
    }
};

/** Every behavior this file declares. */
export const MINING_BEHAVIORS: readonly ItemBehaviorSpec[] = [
    blockTransformerBehavior,
    shearsBehavior,
    miningToolBehavior
];
