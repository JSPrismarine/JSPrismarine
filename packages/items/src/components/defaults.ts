/**
 * The fifty-six data component types that appear as a default on some but not
 * all of Java 26.3's 1658 items. With the thirteen in `universal.ts` they are
 * the sixty-nine types vanilla item definitions actually use, measured from
 * `reports/minecraft/components/item/`.
 *
 * A component whose only vanilla default is an empty object or an empty list
 * still gets its documented shape, with every field optional, because recipes,
 * loot and commands write the full form onto a stack.
 */
import { dataComponent } from './define';
import {
    bookPage,
    consumeEffect,
    damageReduction,
    enchantmentLevels,
    equipmentSlot,
    fireworkExplosion,
    itemDamageFunction,
    itemStackReference,
    signText,
    toolRule
} from './values';
import {
    bool,
    compound,
    either,
    float,
    holderSet,
    identifier,
    int,
    listOf,
    mapOf,
    numberSource,
    object,
    text
} from '../schema';

/** `minecraft:attack_range`: the reach and hitbox margin an attack with the item uses. */
export const attackRange = dataComponent(
    'minecraft:attack_range',
    object(
        {},
        {
            min_reach: float,
            max_reach: float,
            min_creative_reach: float,
            max_creative_reach: float,
            hitbox_margin: float,
            mob_factor: float
        }
    )
);

/** `minecraft:banner_patterns`: the layers a banner or shield draws, outermost last. */
export const bannerPatterns = dataComponent(
    'minecraft:banner_patterns',
    listOf(object({}, { pattern: either(identifier, compound), color: text }))
);

/** `minecraft:bees`: the bees inside a beehive or bee nest item. */
export const bees = dataComponent(
    'minecraft:bees',
    listOf(object({}, { entity_data: compound, ticks_in_hive: int(0), min_ticks_in_hive: int(0) }))
);

/** `minecraft:block_state`: the block state values a block item places with. */
export const blockState = dataComponent('minecraft:block_state', mapOf(text));

/** `minecraft:block_transformer`: the transformation the item performs, such as stripping or tilling. */
export const blockTransformer = dataComponent('minecraft:block_transformer', either(identifier, compound));

/** `minecraft:blocks_attacks`: the shield rules, from the block delay to what bypasses it. */
export const blocksAttacks = dataComponent(
    'minecraft:blocks_attacks',
    object(
        {},
        {
            block_delay_seconds: float,
            disable_cooldown_scale: float,
            damage_reductions: listOf(damageReduction),
            item_damage: itemDamageFunction,
            bypassed_by: holderSet,
            block_sound: identifier,
            disabled_sound: identifier
        }
    )
);

/** `minecraft:brewing_fuel`: how many brews the item powers and how fast. */
export const brewingFuel = dataComponent(
    'minecraft:brewing_fuel',
    object({}, { uses: numberSource, speed_multiplier: numberSource })
);

/** `minecraft:bucket_entity_data`: the entity a filled bucket releases. */
export const bucketEntityData = dataComponent('minecraft:bucket_entity_data', compound);

/** `minecraft:bundle_contents`: the stacks inside a bundle, in insertion order. */
export const bundleContents = dataComponent('minecraft:bundle_contents', listOf(itemStackReference));

/** `minecraft:charged_projectiles`: the projectiles a drawn crossbow holds. */
export const chargedProjectiles = dataComponent('minecraft:charged_projectiles', listOf(itemStackReference));

/** `minecraft:chicken/variant`: the chicken an egg hatches. */
export const chickenVariant = dataComponent('minecraft:chicken/variant', either(identifier, compound));

/** `minecraft:compostable`: how many composter layers the item adds, by provider reference. */
export const compostable = dataComponent('minecraft:compostable', object({}, { layers: numberSource }));

/** `minecraft:consumable`: how long eating or drinking takes and what it does at the end. */
export const consumable = dataComponent(
    'minecraft:consumable',
    object(
        {},
        {
            consume_seconds: float,
            animation: text,
            sound: either(identifier, compound),
            has_consume_particles: bool,
            on_consume_effects: listOf(consumeEffect)
        }
    )
);

/** `minecraft:container`: the stacks inside a shulker box or other container item. */
export const container = dataComponent(
    'minecraft:container',
    listOf(object({}, { slot: int(0), item: itemStackReference }))
);

/** `minecraft:cooking_fuel`: furnace burn time and speed, by provider reference. */
export const cookingFuel = dataComponent(
    'minecraft:cooking_fuel',
    object({}, { burn_time: numberSource, speed_multiplier: numberSource })
);

/** `minecraft:cushion/color`: the dye color of a cushion item. */
export const cushionColor = dataComponent('minecraft:cushion/color', text);

/** `minecraft:damage`: the durability already spent, counting up to `max_damage`. */
export const damage = dataComponent('minecraft:damage', int(0));

