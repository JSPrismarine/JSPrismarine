/**
 * The behavior families, and the classifier that puts every Java item in
 * exactly one of them.
 *
 * The classification is a partition: an ordered list of rules, the first match
 * wins, and anything no rule claims is `data only`. That is what makes the
 * coverage claim checkable rather than asserted, and `classifyVanillaItems`
 * walks all 1658 items of the pinned 26.3 registry every time the suite runs.
 *
 * A family's primary classification is not the same thing as what attaches to
 * an item at load. A diamond axe is classified `block transforming tool`, and
 * three behaviors attach to it: the stripping transform, the mining tool and
 * the melee weapon. Classification answers "which family owns this item",
 * attachment answers "what code runs for it", and `registry.ts` holds the
 * second.
 *
 * Where a rule names a component it is because Java's data already says what
 * the item is; where it names identifiers it is because neither edition
 * publishes the behavior, which is the list
 * `docs/research/engine-behavior-inventory.md` section 2 measured.
 */
import { itemTypesTable } from '@jsprismarine/items';

import { fieldOf, listField } from './raw';

/** One item as the classifier sees it: a Java identifier and its default components. */
export interface ClassifiableItem {
    /** The Java item identifier, such as `minecraft:diamond_pickaxe`. */
    readonly identifier: string;
    /**
     * The Java default components, keyed by component name.
     *
     * Empty for the 53 items the Bedrock join merges or excepts, because the
     * table keeps one row's components per Bedrock identifier. Every one of
     * those 53 is classified by identifier instead, which is why the banner
     * and structure map rules name a pattern as well as a component.
     */
    readonly components: Readonly<Record<string, unknown>>;
}

/** How a family claims an item. */
export type FamilyRule = (item: ClassifiableItem) => boolean;

/** One behavior family: what it is, how it is recognized, and what runs for it. */
export interface ItemFamilyDefinition {
    /** The family name, which is also its row in the README table. */
    readonly name: string;
    /** One line on what the family does. */
    readonly summary: string;
    /** Whether an item belongs to this family, tried in catalog order. */
    readonly rule: FamilyRule;
    /** The behaviors `registerVanillaItemBehaviors` attaches for it, by name. */
    readonly behaviors: readonly string[];
    /**
     * The functions the server calls directly for this family, by name.
     *
     * Not every behavior is an item interaction. A mining speed is a number
     * the engine asks for while a block breaks, a totem fires on the damage
     * path, and a gliding elytra wears out on a tick. None of the seven hooks
     * covers those, so they are exported functions and listed here rather
     * than registered as a behavior with no handlers.
     */
    readonly entryPoints?: readonly string[];
}

/** The name the classifier gives an item no family claims. */
export const DATA_ONLY = 'data only' as const;

const named =
    (...identifiers: readonly string[]): FamilyRule =>
    (item) =>
        identifiers.includes(item.identifier);

const matching =
    (pattern: RegExp): FamilyRule =>
    (item) =>
        pattern.test(item.identifier);

const withComponent =
    (component: string): FamilyRule =>
    (item) =>
        component in item.components;

const either =
    (...rules: readonly FamilyRule[]): FamilyRule =>
    (item) =>
        rules.some((rule) => rule(item));

/**
 * Whether the item's `minecraft:tool` carries a `#minecraft:mineable/*` rule,
 * which is what separates a pickaxe from a sword.
 *
 * Both have the component; only the pickaxe's rules name a mining tag. The
 * item package's Bedrock projection derives the enchanting category the same
 * way, from the same field.
 */
const minesByTag: FamilyRule = (item) =>
    listField(item.components['minecraft:tool'], 'rules').some((rule) => {
        const blocks = fieldOf(rule, 'blocks');
        return typeof blocks === 'string' && blocks.startsWith('#minecraft:mineable/');
    });

/**
 * Every behavior family, in classification order.
 *
 * The order is "named before derived": a family the data cannot express names
 * its items, and the component rules below it catch everything the data does
 * express. Swapping two rows changes the partition, so the counts test is the
 * guard on this list.
 */
