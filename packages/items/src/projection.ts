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
    repairable,
    tool,
    useCooldown,
    useRemainder,
    weapon
} from './components/defaults';
import { attributeModifiers, maxStackSize, useEffects } from './components/universal';
import type { ItemType } from './hooks';
import type { ProviderContext } from './numberProvider';
import { DEFAULT_PROVIDER_CONTEXT, NumberProviderError, evaluateNumberProvider } from './numberProvider';
import type { HolderSet } from './schema';

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
    /** Whether the item can be used while a liquid occupies the target. */
    liquid_clipped?: boolean;
    /** The base mining speed multiplier. */
    mining_speed?: number;
    /** Whether the item can be held in the off hand. */
    allow_off_hand?: boolean;
    /** Whether a dropped item stack despawns. */
    should_despawn?: boolean;
    /** Whether stacks with different auxiliary values stay separate. */
    stacked_by_data?: boolean;
}

/** The compound an item's `Item Component Data` carries, keyed the way Bedrock keys it. */
export interface BedrockItemComponents {
    item_properties: BedrockItemProperties;
    /** Bedrock's resolved item tag names, serialized separately from named components. */
    item_tags?: readonly string[];
    /** The block a Bedrock-defined item places, with its placement restrictions. */
    'minecraft:block_placer'?: BedrockBlockPlacerComponent;
    /** The explicit display name from the active Bedrock item definition. */
    'minecraft:display_name'?: { value: string };
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
    /** Java's repair materials, expanded and mapped to Bedrock item identifiers. */
    'minecraft:repairable'?: BedrockRepairableComponent;
    /** Java's tool rules, expanded and mapped to Bedrock block identifiers. */
    'minecraft:digger'?: BedrockDiggerComponent;
    'minecraft:fuel'?: { duration: number };
    'minecraft:compostable'?: { composting_chance: number };
    'minecraft:fire_resistant'?: { value: boolean };
    'minecraft:hand_equipped'?: { value: boolean };
    'minecraft:cooldown'?: { category: string; duration: number; type: string };
    'minecraft:wearable'?: { slot: string; protection: number };
}

/** One group of Bedrock items that can repair the item. */
export interface BedrockRepairableItem {
    /** Bedrock item identifiers accepted as repair materials. */
    readonly items: readonly string[];
}

/** The Bedrock repair rules projected from Java's `minecraft:repairable`. */
export interface BedrockRepairableComponent {
    /** Repair material groups accepted by Bedrock's anvil UI. */
    readonly repairItems: readonly BedrockRepairableItem[];
}

/** One Bedrock digging speed, resolved to a block the client knows. */
export interface BedrockDiggerRule {
    /** The Bedrock block identifier this speed applies to. */
    readonly block: string;
    /** The integer speed multiplier Bedrock's item component accepts. */
    readonly speed: number;
}

/** The Bedrock digging rules projected from Java's `minecraft:tool`. */
export interface BedrockDiggerComponent {
    /** The ordered block speeds the item applies while mining. */
    readonly destroySpeeds: readonly BedrockDiggerRule[];
    /** Whether Bedrock applies its Efficiency enchantment bonus to this item. */
    readonly useEfficiency: boolean;
}

/** One block selector accepted by `minecraft:block_placer.use_on`. */
export interface BedrockItemBlockDescriptor {
    /** The block identifier, when the selector names one block. */
    readonly name?: string;
    /** The block state values that further narrow the named block. */
    readonly states?: Readonly<Record<string, string | number | boolean>>;
    /** The Bedrock query that selects blocks by their tags. */
    readonly tags?: string;
}

/** The resolved Bedrock block placement component sent to the client. */
export interface BedrockBlockPlacerComponent {
    /** The block placed when this item is used. */
    readonly block?: string;
    /** Whether placement follows the player's alignment while interacting. */
    readonly alignedPlacement: boolean;
    /** Whether the block supplies the item icon when no icon is declared. */
    readonly canUseBlockAsIcon: boolean;
    /** Whether this item is the default item returned for its block. */
    readonly replaceBlockItem: boolean;
    /** Blocks on which the item may be used. Empty means all blocks. */
    readonly useOn: readonly (string | BedrockItemBlockDescriptor)[];
}

/**
 * The `item_properties` keys with no Java item-property source, so the
 * protocol layer supplies captured defaults unless an active Bedrock item
 * component provides a value.
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
 * Bedrock components this projection does not yet derive from Java item data.
 */
export const UNPROJECTED_BEDROCK_COMPONENTS = {} as const;

