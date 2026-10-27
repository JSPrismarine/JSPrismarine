/**
 * `ItemRegistryPacket.Item Data`: every item name the client may be told
 * about, the number each travels as, and the components that define the ones
 * the client does not already know.
 *
 * The component compound comes from `projectItemToBedrock` in
 * `@jsprismarine/items`, which turns one resolved type into the keys a
 * Bedrock server writes. This module does the part that package deliberately
 * left out: it gives each value an NBT tag type, fills the seven
 * `item_properties` keys no Java component decides, and pairs the compound
 * with a numeric id.
 *
 * Every tag type below is read off the `item_components` capture that
 * `@jsprismarine/bedrock-data` publishes, taken from a Bedrock Dedicated
 * Server 1.26.51.1. The two that look like mistakes are not:
 * `minecraft:max_stack_size.value` is a byte while `item_properties
 * .max_stack_size` is an int, and `hidden_in_commands` is a byte holding 2 on
 * every one of the 78 items the server sends components for.
 */
import { projectItemToBedrock } from '@jsprismarine/items';
import type { BEDROCK_ONLY_ITEM_PROPERTIES } from '@jsprismarine/items';
import type { NBTTagCompound } from '@jsprismarine/nbt';
import type { ItemRegistryEntry } from '@jsprismarine/protocol';

import type { NbtValue } from './nbt';
import { nbtByte, nbtCompound, nbtFloat, nbtInt, nbtList, nbtString } from './nbt';

import type {
    BedrockBlockPlacerComponent,
    BedrockItemBlockDescriptor,
    BedrockItemComponents,
    ItemType,
    ProjectionOptions
} from '@jsprismarine/items';

/** `Item Version` as the docs' `ItemVersion` enum numbers it. */
export const ITEM_VERSION = {
    /** The client builds the item from its own table and ignores the components. */
    Legacy: 0,
    /** The client builds the item from the components, which is what a custom item needs. */
    DataDriven: 1,
    /** No versioned definition; the client uses its built-in one. */
    None: 2
} as const;

/**
 * The first id handed to an item the captured table does not name.
 *
 * The highest vanilla id in the capture is well under 1000 and `Item Id` is
 * an int16, so 10000 leaves the vanilla range alone and still has 22767
 * numbers above it.
 */
export const FIRST_CUSTOM_ITEM_ID = 10000;

/** The `item_properties` keys {@link BEDROCK_ONLY_ITEM_PROPERTIES} names, which no Java component decides. */
export interface BedrockOnlyItemProperties {
    /** The creative tab, 1 construction through 5 command-only, from the creative catalog. */
    creative_category: number;
    /** The creative group's translation key, empty when the item is in no group. */
    creative_group: string;
    /** How many frames the resource pack's icon animation has. */
    frame_count: number;
    /** A byte the captured server sets to 2 on every item it sends components for. */
    hidden_in_commands: number;
    /** Whether the item's hit scan stops at liquid. */
    liquid_clipped: boolean;
    /** Whether a dropped stack despawns. */
    should_despawn: boolean;
    /** Whether two stacks with different damage values stack together. */
    stacked_by_data: boolean;
}

/**
 * What the captured server writes for the seven keys above when nothing
 * overrides them.
 *
 * `creative_category` is the one that is wrong by default rather than merely
 * unknown: it is a per-item fact of the creative catalog, and
 * `creativeItemProperties` in `./creativeContent` builds the override that
 * fixes it.
 */
export const BEDROCK_ONLY_ITEM_PROPERTY_DEFAULTS = {
    creative_category: 4,
    creative_group: '',
    frame_count: 1,
    hidden_in_commands: 2,
    liquid_clipped: false,
    should_despawn: true,
    stacked_by_data: false
    // The second half ties this to `@jsprismarine/items`: a key that package
    // adds to its list and this one does not fill fails to compile here
    // rather than reaching a client as an absent property.
} satisfies BedrockOnlyItemProperties & Record<(typeof BEDROCK_ONLY_ITEM_PROPERTIES)[number], unknown>;

/**
 * One row of a captured item table, in the shape
 * `@jsprismarine/bedrock-data` publishes it, so that `item_table` can be
 * passed through unchanged.
 */
export interface ItemTableRow {
    /** The number the client knows the name by; negative for a block's item form. */
    runtime_id: number;
    /** Whether the client builds the item from components rather than from its own table. */
    component_based: boolean;
    /** One of {@link ITEM_VERSION}. */
    version: number;
}