export const ITEM_FAMILIES = [
    {
        name: 'bow',
        summary: 'Draw to charge, release to shoot an arrow with power scaled by the draw.',
        rule: named('minecraft:bow'),
        behaviors: ['vanilla:bow'],
        entryPoints: ['bowPowerForTime']
    },
    {
        name: 'crossbow',
        summary: 'Charge on draw into `minecraft:charged_projectiles`, then fire what it holds.',
        rule: named('minecraft:crossbow'),
        behaviors: ['vanilla:crossbow'],
        entryPoints: ['crossbowChargeTicks']
    },
    {
        name: 'ammunition',
        summary: 'Shot by a bow, a crossbow or a dispenser; no use behavior of its own.',
        rule: named('minecraft:arrow', 'minecraft:tipped_arrow', 'minecraft:spectral_arrow'),
        behaviors: []
    },
    {
        name: 'trident',
        summary: 'Melee, or a held throw that returns with Loyalty and launches with Riptide.',
        rule: named('minecraft:trident'),
        behaviors: ['vanilla:trident', 'vanilla:melee_weapon']
    },
    {
        name: 'mace',
        summary: 'A melee hit whose damage grows with the fall it lands from.',
        rule: named('minecraft:mace'),
        behaviors: ['vanilla:mace', 'vanilla:melee_weapon'],
        entryPoints: ['maceDamageBonus']
    },
    {
        name: 'fishing rod',
        summary: 'Cast a hook, reel it in for the catch or the entity it hit.',
        rule: named('minecraft:fishing_rod'),
        behaviors: ['vanilla:fishing_rod']
    },
    {
        name: 'mob steering rod',
        summary: 'Steer a saddled pig or strider, spending durability per boost.',
        rule: named('minecraft:carrot_on_a_stick', 'minecraft:warped_fungus_on_a_stick'),
        behaviors: ['vanilla:steering_rod']
    },
    {
        name: 'shears',
        summary: 'Shear an entity, or mine leaves, wool and cobwebs intact.',
        rule: named('minecraft:shears'),
        behaviors: ['vanilla:shears', 'vanilla:mining_tool']
    },
    {
        name: 'fire starter',
        summary: 'Set a block alight; flint and steel spends durability, a fire charge spends itself.',
        rule: named('minecraft:flint_and_steel', 'minecraft:fire_charge'),
        behaviors: ['vanilla:fire_starter']
    },
    {
        name: 'bone meal',
        summary: 'Fertilize the block it is used on, which the block family resolves.',
        rule: named('minecraft:bone_meal'),
        behaviors: ['vanilla:bone_meal']
    },
    {
        name: 'spyglass',
        summary: 'Hold to zoom, which the Bedrock client draws and the server only sounds.',
        rule: named('minecraft:spyglass'),
        behaviors: ['vanilla:spyglass']
    },
    {
        name: 'compass',
        summary: 'Point at the world spawn, a bound lodestone, or the last death position.',
        rule: named('minecraft:compass', 'minecraft:recovery_compass'),
        behaviors: ['vanilla:compass'],
        entryPoints: ['compassTargetOf']
    },
    {
        name: 'clock',
        summary: 'Read the time of day, which the client draws from the item state.',
        rule: named('minecraft:clock'),
        behaviors: [],
        entryPoints: ['clockReading']
    },
    {
        name: 'map',
        summary: 'Create, clone, extend or lock a map, including the sixteen structure maps.',
        rule: either(named('minecraft:map'), matching(/_map$/)),
        behaviors: ['vanilla:map']
    },
    {
        name: 'lead',
        summary: 'Tie a leashable entity, or knot the lead to a fence.',
        rule: named('minecraft:lead'),
        behaviors: ['vanilla:lead']
    },
    {
        name: 'name tag',
        summary: 'Name the entity it is used on, and make it persistent.',
        rule: named('minecraft:name_tag'),
        behaviors: ['vanilla:name_tag']
    },
    {
        name: 'brush',
        summary: 'Brush a suspicious block one step at a time, spending durability per finish.',
        rule: named('minecraft:brush'),
        behaviors: ['vanilla:brush']
    },
    {
        name: 'eye of ender',
        summary: 'Fly toward the nearest stronghold, or fill an end portal frame.',
        rule: named('minecraft:ender_eye'),
        behaviors: ['vanilla:eye_of_ender']
    },
    {
        name: 'bucket',
        summary: 'Pick a fluid or powder snow up, or put one down.',
        rule: named(
            'minecraft:bucket',
            'minecraft:water_bucket',
            'minecraft:lava_bucket',
            'minecraft:powder_snow_bucket'
        ),
        behaviors: ['vanilla:bucket']
    },
    {
        name: 'throwable',
        summary: 'Throw a projectile entity: snowballs, eggs, pearls, potions, bottles and charges.',
        rule: named(
            'minecraft:snowball',
            'minecraft:egg',
            'minecraft:blue_egg',
            'minecraft:brown_egg',
            'minecraft:ender_pearl',
            'minecraft:experience_bottle',
            'minecraft:splash_potion',
            'minecraft:lingering_potion',
            'minecraft:wind_charge'
        ),
        behaviors: ['vanilla:throwable']
    },
    {
        name: 'bottle and bowl',
        summary: 'Fill from water, a cauldron, a beehive or a mooshroom.',
        rule: named('minecraft:glass_bottle', 'minecraft:bowl'),
        behaviors: ['vanilla:fillable']
    },
    {
        name: 'waxing',
        summary: 'Wax copper, or set a sign so its text cannot be edited.',
        rule: named('minecraft:honeycomb'),
        behaviors: ['vanilla:waxing']
    },
    {
        name: 'sign ink',
        summary: 'Make sign text glow, or take the glow back off.',
        rule: named('minecraft:ink_sac', 'minecraft:glow_ink_sac'),
        behaviors: ['vanilla:sign_ink']
    },
    {
        name: 'written book',
        summary: 'Open for reading; the knowledge book grants its recipes and is consumed.',
        rule: named('minecraft:written_book', 'minecraft:knowledge_book'),
        behaviors: ['vanilla:written_book']
    },
    {
        name: 'entity placement',
        summary: 'Put an entity in the world: boats, rafts, minecarts, cushions, crystals, stands and paintings.',
        rule: either(
            matching(/_(boat|raft|minecart|cushion)$/),
            named(
                'minecraft:minecart',
                'minecraft:end_crystal',
                'minecraft:armor_stand',
                'minecraft:painting',
                'minecraft:cushion'
            )
        ),
        behaviors: ['vanilla:entity_placement']
    },
    {
        name: 'mob bucket',
        summary: 'Pour the water back and release the entity the bucket holds.',
        rule: withComponent('minecraft:bucket_entity_data'),
        behaviors: ['vanilla:mob_bucket']
    },
    {
        name: 'shield',
        summary: 'Raise to block, taking damage into durability until an axe disables it.',
        rule: withComponent('minecraft:blocks_attacks'),
        behaviors: ['vanilla:shield'],
        entryPoints: ['shieldDurabilityCost']
    },
    {
        name: 'elytra',
        summary: 'Worn in the chest slot and lets the wearer glide.',
        rule: withComponent('minecraft:glider'),
        behaviors: ['vanilla:equippable'],
        entryPoints: ['elytraDurabilityTick']
    },
    {
        name: 'totem',
        summary: 'Cancels a fatal hit from the hand or the offhand, and is consumed.',
        rule: withComponent('minecraft:death_protection'),
        behaviors: [],
        entryPoints: ['applyDeathProtection', 'deathProtectionOf']
    },
    {
        name: 'spear',
        summary: 'A mounted charge whose damage comes from relative velocity, piercing everything in reach.',
        rule: withComponent('minecraft:kinetic_weapon'),
        behaviors: ['vanilla:spear', 'vanilla:melee_weapon'],
        entryPoints: ['kineticDamageOf']
    },
    {
        name: 'firework rocket',
        summary: 'Launch a rocket, or boost a glider with one.',
        rule: withComponent('minecraft:fireworks'),
        behaviors: ['vanilla:firework_rocket']
    },
    {
        name: 'goat horn',
        summary: 'Play the instrument the item names, then wait out its cooldown.',
        rule: withComponent('minecraft:instrument'),
        behaviors: ['vanilla:goat_horn']
    },
    {
        name: 'writable book',
        summary: 'Open the page editor, and sign into a written book.',
        rule: withComponent('minecraft:writable_book_content'),
        behaviors: ['vanilla:writable_book']
    },
    {
        name: 'enchanted book',
        summary: 'Carries enchantments for an anvil without applying them.',
        rule: withComponent('minecraft:stored_enchantments'),
        behaviors: []
    },
    {
        name: 'banner',
        summary: 'Place the banner block, or apply a pattern in a loom.',
        rule: either(withComponent('minecraft:banner_patterns'), matching(/_banner$/)),
        behaviors: ['vanilla:banner']
    },
    {
        name: 'dye',
        summary: 'Color a sheep, a collar, a harness or a sign.',
        rule: withComponent('minecraft:dye'),
        behaviors: ['vanilla:dye']
    },
    {
        name: 'bundle',
        summary: 'A dynamic container weighted by the stacks it holds.',
        rule: withComponent('minecraft:bundle_contents'),
        behaviors: ['vanilla:bundle']
    },
    {
        name: 'spawn egg',
        summary: 'Spawn the entity the egg names, or set a spawner to it.',
        rule: withComponent('minecraft:entity_data'),
        behaviors: ['vanilla:spawn_egg']
    },
    {
        name: 'potion',
        summary: 'Drink for the effects in `minecraft:potion_contents`, leaving the bottle.',
        rule: withComponent('minecraft:potion_contents'),
        behaviors: ['vanilla:potion', 'vanilla:consumable']
    },
    {
        name: 'suspicious stew',
        summary: 'Eaten for the effects the stew stored when it was crafted.',
        rule: withComponent('minecraft:suspicious_stew_effects'),
        behaviors: ['vanilla:suspicious_stew', 'vanilla:consumable']
    },
    {
        name: 'ominous bottle',
        summary: 'Drink for Bad Omen at the amplifier the bottle carries.',
        rule: withComponent('minecraft:ominous_bottle_amplifier'),
        behaviors: ['vanilla:ominous_bottle', 'vanilla:consumable']
    },
    {
        name: 'block transforming tool',
        summary: 'Strip, path or till the block it is used on, from the `minecraft:block_transformer` table.',
        rule: withComponent('minecraft:block_transformer'),
        behaviors: ['vanilla:block_transformer', 'vanilla:mining_tool', 'vanilla:melee_weapon']
    },
    {
        name: 'mining tool',
        summary: 'Mines its `#minecraft:mineable/*` tag at the speed and tier its rules state.',
        rule: minesByTag,
        behaviors: ['vanilla:mining_tool', 'vanilla:melee_weapon'],
        entryPoints: ['miningSpeed', 'destroyProgress', 'breakTicks']
    },
    {
        name: 'melee weapon',
        summary: 'Attacks for its `minecraft:attack_damage` modifier and spends durability per hit.',
        rule: withComponent('minecraft:weapon'),
        behaviors: ['vanilla:melee_weapon', 'vanilla:mining_tool'],
        entryPoints: ['attackDamage', 'attackStrengthScale']
    },
    {
        name: 'equippable',
        summary: 'Worn by the user or put on an entity: armor, saddles, harnesses and horse armor.',
        rule: withComponent('minecraft:equippable'),
        behaviors: ['vanilla:equippable']
    },
    {
        name: 'food',
        summary: 'Eaten for nutrition and saturation, plus whatever `minecraft:consumable` applies.',
        rule: withComponent('minecraft:food'),
        behaviors: ['vanilla:consumable']
    },
    {
        name: 'consumable',
        summary: 'Drunk rather than eaten: milk, which clears every effect.',
        rule: withComponent('minecraft:consumable'),
        behaviors: ['vanilla:consumable']
    }
] as const satisfies readonly ItemFamilyDefinition[];