/** `minecraft:damage_resistant`: the damage types the item survives as a dropped entity. */
export const damageResistant = dataComponent('minecraft:damage_resistant', object({ types: holderSet }));

/** `minecraft:damage_type`: the damage type an attack with the item deals. */
export const damageType = dataComponent('minecraft:damage_type', identifier);

/** `minecraft:death_protection`: the totem effect, as the effects applied on the save. */
export const deathProtection = dataComponent(
    'minecraft:death_protection',
    object({}, { death_effects: listOf(consumeEffect) })
);

/** `minecraft:debug_stick_state`: the property the debug stick currently edits per block. */
export const debugStickState = dataComponent('minecraft:debug_stick_state', compound);

/** `minecraft:dye`: the dye color the item applies. */
export const dye = dataComponent('minecraft:dye', text);

/** `minecraft:enchantable`: the enchanting power the item brings to the table. */
export const enchantable = dataComponent('minecraft:enchantable', object({ value: int(0) }));

/** `minecraft:enchantment_glint_override`: forces the glint on or off regardless of enchantments. */
export const enchantmentGlintOverride = dataComponent('minecraft:enchantment_glint_override', bool);

/** `minecraft:entity_data`: the entity a spawn egg spawns, with its own NBT. */
export const entityData = dataComponent('minecraft:entity_data', compound);

/** `minecraft:equippable`: the slot the item goes in and how it equips. */
export const equippable = dataComponent(
    'minecraft:equippable',
    object(
        { slot: equipmentSlot },
        {
            equip_sound: either(identifier, compound),
            asset_id: identifier,
            camera_overlay: identifier,
            allowed_entities: holderSet,
            dispensable: bool,
            swappable: bool,
            damage_on_hurt: bool,
            equip_on_interact: bool,
            can_be_sheared: bool,
            shearing_sound: either(identifier, compound)
        }
    )
);

/** `minecraft:fireworks`: the flight duration and explosions of a firework rocket. */
export const fireworks = dataComponent(
    'minecraft:fireworks',
    object({}, { flight_duration: int(0, 255), explosions: listOf(fireworkExplosion) })
);

/** `minecraft:food`: the nutrition and saturation eating the item restores. */
export const food = dataComponent(
    'minecraft:food',
    object({ nutrition: int(0), saturation: float }, { can_always_eat: bool })
);

/** `minecraft:glider`: the item lets the wearer glide, which is the elytra's whole data side. */
export const glider = dataComponent('minecraft:glider', object({}));

/** `minecraft:instrument`: the goat horn sound the item plays. */
export const instrument = dataComponent('minecraft:instrument', either(identifier, compound));

/** `minecraft:jukebox_playable`: the song a jukebox plays for the item. */
export const jukeboxPlayable = dataComponent('minecraft:jukebox_playable', either(identifier, compound));

/** `minecraft:kinetic_weapon`: the mounted charge rules a spear uses. */
export const kineticWeapon = dataComponent(
    'minecraft:kinetic_weapon',
    object(
        {},
        {
            damage_multiplier: float,
            damage_modifier: float,
            delay_ticks: int(0),
            forward_movement: float,
            hit_sound: either(identifier, compound),
            damage_conditions: compound,
            knockback_conditions: compound,
            dismount_conditions: compound
        }
    )
);

/** `minecraft:map_decorations`: the markers drawn on a filled map. */
export const mapDecorations = dataComponent('minecraft:map_decorations', compound);

/** `minecraft:max_damage`: the durability the item has before it breaks. */
export const maxDamage = dataComponent('minecraft:max_damage', int(1));

/** `minecraft:minimum_attack_charge`: the fraction of the attack cooldown an attack needs. */
export const minimumAttackCharge = dataComponent('minecraft:minimum_attack_charge', float);

/** `minecraft:mob_visibility`: how visible holding the item makes the holder to a mob. */
export const mobVisibility = dataComponent(
    'minecraft:mob_visibility',
    object({}, { targeting_entity_types: holderSet, visibility: float })
);

/** `minecraft:ominous_bottle_amplifier`: the bad omen level the bottle gives. */
export const ominousBottleAmplifier = dataComponent('minecraft:ominous_bottle_amplifier', int(0, 4));

/** `minecraft:piercing_weapon`: the attack and hit sounds of a piercing weapon. */
export const piercingWeapon = dataComponent(
    'minecraft:piercing_weapon',
    object({}, { sound: either(identifier, compound), hit_sound: either(identifier, compound) })
);

/** `minecraft:pot_decorations`: the four sherds of a decorated pot item. */
export const potDecorations = dataComponent(
    'minecraft:pot_decorations',
    either(
        listOf(identifier),
        object(
            {},
            { back: itemStackReference, front: itemStackReference, left: itemStackReference, right: itemStackReference }
        )
    )
);