/** Options for {@link buildItemRegistry}. */
export interface ItemRegistryOptions {
    /**
     * The captured table: the authority on every vanilla name's number, its
     * component flag and its version. An item absent from it is treated as
     * one this server invented.
     */
    table?: Readonly<Record<string, ItemTableRow>>;
    /** Where allocation starts for an item the table does not name. */
    firstCustomItemId?: number;
    /** Fills the keys {@link BEDROCK_ONLY_ITEM_PROPERTIES} names, per item. */
    bedrockOnly?: (identifier: string) => Partial<BedrockOnlyItemProperties>;
    /** Passed through to `projectItemToBedrock`. */
    projection?: ProjectionOptions;
    /**
     * Which items travel with a component compound. The captured server
     * sends one only for the items it marks component based and leaves every
     * other item with the empty compound the field still requires, which is
     * the default here; `all` sends the projection for every item.
     */
    components?: 'component-based' | 'all';
}

/** An item the captured table does not name, and the number it was given. */
export interface AllocatedItemId {
    readonly identifier: string;
    readonly runtimeId: number;
}

/** What {@link buildItemRegistry} produced, and what it had to invent. */
export interface ItemRegistryResult {
    /** One entry per item, ready for `ItemRegistryPacket.items`, in identifier order. */
    readonly entries: readonly ItemRegistryEntry[];
    /** Items with no row in the captured table, which were given ids of this server's own. */
    readonly allocated: readonly AllocatedItemId[];
}

/**
 * Bedrock item atlas keys for vanilla component-based items whose internal
 * item names do not resolve to a client icon by themselves. The keys come
 * from Mojang/bedrock-samples v1.26.50.4's
 * `resource_pack/textures/item_texture.json`.
 */
const ITEM_ICON_TEXTURES: Readonly<Partial<Record<string, string>>> = {
    'minecraft:brewing_stand': 'brewing_stand',
    'minecraft:cauldron': 'cauldron',
    'minecraft:comparator': 'comparator',
    'minecraft:flower_pot': 'flower_pot',
    'minecraft:frame': 'item_frame',
    'minecraft:glow_frame': 'glow_item_frame',
    'minecraft:hopper': 'hopper',
    'minecraft:kelp': 'kelp',
    'minecraft:nether_sprouts': 'nether_sprouts',
    'minecraft:repeater': 'repeater',
    'minecraft:string': 'string',
    'minecraft:sugar_cane': 'reeds'
} satisfies Readonly<Record<string, string>>;

/** Writes `item_properties`, whose keys are flat and whose tag types do not follow from the values. */
const itemProperties = (
    projected: BedrockItemComponents,
    bedrockOnly: BedrockOnlyItemProperties,
    identifier?: string
): NBTTagCompound => {
    const source = projected.item_properties;
    const declaredIcon = projected['minecraft:icon'];
    const iconTexture = identifier === undefined ? undefined : ITEM_ICON_TEXTURES[identifier];
    const iconTextures = declaredIcon?.textures ?? (iconTexture === undefined ? {} : { default: iconTexture });
    const iconTextureTags: Record<string, NbtValue> = {};
    for (const [name, texture] of Object.entries(iconTextures)) iconTextureTags[name] = nbtString(texture);

    return nbtCompound({
        allow_off_hand: nbtByte(source.allow_off_hand ?? false),
        can_destroy_in_creative: nbtByte(source.can_destroy_in_creative ?? true),
        creative_category: nbtInt(bedrockOnly.creative_category),
        creative_group: nbtString(bedrockOnly.creative_group),
        damage: nbtInt(source.damage ?? 0),
        enchantable_slot: nbtString(source.enchantable_slot ?? 'none'),
        enchantable_value: nbtInt(source.enchantable_value ?? 0),
        foil: nbtByte(source.foil ?? false),
        frame_count: nbtInt(bedrockOnly.frame_count),
        hand_equipped: nbtByte(source.hand_equipped ?? false),
        hidden_in_commands: nbtByte(bedrockOnly.hidden_in_commands),
        liquid_clipped: nbtByte(source.liquid_clipped ?? bedrockOnly.liquid_clipped),
        max_stack_size: nbtInt(source.max_stack_size ?? 64),
        // A data-driven definition can provide its icon directly. These twelve
        // vanilla entries keep their atlas key because their item names do not resolve it.
        'minecraft:icon': nbtCompound({
            textures: nbtCompound(iconTextureTags)
        }),
        mining_speed: nbtFloat(source.mining_speed ?? 1),
        should_despawn: nbtByte(source.should_despawn ?? bedrockOnly.should_despawn),
        stacked_by_data: nbtByte(source.stacked_by_data ?? bedrockOnly.stacked_by_data),
        use_animation: nbtInt(source.use_animation ?? 0),
        use_duration: nbtInt(source.use_duration ?? 0)
    });
};

