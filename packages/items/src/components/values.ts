/**
 * The value shapes several item data component types share, parsed once here
 * so the component catalog stays one line per component name.
 *
 * Every shape is checked against Java 26.3's own
 * `reports/minecraft/components/item/` output; the corpus test in
 * `components/catalog.test.ts` reparses all 1658 files to keep them honest.
 */
import type { Parser } from '../schema';
import {
    bool,
    compound,
    float,
    holderSet,
    identifier,
    int,
    json,
    listOf,
    literalOf,
    mapOf,
    object,
    text,
    textComponent
} from '../schema';

/** Where an attribute modifier or a piece of equipment sits. */
export const EQUIPMENT_SLOTS = [
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
] as const;

/** One of {@link EQUIPMENT_SLOTS}. */
export const equipmentSlot = literalOf(EQUIPMENT_SLOTS);

/** How an attribute modifier combines with the base value. */
export const attributeOperation = literalOf(['add_value', 'add_multiplied_base', 'add_multiplied_total'] as const);

/** One entry of `minecraft:attribute_modifiers`. */
export const attributeModifier = object(
    { type: identifier, amount: float, id: identifier, operation: attributeOperation },
    { slot: equipmentSlot, display: compound }
);

/** One entry of `minecraft:tool`'s rule list: a block set with a mining speed and a drop flag. */
export const toolRule = object({ blocks: holderSet }, { speed: float, correct_for_drops: bool });

/**
 * One consume effect, the tagged union `minecraft:consumable` and
 * `minecraft:death_protection` both carry.
 *
 * Only the discriminator is parsed here. The five effect types are the
 * behavior layer's to run, and parsing their fields in this package would put
 * potion and teleport rules in the component that merely names them.
 */
export const consumeEffect = object({ type: identifier }, { probability: float });

/** An item stack as a component writes one: an identifier, a count, and its own component patch. */
export const itemStackReference = object({ id: identifier }, { count: int(1, 99), components: compound });

/** A swing or interact animation: an animation name and how many ticks it runs. */
export const animation = object({}, { type: text, duration: int(0) });

/** An inclusive numeric range, written as a pair of bounds. */
export const range = object({}, { min: float, max: float });

/** How much durability an action spends, as `minecraft:blocks_attacks` writes it. */
export const itemDamageFunction = object({}, { threshold: float, base: float, factor: float });

/** One entry of `minecraft:blocks_attacks`'s damage reduction list. */
export const damageReduction = object(
    {},
    { type: holderSet, base: float, factor: float, horizontal_blocking_angle: float }
);

/** An enchantment level map, which is how 26.3 writes both enchantment components. */
export const enchantmentLevels: Parser<Record<string, number>> = mapOf(int(0, 255));

/** A list of text components, which is how `minecraft:lore` writes its lines. */
export const textComponentList = listOf(textComponent);

/** A firework explosion shape. */
export const fireworkExplosion = object(
    { shape: text },
    { colors: listOf(int()), fade_colors: listOf(int()), has_trail: bool, has_twinkle: bool }
);

/** A written or writable book page: raw text plus an optional filtered replacement. */
export const bookPage = object({ raw: text }, { filtered: text });

/** The sign text one face of a sign item carries. */
export const signText = object({}, { messages: listOf(textComponent), color: text, has_glowing_text: bool });

/** A block position written as a three-number list. */
export const blockPos = listOf(int());

/** An opaque JSON value, for a component this package carries without reading. */
export const opaque = json;
