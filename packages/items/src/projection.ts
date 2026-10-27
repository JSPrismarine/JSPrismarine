/**
 * The Bedrock item component projection: what the client is told about an
 * item whose properties came from Java.
 *
 * The two editions name the same facts differently. Java's `max_damage` is
 * Bedrock's `minecraft:durability.max_durability`, Java's `food.saturation`
 * is an absolute value where Bedrock's `saturation_modifier` is a ratio, and
 * Bedrock keeps a flat `item_properties` compound beside the named
 * components. Every shape below is read off a Bedrock Dedicated Server
 * 1.26.51.1 capture, the `item_components.nbt` golden in
 * `@jsprismarine/bedrock-data`, rather than written from the documentation.
 *
 * This module builds the compound. It does not send it: `ItemRegistryPacket`
 * belongs to the protocol package.
 */
import {
    blocksAttacks,
    compostable,
    consumable,
    cookingFuel,
    damageResistant,
    enchantable,
    enchantmentGlintOverride,
    equippable,
    food,
    glider,
    kineticWeapon,
    maxDamage,
    piercingWeapon,
    tool,
    useCooldown,
    useRemainder,
    weapon
} from './components/defaults';
import { attributeModifiers, maxStackSize, useEffects } from './components/universal';
import type { ItemType } from './hooks';
import type { ProviderContext } from './numberProvider';
import { DEFAULT_PROVIDER_CONTEXT, NumberProviderError, evaluateNumberProvider } from './numberProvider';

/**
 * The flat `item_properties` compound, with the nineteen keys a Bedrock
 * Dedicated Server writes for a data-driven item. Only the keys Java's
 * components decide are produced here; see {@link BEDROCK_ONLY_ITEM_PROPERTIES}.
 */
export interface BedrockItemProperties {
    /** How many fit in a slot. */
    max_stack_size?: number;
    /** Attack damage the item adds, in half hearts. */
    damage?: number;
    /** Whether the item is held out in front, which tools and weapons are. */
    hand_equipped?: boolean;
    /** Whether the enchantment glint is drawn regardless of enchantments. */
    foil?: boolean;
    /** Which enchanting table category the item belongs to, `none` when it takes none. */
    enchantable_slot?: string;
    /** The enchanting power the item brings. */
    enchantable_value?: number;
    /** How long a held use runs, in ticks. */
    use_duration?: number;
    /** The use animation id; 0 is none and 1 is eating. */
    use_animation?: number;
    /** Whether the item breaks blocks in creative mode. */
    can_destroy_in_creative?: boolean;
    /** The base mining speed multiplier. */
    mining_speed?: number;
    /** Whether the item can be held in the off hand. */
    allow_off_hand?: boolean;
}

/** The compound an item's `Item Component Data` carries, keyed the way Bedrock keys it. */
export interface BedrockItemComponents {
    item_properties: BedrockItemProperties;
    /** Bedrock's resolved item tag names, serialized separately from named components. */
    item_tags?: readonly string[];
    /** Resource pack icon textures declared by the active Bedrock item definition. */
    'minecraft:icon'?: { textures: Readonly<Record<string, string>> };
    'minecraft:max_stack_size'?: { value: number };
    'minecraft:damage'?: { value: number };
    'minecraft:durability'?: { max_durability: number; damage_chance: { min: number; max: number } };
    'minecraft:enchantable'?: { slot: string; value: number };
    'minecraft:food'?: {
        nutrition: number;
        saturation_modifier: number;
        can_always_eat: boolean;
        using_converts_to?: string;
    };
    'minecraft:use_duration'?: number;
    'minecraft:use_animation'?: { value: string };
    'minecraft:use_modifiers'?: { use_duration: number; movement_modifier: number };
    'minecraft:fuel'?: { duration: number };
    'minecraft:compostable'?: { composting_chance: number };
    'minecraft:fire_resistant'?: { value: boolean };
    'minecraft:hand_equipped'?: { value: boolean };
    'minecraft:cooldown'?: { category: string; duration: number; type: string };
    'minecraft:wearable'?: { slot: string; protection: number };
}

/**
 * The `item_properties` keys the Bedrock server fills from its own tables
 * rather than from any item property, so the protocol layer supplies them.
 * `creative_category` and `creative_group` come from the creative item
 * catalog, `frame_count` from the resource pack's icon animation, and the
 * other three have no Java source at all.
 */
export const BEDROCK_ONLY_ITEM_PROPERTIES = [
    'creative_category',
    'creative_group',
    'frame_count',
    'hidden_in_commands',
    'liquid_clipped',
    'should_despawn',
    'stacked_by_data'
] as const;

/**
 * Bedrock components this projection deliberately leaves out, each because
 * producing it would need a Java-to-Bedrock identifier lookup this package
 * does not depend on, or would overwrite something the client already knows.
 */
export const UNPROJECTED_BEDROCK_COMPONENTS = {
    'minecraft:display_name':
        'The client already has a name for every vanilla item, and Java translation keys do not transform into Bedrock ones reliably.',
    'minecraft:repairable': 'The repair items are a Java item tag, which needs tag expansion and identifier mapping.',
    'minecraft:digger': 'The destroy speeds are keyed by Java block tags, which have no Bedrock equivalent.',
    'minecraft:block_placer': 'Which block an item places is a fact of the block package, not an item component.'
} as const;

