/**
 * What an experience orb repairs before it pays out, transcribed from Java 26.3's
 * `ExperienceOrb.repairPlayerItems`.
 *
 * Nothing here names Mending. A stack qualifies when one of its enchantments declares the
 * `repair_with_xp` effect for the slot it is in and the stack is damaged; that effect turns the
 * orb's points into durability (Mending's file multiplies them by 2), and the points the repair
 * did not use go on to the next pick.
 */
import type { EnchantmentRegistry, EquipmentSlotName } from '@jsprismarine/enchantments';
import { enchantmentsOf, slotGroupContains } from '@jsprismarine/enchantments';

import type { Item } from '../item/Item';

/** The order Java's `EquipmentSlot.values()` visits a player's slots in. */
export const REPAIR_SLOTS = [
    'mainhand',
    'offhand',
    'feet',
    'legs',
    'chest',
    'head'
] as const satisfies readonly EquipmentSlotName[];

/** One of {@link REPAIR_SLOTS}. */
export type RepairSlot = (typeof REPAIR_SLOTS)[number];

/** What an orb's points did to a player's gear. */
export interface ExperienceRepair {
    /** The points left for the player's experience. */
    readonly remaining: number;
    /** Each stack that was repaired, by slot, as it now is. */
    readonly repaired: ReadonlyMap<RepairSlot, Item>;
}

const isDamaged = (item: Item): boolean =>
    item.getMaxDurability() > 0 && item.getDurability() < item.getMaxDurability();

/**
 * Spends an orb's points on the player's damaged gear whose enchantments repair with experience,
 * Java's `repairPlayerItems`: a random pick among every such stack and enchantment, the points
 * turned into durability by the stack's `repair_with_xp` effects, and what the repair left over
 * spent on the next pick. A pick that repairs nothing uses up every point, as Java's does.
 *
 * @param registry - The enchantment definitions, which declare `repair_with_xp`.
 * @param gear - What the player has in each slot.
 * @param points - The orb's points.
 * @param randomInt - Draws an integer in [0, bound), the player's random in Java.
 */
export const repairWithExperience = (
    registry: EnchantmentRegistry,
    gear: Readonly<Partial<Record<RepairSlot, Item | null>>>,
    points: number,
    randomInt: (bound: number) => number
): ExperienceRepair => {
    const current = new Map<RepairSlot, Item>();
    for (const slot of REPAIR_SLOTS) {
        const item = gear[slot];
        if (item !== undefined && item !== null) current.set(slot, item);
    }
    const repaired = new Map<RepairSlot, Item>();
    let left = points;

    while (left > 0) {
        // Java's `EnchantmentHelper.getRandomItemWith` lists a stack once for every enchantment on
        // it that declares the effect for its slot.
        const candidates: RepairSlot[] = [];
        for (const [slot, item] of current) {
            if (!isDamaged(item)) continue;
            for (const id of enchantmentsOf(item.asPredicateStack()).keys()) {
                const definition = registry.get(id);
                if (
                    definition?.effects.has('repair_with_xp') === true &&
                    definition.slots.some((group) => slotGroupContains(group, slot))
                )
                    candidates.push(slot);
            }
        }
        if (candidates.length === 0) break;

        const slot = candidates[randomInt(candidates.length)]!;
        const item = current.get(slot)!;
        const stack = item.asPredicateStack();
        const durability = Math.trunc(
            registry.modifyValue('repair_with_xp', left, {
                enchantments: enchantmentsOf(stack),
                context: { parameters: { tool: stack } }
            })
        );
        const repair = Math.min(durability, item.getMaxDurability() - item.getDurability());
        const fixed = item.withDurability(item.getDurability() + repair);
        current.set(slot, fixed);
        repaired.set(slot, fixed);
        if (repair <= 0) return { remaining: 0, repaired };
        left -= Math.trunc((repair * left) / durability);
        if (left <= 0) return { remaining: 0, repaired };
    }
    return { remaining: left, repaired };
};