/** Writes one `minecraft:block_placer.use_on` selector as Bedrock NBT. */
const blockDescriptorNbt = (descriptor: string | BedrockItemBlockDescriptor): NBTTagCompound => {
    if (typeof descriptor === 'string') return nbtCompound({ name: nbtString(descriptor) });

    const states: Record<string, NbtValue> = {};
    for (const [name, value] of Object.entries(descriptor.states ?? {})) {
        if (typeof value === 'string') states[name] = nbtString(value);
        else if (typeof value === 'boolean') states[name] = nbtByte(value);
        else if (Number.isSafeInteger(value)) states[name] = nbtInt(value);
    }

    return nbtCompound({
        name: descriptor.name === undefined ? undefined : nbtString(descriptor.name),
        states: descriptor.states === undefined ? undefined : nbtCompound(states),
        tags: descriptor.tags === undefined ? undefined : nbtString(descriptor.tags)
    });
};

/** Writes `minecraft:block_placer`, whose captured NBT names use camel case. */
const blockPlacerNbt = (component: BedrockBlockPlacerComponent): NBTTagCompound =>
    nbtCompound({
        alignedPlacement: nbtByte(component.alignedPlacement),
        block: component.block === undefined ? undefined : nbtString(component.block),
        canUseBlockAsIcon: nbtByte(component.canUseBlockAsIcon),
        replaceBlockItem: nbtByte(component.replaceBlockItem),
        use_on: nbtList(component.useOn.map(blockDescriptorNbt))
    });

/** Writes the named components that sit beside `item_properties`. */
const namedComponents = (projected: BedrockItemComponents): Readonly<Record<string, NbtValue>> => {
    const written: Record<string, NbtValue> = {};

    const blockPlacer = projected['minecraft:block_placer'];
    if (blockPlacer !== undefined) written['minecraft:block_placer'] = blockPlacerNbt(blockPlacer);

    const displayName = projected['minecraft:display_name'];
    if (displayName !== undefined) {
        written['minecraft:display_name'] = nbtCompound({ value: nbtString(displayName.value) });
    }

    const stackSize = projected['minecraft:max_stack_size'];
    // A byte here and an int in `item_properties`, which is what the capture
    // shows for the bundle.
    if (stackSize !== undefined) written['minecraft:max_stack_size'] = nbtCompound({ value: nbtByte(stackSize.value) });

    const damage = projected['minecraft:damage'];
    if (damage !== undefined) written['minecraft:damage'] = nbtCompound({ value: nbtInt(damage.value) });

    const durability = projected['minecraft:durability'];
    if (durability !== undefined) {
        written['minecraft:durability'] = nbtCompound({
            damage_chance: nbtCompound({
                max: nbtInt(durability.damage_chance.max),
                min: nbtInt(durability.damage_chance.min)
            }),
            max_durability: nbtInt(durability.max_durability)
        });
    }

    const enchantable = projected['minecraft:enchantable'];
    if (enchantable !== undefined) {
        written['minecraft:enchantable'] = nbtCompound({
            slot: nbtString(enchantable.slot),
            value: nbtInt(enchantable.value)
        });
    }

    const food = projected['minecraft:food'];
    if (food !== undefined) {
        written['minecraft:food'] = nbtCompound({
            can_always_eat: nbtByte(food.can_always_eat),
            nutrition: nbtInt(food.nutrition),
            saturation_modifier: nbtFloat(food.saturation_modifier),
            using_converts_to: food.using_converts_to === undefined ? undefined : nbtString(food.using_converts_to)
        });
    }

    const useDuration = projected['minecraft:use_duration'];
    if (useDuration !== undefined) written['minecraft:use_duration'] = nbtInt(useDuration);

    const useAnimation = projected['minecraft:use_animation'];
    if (useAnimation !== undefined) {
        written['minecraft:use_animation'] = nbtCompound({ value: nbtString(useAnimation.value) });
    }

    const useModifiers = projected['minecraft:use_modifiers'];
    if (useModifiers !== undefined) {
        written['minecraft:use_modifiers'] = nbtCompound({
            // Seconds here, where `item_properties.use_duration` is ticks.
            movement_modifier: nbtFloat(useModifiers.movement_modifier),
            use_duration: nbtFloat(useModifiers.use_duration / 20)
        });
    }

    const fuel = projected['minecraft:fuel'];
    if (fuel !== undefined) written['minecraft:fuel'] = nbtCompound({ duration: nbtFloat(fuel.duration) });

    const compostable = projected['minecraft:compostable'];
    if (compostable !== undefined) {
        written['minecraft:compostable'] = nbtCompound({
            composting_chance: nbtInt(compostable.composting_chance)
        });
    }

    const fireResistant = projected['minecraft:fire_resistant'];
    if (fireResistant !== undefined) {
        written['minecraft:fire_resistant'] = nbtCompound({ value: nbtByte(fireResistant.value) });
    }

    const handEquipped = projected['minecraft:hand_equipped'];
    if (handEquipped !== undefined) {
        written['minecraft:hand_equipped'] = nbtCompound({ value: nbtByte(handEquipped.value) });
    }

    const cooldown = projected['minecraft:cooldown'];
    if (cooldown !== undefined) {
        written['minecraft:cooldown'] = nbtCompound({
            category: nbtString(cooldown.category),
            duration: nbtFloat(cooldown.duration),
            type: nbtString(cooldown.type)
        });
    }

    const wearable = projected['minecraft:wearable'];
    if (wearable !== undefined) {
        written['minecraft:wearable'] = nbtCompound({
            protection: nbtInt(wearable.protection),
            slot: nbtString(wearable.slot)
        });
    }

    return written;
};

