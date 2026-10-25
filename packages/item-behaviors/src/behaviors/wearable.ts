/**
 * Wearing things, and the two items whose whole behavior is being worn.
 *
 * `minecraft:equippable` covers 84 items in one component: armor, the carved
 * pumpkin, the seven heads, llama carpets, happy ghast harnesses, horse and
 * nautilus armor, wolf armor, the saddle, the shield and the elytra. The
 * component says which slot, which entities may wear it, whether a use swaps
 * it in, and whether an interaction puts it on something else, so one
 * behavior is all of them.
 *
 * The elytra and the totem keep no hook, because gliding and dying are not
 * item interactions. Both are server entry points instead:
 * {@link elytraDurabilityTick} and {@link deathProtectionOf}.
 */
import type { ItemHooks, ItemStack } from '@jsprismarine/items';
import { deathProtection, equippable, glider } from '@jsprismarine/items';

import type { BehaviorContext, ItemBehaviorSpec } from '../behavior';
import { consumeOne, rawComponent, spendItemDurability } from '../behavior';
import type { ConsumeEffect } from '../consumeEffects';
import { parseDeathEffects, runConsumeEffects } from '../consumeEffects';
import type { EquipmentSlot, ItemSource, WorldActions } from '../world';

/** The slots `minecraft:equippable` can name, as the world action takes them. */
const EQUIPMENT_SLOTS: ReadonlySet<string> = new Set<EquipmentSlot>([
    'any',
    'hand',
    'mainhand',
    'offhand',
    'armor',
    'head',
    'chest',
    'legs',
    'feet',
    'body',
    'saddle'
]);

/** Narrows a parsed slot name to the world action's slot type. */
const slotOf = (slot: string): EquipmentSlot | undefined =>
    // The set is built from the union's members, so a hit is one of them.
    EQUIPMENT_SLOTS.has(slot) ? (slot as EquipmentSlot) : undefined;

/**
 * Putting equipment on: either on the user, when the item is `swappable`, or
 * on the entity the use landed on, when it is `equip_on_interact` and the
 * entity is in `allowed_entities`.
 *
 * Java's `Item.use` reaches `Equippable.swapWithEquipmentSlot` for the first
 * and `Equippable.equipOnTarget` for the second, in that order, and so does
 * this.
 */
export const equippableBehavior: ItemBehaviorSpec = {
    name: 'vanilla:equippable',
    hooks: ['onUse'],
    create: (context) => {
        if (!('minecraft:equippable' in context.components)) return {};

        const onUse: ItemHooks['onUse'] = ({ itemStack, source }) => {
            const rules = itemStack.params(equippable);
            if (rules === undefined) return undefined;
            const slot = slotOf(rules.slot);
            if (slot === undefined) return undefined;

            const target = context.world.targetOf(source);
            if (target !== undefined) {
                if (rules.equip_on_interact !== true) return undefined;
                if (
                    rules.allowed_entities !== undefined &&
                    !context.world.includes(rules.allowed_entities, target.identifier)
                ) {
                    return undefined;
                }
                context.world.perform({ kind: 'equip', target, slot, item: itemStack.copy(1) });
                playEquipSound(context, rules.equip_sound, target);
                return { stack: consumeOne(itemStack, context.world.stateOf(source).creative) };
            }

            if (rules.swappable === false) return undefined;
            context.world.perform({ kind: 'equip', target: source, slot, item: itemStack.copy() });
            playEquipSound(context, rules.equip_sound, source);
            return {};
        };

        return { onUse };
    }
};

/** Plays `minecraft:equippable`'s own sound, which it writes as an id or an inline event. */
const playEquipSound = (context: BehaviorContext, sound: unknown, at: ItemSource): void => {
    if (typeof sound !== 'string') return;
    context.world.perform({ kind: 'play-sound', sound, position: context.world.stateOf(at).position });
};

/** How often a worn elytra costs a point of durability while gliding, in ticks. */
export const ELYTRA_DURABILITY_INTERVAL = 20;

/**
 * One tick of gliding, which costs the elytra a point of durability every
 * twenty ticks.
 *
 * A server entry point rather than a hook: gliding is a movement state the
 * engine tracks, and the hook table has no tick hook.
 *
 * @param tick - The glide's tick counter, so the caller decides the phase.
 * @returns The stack to keep in the chest slot.
 */
export const elytraDurabilityTick = (
    world: WorldActions,
    stack: ItemStack,
    source: ItemSource,
    tick: number
): ItemStack => {
    if (stack.params(glider) === undefined) return stack;
    if (tick % ELYTRA_DURABILITY_INTERVAL !== 0) return stack;
    return spendItemDurability(world, stack, source, 1);
};

/**
 * The effects a totem applies when it saves its holder, parsed from
 * `minecraft:death_protection.death_effects`.
 *
 * A server entry point rather than a hook, because the save happens on the
 * damage path: the engine finds a stack with the component in either hand,
 * calls this, applies the effects, and takes one off the stack.
 */
export const deathProtectionOf = (stack: ItemStack): readonly ConsumeEffect[] => {
    if (stack.params(deathProtection) === undefined) return [];
    return parseDeathEffects(rawComponent(stack, 'minecraft:death_protection'));
};

/**
 * Runs a totem's save: the effects, the sound, and one totem gone.
 *
 * @returns The stack to put back, which is one shorter.
 */
export const applyDeathProtection = (world: WorldActions, stack: ItemStack, source: ItemSource): ItemStack => {
    runConsumeEffects(deathProtectionOf(stack), source, world);
    world.perform({
        kind: 'play-sound',
        sound: 'minecraft:item.totem.use',
        position: world.stateOf(source).position
    });
    return stack.copy(stack.count - 1);
};

/** Every behavior this file declares. */
export const WEARABLE_BEHAVIORS: readonly ItemBehaviorSpec[] = [equippableBehavior];