/** Whether an untyped Bedrock JSON value is an object with named fields. */
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads the resource-pack texture variants from the item's Bedrock icon component. */
const bedrockIconOf = (type: ItemType): BedrockItemComponents['minecraft:icon'] => {
    const source = type.bedrockComponents.get('minecraft:icon');
    if (typeof source === 'string') return { textures: { default: source } };
    if (!isRecord(source)) return undefined;

    const textures = source.textures;
    if (isRecord(textures)) {
        const entries = Object.entries(textures).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string'
        );
        return { textures: Object.fromEntries(entries) };
    }

    return typeof source.texture === 'string' ? { textures: { default: source.texture } } : undefined;
};

/** How Java's equipment slots name the same places Bedrock's `wearable` does. */
const WEARABLE_SLOTS: Readonly<Record<string, string>> = {
    head: 'slot.armor.head',
    chest: 'slot.armor.chest',
    legs: 'slot.armor.legs',
    feet: 'slot.armor.feet',
    body: 'slot.armor.body',
    mainhand: 'slot.weapon.mainhand',
    offhand: 'slot.weapon.offhand'
};

/** Which Bedrock enchanting category a Java `mineable/*` tool rule implies. */
const TOOL_TAG_SLOTS: readonly (readonly [string, string])[] = [
    ['mineable/pickaxe', 'pickaxe'],
    ['mineable/axe', 'axe'],
    ['mineable/shovel', 'shovel'],
    ['mineable/hoe', 'hoe']
];

/** Which Bedrock armor category a Java equipment slot implies. */
const ARMOR_SLOTS: Readonly<Record<string, string>> = {
    head: 'armor_head',
    chest: 'armor_torso',
    legs: 'armor_legs',
    feet: 'armor_feet',
    body: 'g_armor'
};

/**
 * Picks the Bedrock enchanting category for an item.
 *
 * Java has no such field, so it is derived: the `mineable/*` tag in the
 * item's tool rules names the tool, the equipment slot names the armor piece,
 * and the spear components, shield rules and glider each name themselves.
 */
export const enchantableSlotOf = (type: ItemType): string => {
    if (type.params(glider) !== undefined) return 'elytra';
    if (type.params(blocksAttacks) !== undefined) return 'shield';
    if (type.params(piercingWeapon) !== undefined || type.params(kineticWeapon) !== undefined) return 'melee_spear';

    const rules = type.params(tool)?.rules ?? [];
    for (const rule of rules) {
        if (rule.blocks.kind !== 'tag') continue;
        const tag = rule.blocks.tag.replace('minecraft:', '');
        const match = TOOL_TAG_SLOTS.find(([suffix]) => tag === suffix);
        if (match) return match[1];
    }

    const slot = type.params(equippable)?.slot;
    if (slot !== undefined && slot in ARMOR_SLOTS) return ARMOR_SLOTS[slot]!;
    if (type.params(weapon) !== undefined) return 'sword';
    return type.params(enchantable) === undefined ? 'none' : 'all';
};

/** The attack damage a Java attribute modifier list adds in the main hand. */
const attackDamageOf = (type: ItemType): number | undefined => {
    const modifiers = type.params(attributeModifiers) ?? [];
    const attack = modifiers.find(
        (modifier) => modifier.type === 'minecraft:attack_damage' && modifier.operation === 'add_value'
    );
    return attack === undefined ? undefined : Math.round(attack.amount);
};

/** The armor points a Java attribute modifier list adds. */
const armorPointsOf = (type: ItemType): number => {
    const modifiers = type.params(attributeModifiers) ?? [];
    const armor = modifiers.find(
        (modifier) => modifier.type === 'minecraft:armor' && modifier.operation === 'add_value'
    );
    return armor === undefined ? 0 : Math.round(armor.amount);
};

/** Evaluates a provider-backed number, returning undefined when nothing resolves it. */
const resolveNumber = (
    source:
        | { kind: 'inline'; value: number }
        | { kind: 'reference'; id: string }
        | { kind: 'provider'; provider: Readonly<Record<string, unknown>> }
        | undefined,
    context: ProviderContext
): number | undefined => {
    if (source === undefined) return undefined;
    const node = source.kind === 'inline' ? source.value : source.kind === 'reference' ? source.id : source.provider;
    try {
        return evaluateNumberProvider(node, context);
    } catch (error) {
        if (error instanceof NumberProviderError) return undefined;
        throw error;
    }
};

/** Options for {@link projectItemToBedrock}. */
export interface ProjectionOptions {
    /**
     * Maps a Java item identifier to the Bedrock one, for the few projected
     * fields that name another item. Injected rather than imported so this
     * package does not depend on `@jsprismarine/mapping`; without it, those
     * fields are left out.
     */
    mapIdentifier?: (javaId: string) => string | undefined;
    /** The cooking context fuel values resolve for, a normal furnace by default. */
    providers?: ProviderContext;
}