/** `minecraft:potion_contents`: the potion, custom color and extra effects of a potion item. */
export const potionContents = dataComponent(
    'minecraft:potion_contents',
    object(
        {},
        {
            potion: identifier,
            custom_color: int(),
            custom_name: text,
            custom_effects: listOf(object({ id: identifier }, { duration: int(), amplifier: int(), show_icon: bool }))
        }
    )
);

/** `minecraft:potion_duration_scale`: multiplies the duration of every effect the item applies. */
export const potionDurationScale = dataComponent('minecraft:potion_duration_scale', float);

/** `minecraft:provides_banner_patterns`: the banner patterns the item unlocks in a loom. */
export const providesBannerPatterns = dataComponent('minecraft:provides_banner_patterns', holderSet);

/** `minecraft:provides_pottery_pattern`: the sherd pattern the item contributes to a pot. */
export const providesPotteryPattern = dataComponent('minecraft:provides_pottery_pattern', identifier);

/** `minecraft:provides_trim_material`: the armor trim material the item provides. */
export const providesTrimMaterial = dataComponent('minecraft:provides_trim_material', either(identifier, compound));

/** `minecraft:recipes`: the recipes a recipe book item unlocks. */
export const recipes = dataComponent('minecraft:recipes', listOf(identifier));

/** `minecraft:repairable`: the items that repair this one on an anvil. */
export const repairable = dataComponent('minecraft:repairable', object({ items: holderSet }));

/** `minecraft:sign_text_back`: the text on the back face of a sign item. */
export const signTextBack = dataComponent('minecraft:sign_text_back', signText);

/** `minecraft:sign_text_front`: the text on the front face of a sign item. */
export const signTextFront = dataComponent('minecraft:sign_text_front', signText);

/** `minecraft:stored_enchantments`: the enchantments an enchanted book carries without applying. */
export const storedEnchantments = dataComponent('minecraft:stored_enchantments', enchantmentLevels);

/** `minecraft:suspicious_stew_effects`: the effects eating the stew applies. */
export const suspiciousStewEffects = dataComponent(
    'minecraft:suspicious_stew_effects',
    listOf(object({ id: identifier }, { duration: int() }))
);

/** `minecraft:tool`: the mining rules, per block set, that make the item a tool. */
export const tool = dataComponent(
    'minecraft:tool',
    object(
        { rules: listOf(toolRule) },
        { default_mining_speed: float, damage_per_block: int(0), can_destroy_blocks_in_creative: bool }
    )
);

/** `minecraft:use_cooldown`: the cooldown using the item starts, in seconds. */
export const useCooldown = dataComponent(
    'minecraft:use_cooldown',
    object({ seconds: float }, { cooldown_group: identifier })
);

/** `minecraft:use_remainder`: the item left behind after a use, such as a bowl or a bottle. */
export const useRemainder = dataComponent('minecraft:use_remainder', itemStackReference);

/** `minecraft:villager_food`: how much feeding the item to a villager restores. */
export const villagerFood = dataComponent('minecraft:villager_food', object({ nutrition: int(0) }));

/** `minecraft:weapon`: the durability an attack spends and how long it disables blocking. */
export const weapon = dataComponent(
    'minecraft:weapon',
    object({}, { item_damage_per_attack: int(0), disable_blocking_for_seconds: float })
);

/** `minecraft:writable_book_content`: the pages of a book and quill. */
export const writableBookContent = dataComponent(
    'minecraft:writable_book_content',
    object({}, { pages: listOf(either(text, bookPage)) })
);

/** The fifty-six types that are a default on some items, in alphabetical order. */
export const DEFAULTED_COMPONENTS = [
    attackRange,
    bannerPatterns,
    bees,
    blockState,
    blockTransformer,
    blocksAttacks,
    brewingFuel,
    bucketEntityData,
    bundleContents,
    chargedProjectiles,
    chickenVariant,
    compostable,
    consumable,
    container,
    cookingFuel,
    cushionColor,
    damage,
    damageResistant,
    damageType,
    deathProtection,
    debugStickState,
    dye,
    enchantable,
    enchantmentGlintOverride,
    entityData,
    equippable,
    fireworks,
    food,
    glider,
    instrument,
    jukeboxPlayable,
    kineticWeapon,
    mapDecorations,
    maxDamage,
    minimumAttackCharge,
    mobVisibility,
    ominousBottleAmplifier,
    piercingWeapon,
    potDecorations,
    potionContents,
    potionDurationScale,
    providesBannerPatterns,
    providesPotteryPattern,
    providesTrimMaterial,
    recipes,
    repairable,
    signTextBack,
    signTextFront,
    storedEnchantments,
    suspiciousStewEffects,
    tool,
    useCooldown,
    useRemainder,
    villagerFood,
    weapon,
    writableBookContent
] as const;
