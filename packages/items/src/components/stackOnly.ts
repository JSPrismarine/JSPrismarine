/**
 * The fifty-three data component types no Java 26.3 item carries as a default.
 * They only ever appear on an individual stack, written by a command, a
 * recipe result, a loot modifier or a villager trade.
 *
 * Twenty-eight of them are entity variant components, which all hold either a
 * registry id or an inline definition, so they share one parser.
 */
import { dataComponent } from './define';
import { bookPage, fireworkExplosion, itemStackReference } from './values';
import { bool, compound, either, identifier, int, listOf, object, text, textComponent } from '../schema';

/**
 * An entity variant: a registry id such as `minecraft:cold`, a bare enum name
 * such as `lucy`, or an inline definition a datapack supplied.
 */
const variant = either(identifier, compound);

/** A block predicate set, which is how `can_break` and `can_place_on` are written. */
const blockPredicateSet = either(listOf(compound), compound);

/** `minecraft:additional_trade_cost`: an extra item a villager trade asks for. */
export const additionalTradeCost = dataComponent(
    'minecraft:additional_trade_cost',
    either(itemStackReference, compound)
);

/** `minecraft:axolotl/variant`: the color of a bucketed axolotl. */
export const axolotlVariant = dataComponent('minecraft:axolotl/variant', variant);

/** `minecraft:base_color`: the background color of a shield's banner. */
export const baseColor = dataComponent('minecraft:base_color', text);

/** `minecraft:block_entity_data`: the block entity NBT a block item places with. */
export const blockEntityData = dataComponent('minecraft:block_entity_data', compound);

/** `minecraft:can_break`: the blocks the item may break in adventure mode. */
export const canBreak = dataComponent('minecraft:can_break', blockPredicateSet);

/** `minecraft:can_place_on`: the blocks the item may be placed against in adventure mode. */
export const canPlaceOn = dataComponent('minecraft:can_place_on', blockPredicateSet);

/** `minecraft:cat/collar`: the collar color of a cat the item references. */
export const catCollar = dataComponent('minecraft:cat/collar', text);

/** `minecraft:cat/sound_variant`: the sound set of a cat the item references. */
export const catSoundVariant = dataComponent('minecraft:cat/sound_variant', variant);

/** `minecraft:cat/variant`: the breed of a cat the item references. */
export const catVariant = dataComponent('minecraft:cat/variant', variant);

/** `minecraft:chicken/sound_variant`: the sound set of a chicken the item references. */
export const chickenSoundVariant = dataComponent('minecraft:chicken/sound_variant', variant);

/** `minecraft:container_loot`: the loot table a container item fills from when first opened. */
export const containerLoot = dataComponent(
    'minecraft:container_loot',
    object({ loot_table: identifier }, { seed: int() })
);

/** `minecraft:cow/sound_variant`: the sound set of a cow the item references. */
export const cowSoundVariant = dataComponent('minecraft:cow/sound_variant', variant);

/** `minecraft:cow/variant`: the breed of a cow the item references. */
export const cowVariant = dataComponent('minecraft:cow/variant', variant);

/** `minecraft:creative_slot_lock`: the stack cannot be moved out of its creative slot. */
export const creativeSlotLock = dataComponent('minecraft:creative_slot_lock', object({}));

/** `minecraft:custom_data`: arbitrary NBT a datapack attaches, never read by the game. */
export const customData = dataComponent('minecraft:custom_data', compound);

/** `minecraft:custom_model_data`: the numbers, flags, strings and colors a resource pack reads. */
export const customModelData = dataComponent(
    'minecraft:custom_model_data',
    object({}, { floats: listOf(int()), flags: listOf(bool), strings: listOf(text), colors: listOf(int()) })
);

/** `minecraft:custom_name`: the name an anvil or a command gave the stack. */
export const customName = dataComponent('minecraft:custom_name', textComponent);

/** `minecraft:dyed_color`: the packed RGB color of dyed leather armor. */
export const dyedColor = dataComponent('minecraft:dyed_color', either(int(), object({ rgb: int() })));

/** `minecraft:firework_explosion`: the single explosion of a firework star. */
export const fireworkExplosionComponent = dataComponent('minecraft:firework_explosion', fireworkExplosion);

