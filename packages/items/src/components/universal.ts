/**
 * The thirteen data component types Java 26.3 gives every one of its 1658
 * items a default for, measured from `reports/minecraft/components/item/`.
 *
 * They are split out from the rest of the catalog because they are the only
 * ones a resolved item type can read without checking whether the item has
 * them, which is what makes the flattened fact table in `facts.ts` total.
 */
import { dataComponent } from './define';
import { animation, attributeModifier, enchantmentLevels, textComponentList } from './values';
import { bool, float, identifier, int, listOf, literalOf, object, text, textComponent } from '../schema';

/** The four rarities Java ranks an item by, which colors its name in the tooltip. */
export const RARITIES = ['common', 'uncommon', 'rare', 'epic'] as const;

/** `minecraft:attack_animation`: the swing the client plays for an attack. */
export const attackAnimation = dataComponent('minecraft:attack_animation', animation);

/** `minecraft:attribute_modifiers`: the attribute changes the item applies while held or worn. */
export const attributeModifiers = dataComponent('minecraft:attribute_modifiers', listOf(attributeModifier));

/** `minecraft:break_sound`: the sound event for the item breaking from durability loss. */
export const breakSound = dataComponent('minecraft:break_sound', identifier);

/** `minecraft:enchantments`: the enchantments on the stack, as a level per enchantment id. */
export const enchantments = dataComponent('minecraft:enchantments', enchantmentLevels);

/** `minecraft:interact_animation`: the swing the client plays for a non-attack interaction. */
export const interactAnimation = dataComponent('minecraft:interact_animation', animation);

/** `minecraft:item_model`: the model id the client draws the item with. */
export const itemModel = dataComponent('minecraft:item_model', identifier);

/** `minecraft:item_name`: the item's own name, below a `custom_name` when one is set. */
export const itemName = dataComponent('minecraft:item_name', textComponent);

/** `minecraft:lore`: the extra tooltip lines below the name. */
export const lore = dataComponent('minecraft:lore', textComponentList);

/** `minecraft:max_stack_size`: how many of the item one slot holds, 1 to 99. */
export const maxStackSize = dataComponent('minecraft:max_stack_size', int(1, 99));

/** `minecraft:rarity`: one of {@link RARITIES}. */
export const rarity = dataComponent('minecraft:rarity', literalOf(RARITIES));

/** `minecraft:repair_cost`: the accumulated anvil cost, in levels. */
export const repairCost = dataComponent('minecraft:repair_cost', int(0));

/** `minecraft:tooltip_display`: which parts of the tooltip the client hides. */
export const tooltipDisplay = dataComponent(
    'minecraft:tooltip_display',
    object({}, { hide_tooltip: bool, hidden_components: listOf(identifier) })
);

/** `minecraft:use_effects`: how using the item changes the holder's movement and vibrations. */
export const useEffects = dataComponent(
    'minecraft:use_effects',
    object({}, { can_sprint: bool, interact_vibrations: bool, speed_multiplier: float, sound: text })
);

/**
 * The thirteen components every Java item carries, in the order the report
 * writes them.
 */
export const UNIVERSAL_COMPONENTS = [
    attackAnimation,
    attributeModifiers,
    breakSound,
    enchantments,
    interactAnimation,
    itemModel,
    itemName,
    lore,
    maxStackSize,
    rarity,
    repairCost,
    tooltipDisplay,
    useEffects
] as const;