/**
 * Projects one resolved item type onto the Bedrock component compound the
 * client needs in `ItemRegistryPacket`.
 *
 * Only the facts Java's components decide are produced. Keys with no Java
 * source are left out rather than guessed, so the protocol layer can merge
 * its own without having to tell a derived value from a placeholder.
 */
export const projectItemToBedrock = (type: ItemType, options: ProjectionOptions = {}): BedrockItemComponents => {
    const context = options.providers ?? DEFAULT_PROVIDER_CONTEXT;
    const properties: BedrockItemProperties = {};
    const icon = bedrockIconOf(type);
    const projected: BedrockItemComponents = {
        item_properties: properties,
        item_tags: type.tags,
        ...(icon === undefined ? {} : { 'minecraft:icon': icon })
    };

    const stackSize = type.params(maxStackSize);
    if (stackSize !== undefined) {
        properties.max_stack_size = stackSize;
        projected['minecraft:max_stack_size'] = { value: stackSize };
    }

    const attack = attackDamageOf(type);
    if (attack !== undefined) {
        properties.damage = attack;
        projected['minecraft:damage'] = { value: attack };
    }

    const durability = type.params(maxDamage);
    if (durability !== undefined) {
        projected['minecraft:durability'] = { max_durability: durability, damage_chance: { min: 0, max: 100 } };
    }

    const toolParams = type.params(tool);
    const weaponParams = type.params(weapon);
    const handEquipped = toolParams !== undefined || weaponParams !== undefined;
    if (handEquipped) {
        properties.hand_equipped = true;
        projected['minecraft:hand_equipped'] = { value: true };
    }
    if (toolParams !== undefined) {
        properties.mining_speed = toolParams.default_mining_speed ?? 1;
        properties.can_destroy_in_creative = toolParams.can_destroy_blocks_in_creative ?? true;
    }

    properties.foil = type.params(enchantmentGlintOverride) ?? false;

    const enchantableParams = type.params(enchantable);
    properties.enchantable_slot = enchantableSlotOf(type);
    properties.enchantable_value = enchantableParams?.value ?? 0;
    if (enchantableParams !== undefined) {
        projected['minecraft:enchantable'] = {
            slot: properties.enchantable_slot,
            value: enchantableParams.value
        };
    }

    const equippableParams = type.params(equippable);
    if (equippableParams !== undefined) {
        const slot = WEARABLE_SLOTS[equippableParams.slot];
        if (slot !== undefined) projected['minecraft:wearable'] = { slot, protection: armorPointsOf(type) };
        properties.allow_off_hand = equippableParams.slot === 'offhand' || equippableParams.slot === 'hand';
    }

    const consumableParams = type.params(consumable);
    if (consumableParams !== undefined) {
        // Java's default consume time is 1.6 seconds, which is the 32 ticks a
        // Bedrock Dedicated Server reports for the apple.
        const ticks = Math.round((consumableParams.consume_seconds ?? 1.6) * 20);
        const animation = consumableParams.animation ?? 'eat';
        properties.use_duration = ticks;
        properties.use_animation = animation === 'eat' ? 1 : 0;
        projected['minecraft:use_duration'] = ticks;
        projected['minecraft:use_animation'] = { value: animation };
        projected['minecraft:use_modifiers'] = {
            use_duration: ticks,
            movement_modifier: type.params(useEffects)?.speed_multiplier ?? 1
        };
    }

    const foodParams = type.params(food);
    if (foodParams !== undefined) {
        // Java stores saturation as an absolute value and Bedrock as the
        // ratio it is computed from: saturation = 2 * nutrition * modifier.
        const modifier = foodParams.nutrition > 0 ? foodParams.saturation / (2 * foodParams.nutrition) : 0;
        const remainder = type.params(useRemainder)?.id;
        const converts = remainder === undefined ? undefined : options.mapIdentifier?.(remainder);
        projected['minecraft:food'] = {
            nutrition: foodParams.nutrition,
            saturation_modifier: modifier,
            can_always_eat: foodParams.can_always_eat ?? false,
            ...(converts !== undefined ? { using_converts_to: converts } : {})
        };
    }

    const burnTicks = resolveNumber(type.params(cookingFuel)?.burn_time, context);
    if (burnTicks !== undefined) projected['minecraft:fuel'] = { duration: burnTicks / 20 };

    const layers = resolveNumber(type.params(compostable)?.layers, context);
    if (layers !== undefined) {
        projected['minecraft:compostable'] = { composting_chance: Math.round(layers * 100) };
    }

    const resistant = type.params(damageResistant);
    if (resistant?.types.kind === 'tag' && resistant.types.tag === 'minecraft:is_fire') {
        projected['minecraft:fire_resistant'] = { value: true };
    }

    const cooldown = type.params(useCooldown);
    if (cooldown !== undefined) {
        projected['minecraft:cooldown'] = {
            category: (cooldown.cooldown_group ?? type.identifier).replace('minecraft:', ''),
            duration: cooldown.seconds,
            type: 'use'
        };
    }

    return projected;
};
