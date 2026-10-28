/**
 * The interactions neither edition publishes as data.
 *
 * Every family here is one of the roughly thirty the research counted as
 * engine behavior with no component: naming, leashing, dyeing, waxing,
 * glowing sign text, fertilizing, igniting and brushing. They are short
 * because each one is a decision and a world action, and the decision is the
 * only part worth writing down.
 */
import type { ItemHooks } from '@jsprismarine/items';
import { dye } from '@jsprismarine/items';

import type { ItemBehaviorSpec } from '../behavior';
import { consumeOne, spendItemDurability } from '../behavior';
import { againstFace } from './placement';

/** The blocks a honeycomb waxes, which is every unwaxed copper block and a sign. */
const WAXABLE_PREFIX = 'minecraft:';

/** Naming an entity, which also makes it persistent. */
export const nameTagBehavior: ItemBehaviorSpec = {
    name: 'vanilla:name_tag',
    hooks: ['onUse'],
    create: (context) => {
        const onUse: ItemHooks['onUse'] = ({ itemStack, source }) => {
            const target = context.world.targetOf(source);
            if (target === undefined) return undefined;

            const name = itemStack.get('minecraft:custom_name');
            if (typeof name !== 'string') return undefined;

            if (context.world.canNameEntity?.(target) === false) return undefined;
            context.world.perform({ kind: 'name-entity', target, name });
            return { stack: consumeOne(itemStack, context.world.stateOf(source).creative) };
        };

        return { onUse };
    }
};

/**
 * Leashing: a use on an entity ties the lead, and a use on a fence knots it.
 *
 * Both go through the same action, because the knot is an entity in Java and
 * the world is the thing that knows which of the two it just made.
 */
export const leadBehavior: ItemBehaviorSpec = {
    name: 'vanilla:lead',
    hooks: ['onUse', 'onUseOn'],
    create: (context) => {
        const onUse: ItemHooks['onUse'] = ({ source }) => {
            const target = context.world.targetOf(source);
            if (target === undefined) return undefined;
            context.world.perform({ kind: 'attach-lead', source, target });
            return {};
        };

        const onUseOn: ItemHooks['onUseOn'] = ({ block }) => {
            if (!context.world.includes({ kind: 'tag', tag: 'minecraft:fences' }, block.identifier)) return undefined;
            context.world.perform({
                kind: 'spawn-entity',
                identifier: 'minecraft:leash_knot',
                position: block.position
            });
            context.world.perform({
                kind: 'play-sound',
                sound: 'minecraft:entity.leash_knot.place',
                position: block.position
            });
            return {};
        };

        return { onUse, onUseOn };
    }
};

/** Dyeing a sheep, a collar, a harness or a sign, from `minecraft:dye`. */
export const dyeBehavior: ItemBehaviorSpec = {
    name: 'vanilla:dye',
    hooks: ['onUse'],
    create: (context) => {
        if (!('minecraft:dye' in context.components)) return {};

        const onUse: ItemHooks['onUse'] = ({ itemStack, source }) => {
            const target = context.world.targetOf(source);
            const color = itemStack.params(dye);
            if (target === undefined || color === undefined) return undefined;

            if (context.world.canDyeEntity?.(target, color) === false) return undefined;
            context.world.perform({ kind: 'dye-entity', target, color });
            return { stack: consumeOne(itemStack, context.world.stateOf(source).creative) };
        };

        return { onUse };
    }
};

/**
 * Waxing with a honeycomb.
 *
 * Which block a waxed one becomes is the copper family's table, so the
 * behavior asks the `minecraft:honeycomb` transformer for it rather than
 * carrying fifty-eight pairs of identifiers.
 */
export const waxingBehavior: ItemBehaviorSpec = {
    name: 'vanilla:waxing',
    hooks: ['onUseOn'],
    create: (context) => {
        const onUseOn: ItemHooks['onUseOn'] = ({ itemStack, source, block }) => {
            if (!block.identifier.startsWith(WAXABLE_PREFIX)) return undefined;
            const placement = context.world.transform('minecraft:honeycomb', block);
            if (placement === undefined) return undefined;

            context.world.perform({ kind: 'place-block', position: block.position, placement });
            context.world.perform({
                kind: 'play-sound',
                sound: 'minecraft:item.honeycomb.wax_on',
                position: block.position
            });
            return { stack: consumeOne(itemStack, context.world.stateOf(source).creative) };
        };

        return { onUseOn };
    }
};