/** Every family name, which is the union the classifier returns. */
export type ItemFamilyName = (typeof ITEM_FAMILIES)[number]['name'];

/** What {@link classifyItem} returns: a family name, or {@link DATA_ONLY}. */
export type ItemClassification = ItemFamilyName | typeof DATA_ONLY;

/**
 * The family one item belongs to.
 *
 * @returns The first family whose rule claims the item, or {@link DATA_ONLY}
 *   when none does. `data only` is a real answer rather than a gap: it holds
 *   the block items, whose placement the block package owns, and the plain
 *   materials that have no use behavior in either edition.
 */
export const classifyItem = (item: ClassifiableItem): ItemClassification =>
    ITEM_FAMILIES.find((family) => family.rule(item))?.name ?? DATA_ONLY;

/** Every Java item in the pinned table, including the merged and excepted ones. */
export const vanillaJavaItems = (): readonly ClassifiableItem[] => {
    const items = new Map<string, ClassifiableItem>();
    for (const row of Object.values(itemTypesTable.items)) {
        items.set(row.java, { identifier: row.java, components: row.components });
        for (const merged of row.merged ?? []) {
            if (!items.has(merged.java)) items.set(merged.java, { identifier: merged.java, components: {} });
        }
    }
    for (const excepted of itemTypesTable.exceptedJavaItems) {
        if (!items.has(excepted)) items.set(excepted, { identifier: excepted, components: {} });
    }
    return [...items.values()].sort((left, right) => left.identifier.localeCompare(right.identifier));
};

/** The classification of every Java item, as a partition. */
export interface ItemClassificationReport {
    /** How many items were classified, which is the Java item registry's size. */
    readonly total: number;
    /** The identifiers in each family, in identifier order, keyed by family name. */
    readonly members: ReadonlyMap<ItemClassification, readonly string[]>;
    /** How many items each family holds, in catalog order and `data only` last. */
    readonly counts: readonly { readonly family: ItemClassification; readonly count: number }[];
}

/**
 * Classifies every Java item in the pinned table.
 *
 * @returns The partition. The counts sum to the table's `javaItemCount`, which
 *   is the totality claim and what the test checks.
 */
export const classifyVanillaItems = (
    items: readonly ClassifiableItem[] = vanillaJavaItems()
): ItemClassificationReport => {
    const members = new Map<ItemClassification, string[]>();
    for (const family of ITEM_FAMILIES) members.set(family.name, []);
    members.set(DATA_ONLY, []);

    for (const item of items) members.get(classifyItem(item))!.push(item.identifier);

    const counts = [...members].map(([family, identifiers]) => ({ family, count: identifiers.length }));
    return { total: items.length, members, counts };
};