/** `minecraft:fox/variant`: the coat of a fox the item references. */
export const foxVariant = dataComponent('minecraft:fox/variant', variant);

/** `minecraft:frog/variant`: the color of a frog the item references. */
export const frogVariant = dataComponent('minecraft:frog/variant', variant);

/** `minecraft:horse/variant`: the coat of a horse the item references. */
export const horseVariant = dataComponent('minecraft:horse/variant', variant);

/** `minecraft:intangible_projectile`: the arrow cannot be picked up again. */
export const intangibleProjectile = dataComponent('minecraft:intangible_projectile', object({}));

/** `minecraft:llama/variant`: the coat of a llama the item references. */
export const llamaVariant = dataComponent('minecraft:llama/variant', variant);

/** `minecraft:lock`: the key predicate a locked container checks the held item against. */
export const lock = dataComponent('minecraft:lock', either(text, compound));

/** `minecraft:lodestone_tracker`: where a lodestone compass points and whether it still tracks. */
export const lodestoneTracker = dataComponent(
    'minecraft:lodestone_tracker',
    object({}, { target: object({ pos: listOf(int()), dimension: identifier }), tracked: bool })
);

/** `minecraft:map_id`: which saved map the filled map shows. */
export const mapId = dataComponent('minecraft:map_id', int());

/** `minecraft:map_post_processing`: the lock or scale step applied the next time the map is used. */
export const mapPostProcessing = dataComponent('minecraft:map_post_processing', text);

/** `minecraft:mooshroom/variant`: the mushroom type of a mooshroom the item references. */
export const mooshroomVariant = dataComponent('minecraft:mooshroom/variant', variant);

/** `minecraft:note_block_sound`: the sound a note block plays with this head on top. */
export const noteBlockSound = dataComponent('minecraft:note_block_sound', identifier);

/** `minecraft:painting/variant`: which painting a painting item places. */
export const paintingVariant = dataComponent('minecraft:painting/variant', variant);

/** `minecraft:parrot/variant`: the color of a parrot the item references. */
export const parrotVariant = dataComponent('minecraft:parrot/variant', variant);

/** `minecraft:pig/sound_variant`: the sound set of a pig the item references. */
export const pigSoundVariant = dataComponent('minecraft:pig/sound_variant', variant);

/** `minecraft:pig/variant`: the breed of a pig the item references. */
export const pigVariant = dataComponent('minecraft:pig/variant', variant);

/** `minecraft:profile`: the player a head shows, by name, uuid or stored textures. */
export const profile = dataComponent(
    'minecraft:profile',
    either(text, object({}, { name: text, id: listOf(int()), properties: either(listOf(compound), compound) }))
);

/** `minecraft:rabbit/variant`: the coat of a rabbit the item references. */
export const rabbitVariant = dataComponent('minecraft:rabbit/variant', variant);

/** `minecraft:salmon/size`: the size of a bucketed salmon. */
export const salmonSize = dataComponent('minecraft:salmon/size', variant);

/** `minecraft:sheep/color`: the wool color of a sheep the item references. */
export const sheepColor = dataComponent('minecraft:sheep/color', text);

/** `minecraft:shulker/color`: the color of a shulker the item references. */
export const shulkerColor = dataComponent('minecraft:shulker/color', text);

/**
 * `minecraft:sulfur_cube_content`: what a sulfur cube holds.
 *
 * Added in 26.2 and carried by no vanilla item default and no vanilla data
 * file, so the shape is unverified against the pinned sources and the parser
 * accepts an identifier or a compound. It is listed in
 * {@link UNVERIFIED_SHAPE_COMPONENTS}.
 */
export const sulfurCubeContent = dataComponent('minecraft:sulfur_cube_content', either(identifier, compound));

/** `minecraft:tooltip_style`: the resource pack tooltip frame the client draws. */
export const tooltipStyle = dataComponent('minecraft:tooltip_style', identifier);

/** `minecraft:trim`: the armor trim material and pattern. */
export const trim = dataComponent(
    'minecraft:trim',
    object({ material: either(identifier, compound), pattern: either(identifier, compound) })
);