/** Making sign text glow with a glow ink sac, or taking the glow back off with ink. */
export const signInkBehavior: ItemBehaviorSpec = {
    name: 'vanilla:sign_ink',
    hooks: ['onUseOn'],
    create: (context) => {
        const glowing = context.identifier === 'minecraft:glow_ink_sac';

        const onUseOn: ItemHooks['onUseOn'] = ({ itemStack, source, block }) => {
            if (!context.world.includes({ kind: 'tag', tag: 'minecraft:all_signs' }, block.identifier)) {
                return undefined;
            }

            context.world.perform({
                kind: 'place-block',
                position: block.position,
                placement: { identifier: block.identifier, states: { ...block.states } }
            });
            context.world.perform({
                kind: 'play-sound',
                sound: glowing ? 'minecraft:item.glow_ink_sac.use' : 'minecraft:item.ink_sac.use',
                position: block.position
            });
            return { stack: consumeOne(itemStack, context.world.stateOf(source).creative) };
        };

        return { onUseOn };
    }
};

/** Bone meal, whose outcome belongs to whatever it was used on. */
export const boneMealBehavior: ItemBehaviorSpec = {
    name: 'vanilla:bone_meal',
    hooks: ['onUseOn'],
    create: (context) => {
        const onUseOn: ItemHooks['onUseOn'] = ({ itemStack, source, block }) => {
            context.world.perform({ kind: 'fertilize', position: block.position });
            return { stack: consumeOne(itemStack, context.world.stateOf(source).creative) };
        };

        return { onUseOn };
    }
};

/**
 * Flint and steel and the fire charge.
 *
 * The same interaction with two costs: the steel spends a point of
 * durability, and the charge spends itself.
 */
export const fireStarterBehavior: ItemBehaviorSpec = {
    name: 'vanilla:fire_starter',
    hooks: ['onUseOn'],
    create: (context) => {
        const consumable = context.identifier === 'minecraft:fire_charge';

        const onUseOn: ItemHooks['onUseOn'] = ({ itemStack, source, block, blockFace }) => {
            context.world.perform({ kind: 'ignite', position: block.position, face: blockFace });
            context.world.perform({
                kind: 'play-sound',
                sound: consumable ? 'minecraft:item.firecharge.use' : 'minecraft:item.flintandsteel.use',
                position: againstFace(block, blockFace)
            });

            return consumable
                ? { stack: consumeOne(itemStack, context.world.stateOf(source).creative) }
                : { stack: spendItemDurability(context.world, itemStack, source, 1) };
        };

        return { onUseOn };
    }
};

/**
 * Brushing a suspicious block.
 *
 * The progress belongs to the block, which already tracks how far it has been
 * brushed. The item reports the stroke and spends a point on a finished one, which is
 * Java's `BrushItem.onUseTick` and the single point it spends on completion.
 */
export const brushBehavior: ItemBehaviorSpec = {
    name: 'vanilla:brush',
    hooks: ['onUseOn', 'onCompleteUse'],
    create: (context) => {
        const onUseOn: ItemHooks['onUseOn'] = ({ source, block }) => {
            context.world.perform({ kind: 'brush', source, position: block.position });
            return {};
        };

        const onCompleteUse: ItemHooks['onCompleteUse'] = ({ itemStack, source }) => ({
            stack: spendItemDurability(context.world, itemStack, source, 1)
        });

        return { onUseOn, onCompleteUse };
    }
};

/** Every behavior this file declares. */
export const INTERACTION_BEHAVIORS: readonly ItemBehaviorSpec[] = [
    nameTagBehavior,
    leadBehavior,
    dyeBehavior,
    waxingBehavior,
    signInkBehavior,
    boneMealBehavior,
    fireStarterBehavior,
    brushBehavior
];