/** Whether an untyped Bedrock JSON value is an object with named fields. */
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads a Bedrock component's scalar form or its `{ value }` form. */
const bedrockScalarOf = (type: ItemType, component: string): unknown => {
    const source = type.bedrockComponents.get(component);
    return isRecord(source) ? source.value : source;
};

/** Reads a boolean Bedrock component from its simple or `{ value }` form. */
const bedrockBooleanOf = (type: ItemType, component: string): boolean | undefined => {
    const value = bedrockScalarOf(type, component);
    return typeof value === 'boolean' ? value : undefined;
};

/** Reads an integer Bedrock component from its simple or `{ value }` form. */
const bedrockIntegerOf = (type: ItemType, component: string): number | undefined => {
    const value = bedrockScalarOf(type, component);
    return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
};

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

/** Reads an explicit display name from the item's Bedrock definition. */
const bedrockDisplayNameOf = (type: ItemType): BedrockItemComponents['minecraft:display_name'] => {
    const source = type.bedrockComponents.get('minecraft:display_name');
    return isRecord(source) && typeof source.value === 'string' ? { value: source.value } : undefined;
};

/** Whether a value can be a Bedrock block state. */
const isBlockStateValue = (value: unknown): value is string | number | boolean =>
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isSafeInteger(value));

/** Reads the block placement component from the active Bedrock item definition. */
const bedrockBlockPlacerOf = (type: ItemType, canUseBlockAsIcon: boolean): BedrockBlockPlacerComponent | undefined => {
    const source = type.bedrockComponents.get('minecraft:block_placer');
    if (!isRecord(source)) return undefined;

    const useOnSource = source.use_on;
    const selectors = Array.isArray(useOnSource) ? useOnSource : useOnSource === undefined ? [] : [useOnSource];
    const useOn: (string | BedrockItemBlockDescriptor)[] = [];
    for (const selector of selectors) {
        if (typeof selector === 'string') {
            useOn.push(selector);
            continue;
        }
        if (!isRecord(selector)) continue;

        const statesSource = selector.states;
        let states: Record<string, string | number | boolean> | undefined;
        if (isRecord(statesSource)) {
            states = {};
            for (const [name, value] of Object.entries(statesSource)) {
                if (isBlockStateValue(value)) states[name] = value;
            }
        }
        useOn.push({
            ...(typeof selector.name === 'string' ? { name: selector.name } : {}),
            ...(states === undefined ? {} : { states }),
            ...(typeof selector.tags === 'string' ? { tags: selector.tags } : {})
        });
    }

    return {
        ...(typeof source.block === 'string' ? { block: source.block } : {}),
        alignedPlacement: source.aligned_placement === true,
        canUseBlockAsIcon:
            typeof source.can_use_block_as_icon === 'boolean' ? source.can_use_block_as_icon : canUseBlockAsIcon,
        replaceBlockItem: source.replace_block_item === true,
        useOn
    };
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
    /** Resolves a Java item tag to its merged Java item identifiers. */
    resolveItemTag?: (tag: string) => readonly string[] | undefined;
    /** Maps a Java block identifier to the Bedrock identifier the client knows. */
    mapBlockIdentifier?: (javaId: string) => string | undefined;
    /** Resolves a Java block tag to its merged Java block identifiers. */
    resolveBlockTag?: (tag: string) => readonly string[] | undefined;
    /** The cooking context fuel values resolve for, a normal furnace by default. */
    providers?: ProviderContext;
}

/** Maps a Java item holder set onto the Bedrock item names the client knows. */
const bedrockItemNamesOf = (items: HolderSet, options: ProjectionOptions): readonly string[] | undefined => {
    if (options.mapIdentifier === undefined) return undefined;

    const javaItems = items.kind === 'entries' ? items.entries : options.resolveItemTag?.(items.tag);
    if (javaItems === undefined) return undefined;

    const mapped = new Set<string>();
    for (const javaItem of javaItems) {
        const bedrockItem = options.mapIdentifier(javaItem);
        if (bedrockItem !== undefined) mapped.add(bedrockItem);
    }
    return [...mapped];
};

/** Maps a Java block holder set onto the Bedrock block names the client knows. */
const bedrockBlockNamesOf = (blocks: HolderSet, options: ProjectionOptions): readonly string[] | undefined => {
    if (options.mapBlockIdentifier === undefined) return undefined;

    const javaBlocks = blocks.kind === 'entries' ? blocks.entries : options.resolveBlockTag?.(blocks.tag);
    if (javaBlocks === undefined) return undefined;

    const mapped = new Set<string>();
    for (const javaBlock of javaBlocks) {
        const bedrockBlock = options.mapBlockIdentifier(javaBlock);
        if (bedrockBlock !== undefined) mapped.add(bedrockBlock);
    }
    return [...mapped];
};