/**
 * The whole `Item Component Data` compound for one item: a single
 * `components` key, as every third-party implementation and the capture
 * agree.
 */
const itemComponentData = (
    projected: BedrockItemComponents,
    bedrockOnly: BedrockOnlyItemProperties,
    identifier?: string
): NBTTagCompound =>
    nbtCompound({
        components: nbtCompound({
            ...namedComponents(projected),
            item_properties: itemProperties(projected, bedrockOnly, identifier),
            // This is the resolved Bedrock membership, including definition overrides.
            item_tags: nbtList((projected.item_tags ?? []).map((tag) => nbtString(tag)))
        })
    });

/**
 * Builds the whole `Item Component Data` compound for one projected item.
 *
 * @param projected - The Java-derived components to write.
 * @param bedrockOnly - The item properties Bedrock supplies outside Java data.
 */
export const buildItemComponentData = (
    projected: BedrockItemComponents,
    bedrockOnly: BedrockOnlyItemProperties = BEDROCK_ONLY_ITEM_PROPERTY_DEFAULTS
): NBTTagCompound => itemComponentData(projected, bedrockOnly);

/**
 * Builds the `Item Data` array.
 *
 * Entries come out sorted by identifier, so the array is a pure function of
 * the registry's contents: two servers with the same items send the same
 * packet, whatever order they loaded in. Adding an item the captured table
 * does not name shifts the allocated ids of every item that sorts after it,
 * which is the same trade recipe network ids make; a client is told the whole
 * registry on join and never a patch of it.
 *
 * @param items - The resolved item types, in any order.
 * @returns The entries plus the items that had to be given an id.
 */
export const buildItemRegistry = (items: Iterable<ItemType>, options: ItemRegistryOptions = {}): ItemRegistryResult => {
    const table = options.table ?? {};
    const sendComponents = options.components ?? 'component-based';
    let nextItemId = options.firstCustomItemId ?? FIRST_CUSTOM_ITEM_ID;

    const entries: ItemRegistryEntry[] = [];
    const allocated: AllocatedItemId[] = [];
    const sorted = [...items].sort((left, right) => (left.identifier < right.identifier ? -1 : 1));

    for (const type of sorted) {
        const row = table[type.identifier];
        const runtimeId = row?.runtime_id ?? nextItemId++;
        if (row === undefined) allocated.push({ identifier: type.identifier, runtimeId });

        // An item this server invented is one the client has no table row
        // for, so it has to be component based and data driven or the client
        // cannot build it at all.
        const componentBased = row?.component_based ?? true;
        const version = row?.version ?? ITEM_VERSION.DataDriven;
        const withComponents = sendComponents === 'all' || componentBased;

        entries.push({
            name: type.identifier,
            runtimeId,
            componentBased,
            version,
            ...(withComponents
                ? {
                      componentData: itemComponentData(
                          projectItemToBedrock(type, options.projection),
                          {
                              ...BEDROCK_ONLY_ITEM_PROPERTY_DEFAULTS,
                              ...options.bedrockOnly?.(type.identifier)
                          },
                          type.identifier
                      )
                  }
                : {})
        });
    }

    return { entries, allocated };
};