/** `minecraft:tropical_fish/base_color`: the body color of a bucketed tropical fish. */
export const tropicalFishBaseColor = dataComponent('minecraft:tropical_fish/base_color', text);

/** `minecraft:tropical_fish/pattern`: the pattern of a bucketed tropical fish. */
export const tropicalFishPattern = dataComponent('minecraft:tropical_fish/pattern', variant);

/** `minecraft:tropical_fish/pattern_color`: the pattern color of a bucketed tropical fish. */
export const tropicalFishPatternColor = dataComponent('minecraft:tropical_fish/pattern_color', text);

/** `minecraft:unbreakable`: the item spends no durability. */
export const unbreakable = dataComponent('minecraft:unbreakable', object({}));

/** `minecraft:villager/variant`: the biome outfit of a villager the item references. */
export const villagerVariant = dataComponent('minecraft:villager/variant', variant);

/**
 * `minecraft:waxed`: the item is waxed and no longer oxidizes.
 *
 * Added in 26.3 and carried by no vanilla item default and no vanilla data
 * file, so the shape is unverified; the parser accepts both the empty-unit
 * form and a boolean. Listed in {@link UNVERIFIED_SHAPE_COMPONENTS}.
 */
export const waxed = dataComponent('minecraft:waxed', either(object({}), bool));

/** `minecraft:wolf/collar`: the collar color of a wolf the item references. */
export const wolfCollar = dataComponent('minecraft:wolf/collar', text);

/** `minecraft:wolf/sound_variant`: the sound set of a wolf the item references. */
export const wolfSoundVariant = dataComponent('minecraft:wolf/sound_variant', variant);

/** `minecraft:wolf/variant`: the coat of a wolf the item references. */
export const wolfVariant = dataComponent('minecraft:wolf/variant', variant);

/** `minecraft:written_book_content`: the title, author and pages of a signed book. */
export const writtenBookContent = dataComponent(
    'minecraft:written_book_content',
    object(
        {},
        {
            title: either(text, object({ raw: text }, { filtered: text })),
            author: text,
            generation: int(0, 3),
            resolved: bool,
            pages: listOf(either(textComponent, bookPage))
        }
    )
);

/** `minecraft:zombie_nautilus/variant`: the variant of a zombie nautilus the item references. */
export const zombieNautilusVariant = dataComponent('minecraft:zombie_nautilus/variant', variant);

/**
 * The components whose value shape no pinned source confirms, because no
 * vanilla item default and no vanilla data file writes one. Their parsers are
 * deliberately wide, and a later data refresh that starts writing one should
 * tighten the parser and shorten this list.
 */
export const UNVERIFIED_SHAPE_COMPONENTS = ['minecraft:sulfur_cube_content', 'minecraft:waxed'] as const;

/** The fifty-three types that are never a default, in alphabetical order. */
export const STACK_ONLY_COMPONENTS = [
    additionalTradeCost,
    axolotlVariant,
    baseColor,
    blockEntityData,
    canBreak,
    canPlaceOn,
    catCollar,
    catSoundVariant,
    catVariant,
    chickenSoundVariant,
    containerLoot,
    cowSoundVariant,
    cowVariant,
    creativeSlotLock,
    customData,
    customModelData,
    customName,
    dyedColor,
    fireworkExplosionComponent,
    foxVariant,
    frogVariant,
    horseVariant,
    intangibleProjectile,
    llamaVariant,
    lock,
    lodestoneTracker,
    mapId,
    mapPostProcessing,
    mooshroomVariant,
    noteBlockSound,
    paintingVariant,
    parrotVariant,
    pigSoundVariant,
    pigVariant,
    profile,
    rabbitVariant,
    salmonSize,
    sheepColor,
    shulkerColor,
    sulfurCubeContent,
    tooltipStyle,
    trim,
    tropicalFishBaseColor,
    tropicalFishPattern,
    tropicalFishPatternColor,
    unbreakable,
    villagerVariant,
    waxed,
    wolfCollar,
    wolfSoundVariant,
    wolfVariant,
    writtenBookContent,
    zombieNautilusVariant
] as const;