/** Projects Java's floating mining speeds into Bedrock's signed integer range. */
const bedrockMiningSpeed = (speed: number): number => Math.min(2_147_483_647, Math.max(0, Math.round(speed)));

/** Expands Java tool rules into the per-block speeds Bedrock accepts. */
const bedrockDiggerOf = (type: ItemType, options: ProjectionOptions): BedrockDiggerComponent | undefined => {
    const parameters = type.params(tool);
    if (parameters === undefined || options.mapBlockIdentifier === undefined) return undefined;

    const destroySpeeds: BedrockDiggerRule[] = [];
    for (const rule of parameters.rules) {
        if (rule.speed === undefined) continue;
        const blocks = bedrockBlockNamesOf(rule.blocks, options);
        if (blocks === undefined) continue;
        const speed = bedrockMiningSpeed(rule.speed);
        for (const block of blocks) destroySpeeds.push({ block, speed });
    }

    return destroySpeeds.length === 0 ? undefined : { destroySpeeds, useEfficiency: true };
};

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
    const displayName = bedrockDisplayNameOf(type);
    const blockPlacer = bedrockBlockPlacerOf(type, icon === undefined);
    const projected: BedrockItemComponents = {
        item_properties: properties,
        item_tags: type.tags,
        ...(blockPlacer === undefined ? {} : { 'minecraft:block_placer': blockPlacer }),
        ...(displayName === undefined ? {} : { 'minecraft:display_name': displayName }),
        ...(icon === undefined ? {} : { 'minecraft:icon': icon })
    };

    const digger = bedrockDiggerOf(type, options);
    if (digger !== undefined) projected['minecraft:digger'] = digger;

    const stackSize = bedrockIntegerOf(type, 'minecraft:max_stack_size') ?? type.params(maxStackSize);
    if (stackSize !== undefined) {
        properties.max_stack_size = stackSize;
        projected['minecraft:max_stack_size'] = { value: stackSize };
    }

    const attack = bedrockIntegerOf(type, 'minecraft:damage') ?? attackDamageOf(type);
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
    const bedrockHandEquipped = bedrockBooleanOf(type, 'minecraft:hand_equipped');
    const handEquipped = bedrockHandEquipped ?? (toolParams !== undefined || weaponParams !== undefined);
    if (bedrockHandEquipped !== undefined || handEquipped) {
        properties.hand_equipped = handEquipped;
        projected['minecraft:hand_equipped'] = { value: handEquipped };
    }
    if (toolParams !== undefined) {
        properties.mining_speed = toolParams.default_mining_speed ?? 1;
    }
    const canDestroyInCreative =
        bedrockBooleanOf(type, 'minecraft:can_destroy_in_creative') ??
        (toolParams === undefined ? undefined : (toolParams.can_destroy_blocks_in_creative ?? true));
    if (canDestroyInCreative !== undefined) properties.can_destroy_in_creative = canDestroyInCreative;

    properties.foil = bedrockBooleanOf(type, 'minecraft:glint') ?? type.params(enchantmentGlintOverride) ?? false;

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
    }
    const allowOffHand =
        bedrockBooleanOf(type, 'minecraft:allow_off_hand') ??
        (equippableParams === undefined
            ? undefined
            : equippableParams.slot === 'offhand' || equippableParams.slot === 'hand');
    if (allowOffHand !== undefined) properties.allow_off_hand = allowOffHand;

    const liquidClipped = bedrockBooleanOf(type, 'minecraft:liquid_clipped');
    if (liquidClipped !== undefined) properties.liquid_clipped = liquidClipped;
    const shouldDespawn = bedrockBooleanOf(type, 'minecraft:should_despawn');
    if (shouldDespawn !== undefined) properties.should_despawn = shouldDespawn;
    const stackedByData = bedrockBooleanOf(type, 'minecraft:stacked_by_data');
    if (stackedByData !== undefined) properties.stacked_by_data = stackedByData;

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

    const repairableParams = type.params(repairable);
    if (repairableParams !== undefined) {
        const items = bedrockItemNamesOf(repairableParams.items, options);
        if (items !== undefined) {
            projected['minecraft:repairable'] = {
                repairItems: items.map((name) => ({ items: [name] }))
            };
        }
    }

    return projected;
};
