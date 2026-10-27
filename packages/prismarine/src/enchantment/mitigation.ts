/**
 * What a blow meets on the way in, as the enchantment data states it.
 *
 * The damage pipeline used to take an Enchantment Protection Factor that was
 * a literal zero on every entity, so the Protection family did nothing however
 * good the armor was. This is the bridge that fills it in: live entity to
 * `EntityView`, live `DamageSource` to the Java damage type and its tags, worn
 * stacks to their `minecraft:enchantments`, and then
 * `EnchantmentRegistry.modifyValue` over the real `damage_protection`
 * components.
 *
 * It answers zero when the server built no content, which is the default. That
 * is the honest answer rather than a fallback table: with no pack stack there
 * are no enchantment definitions to run, and a hard-coded Protection curve
 * would be a second source of truth that a datapack could not change.
 */
import { damageProtectionOf } from './values';
import type { EnchantedDamageContext } from './values';
import type { ServerContent } from '../content/ServerContent';
import type { Item } from '../item/Item';
import { lootDamageSource } from '../entity/mobLoot';
import type { LootKill } from '../entity/mobLoot';
import { entityPredicateView } from '../entity/predicateView';
import type { ViewableEntity, ViewableEquipment } from '../entity/predicateView';

/** Everything the protection total is worked out from. */
export interface MitigationInput {
    /** The content build, or undefined when the server has none. */
    readonly content: ServerContent | undefined;
    /** Who is being hit, which is `this_entity` for every `damage_protection` condition. */
    readonly victim: ViewableEntity;
    /** What the victim is wearing and holding. */
    readonly equipment: ViewableEquipment;
    /** What hit them, which is what Fire Protection and Feather Falling branch on. */
    readonly source: LootKill;
}

/** The slots Java's `getDamageProtection` iterates, in its own order. */
const WORN_SLOTS = ['head', 'chest', 'legs', 'feet'] as const;

/**
 * The Enchantment Protection Factor of everything worn, against one blow.
 *
 * @returns The factor, which the damage formula caps at 20 out of 25.
 */
export const enchantmentProtection = (input: MitigationInput): number => {
    const registry = input.content?.enchantments;
    if (registry === undefined || input.content === undefined) return 0;

    const worn = WORN_SLOTS.map((slot) => input.equipment[slot]).filter(
        (stack): stack is Item => stack !== undefined && stack.getEnchantments().size > 0
    );
    if (worn.length === 0) return 0;

    const context = enchantedDamageContext(input);
    if (context === undefined) return 0;

    return damageProtectionOf(
        registry,
        worn.map((stack) => stack.asPredicateStack()),
        context
    );
};

/**
 * The `enchanted_damage` context one blow evaluates in.
 *
 * Undefined when the damage source has nothing on record, because the key set
 * requires `damage_source` and a condition that reads a missing required
 * parameter reports rather than quietly matching.
 */
export const enchantedDamageContext = (input: MitigationInput): EnchantedDamageContext | undefined => {
    if (input.content === undefined) return undefined;

    const damageSource = lootDamageSource(input.content, input.source);
    if (damageSource === undefined) return undefined;

    const entity = entityPredicateView(input.victim, {
        equipment: input.equipment,
        tags: input.content.tags
    });
    return { entity, damageSource };
};
