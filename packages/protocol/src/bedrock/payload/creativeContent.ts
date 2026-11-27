/**
 * `CreativeContentPacket`: the creative menu's headings and the items filed
 * under them.
 *
 * It is a separate packet from the item registry, and the distinction
 * matters. The registry is what lets the client resolve an item at all; this
 * is what lets a player find one. An item in the registry and not here is
 * reachable only through a command, which is the symptom Mojang's own
 * troubleshooting page lists as "Item not in creative inventory".
 *
 * Two orders are load bearing. A group is referred to by its index, so the
 * headings travel with the entries or neither means anything; and a creative
 * pick comes back as the entry's network id, so the entry order is what a
 * pick is read against.
 */
import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTTagCompound } from '@jsprismarine/nbt';

import type { BedrockOnlyItemProperties } from './itemRegistry';

/** The wire's `CreativeItemCategory`: which tab a heading sits in. */
export enum CreativeItemCategory {
    ALL = 0,
    CONSTRUCTION = 1,
    NATURE = 2,
    EQUIPMENT = 3,
    ITEMS = 4,
    /** The JSON spells this `none`: in the registry, out of the menu. */
    ITEM_COMMAND_ONLY = 5,
    UNDEFINED = 6
}

const CATEGORIES_BY_NAME = new Map<string, CreativeItemCategory>([
    ...Object.entries(CreativeItemCategory)
        .filter((entry): entry is [string, CreativeItemCategory] => typeof entry[1] === 'number')
        .map(([name, value]): [string, CreativeItemCategory] => [name.toLowerCase().replace(/_/g, ''), value]),
    ['none', CreativeItemCategory.ITEM_COMMAND_ONLY],
    ['item_command_only', CreativeItemCategory.ITEM_COMMAND_ONLY]
]);

/**
 * The category a catalog's name stands for.
 *
 * The two spellings differ: the JSON writes `construction`, `nature`,
 * `equipment`, `items` and `none`, and the wire numbers them 1 through 5
 * with `ItemCommandOnly` where the JSON says `none`.
 */
export const creativeCategoryOf = (name: string): CreativeItemCategory =>
    CATEGORIES_BY_NAME.get(name.toLowerCase()) ?? CreativeItemCategory.ITEMS;

/**
 * One heading of a creative catalog, in the shape
 * `@jsprismarine/bedrock-data` publishes it so `creative_groups` can be
 * passed through unchanged.
 */
export interface CreativeCatalogGroup {
    /** A translation key such as `itemGroup.name.planks`, or empty for a heading-less group. */
    name: string;
    /** `construction`, `nature`, `equipment`, `items` or `none`. */
    category: string;
    /** The item drawn beside the heading. */
    icon: string;
    /** The icon's block state, as base64 little endian NBT carrying a `network_id`. */
    icon_block_states?: string;
}

/** One entry of a creative catalog, in the same published shape. */
export interface CreativeCatalogEntry {
    name: string;
    /** An index into the catalog's groups. */
    group: number;
    /** The state the entry places, as base64 little endian NBT carrying a `network_id`. */
    block_states?: string;
    /**
     * The hashed runtime id of the state the entry places, for an entry no capture holds a
     * `block_states` for, such as a pack's block. Read when `block_states` is absent.
     */
    block_runtime_id?: number;
    meta?: number;
    /** The entry's own NBT, as base64. */
    nbt?: string;
}

/** A creative catalog: the headings and the entries, which only mean anything together. */
export interface CreativeCatalog {
    readonly groups: readonly CreativeCatalogGroup[];
    readonly entries: readonly CreativeCatalogEntry[];
}

/** One item stack as the creative packet carries it. */
export interface WireItemInstance {
    /** The namespaced identifier, kept so a caller does not have to invert the id. */
    readonly name: string;
    /** `Item Id` from the item registry. */
    readonly runtimeId: number;
    readonly count: number;
    /** The aux value, which is the damage or the variant. */
    readonly meta: number;
    /** The hashed block runtime id for an entry that places a block, and 0 for one that does not. */
    readonly blockRuntimeId: number;
    /** The entry's own NBT, when the catalog gave it any. */
    readonly nbt?: Buffer;
}

/** A heading of the creative menu. */
export interface CreativeGroup {
    readonly category: CreativeItemCategory;
    /** A translation key, or empty for a group the client draws without a heading. */
    readonly name: string;
    readonly icon: WireItemInstance;
}

/** One entry of the creative menu, and the heading it sits under. */
export interface CreativeEntry {
    /** The one-based id a creative pick comes back as. */
    readonly creativeNetId: number;
    readonly item: WireItemInstance;
    /** An index into {@link CreativeContentResult.groups}. */
    readonly group: number;
}

/** Options for {@link buildCreativeContent}. */
export interface CreativeContentOptions {
    /**
     * Keep an entry whose item has no id in the registry. It is off by
     * default: the client resolves a creative entry through the item
     * registry, so an entry it cannot resolve is at best a blank slot.
     */
    keepUnknown?: boolean;
}

/** What {@link buildCreativeContent} produced, and what it left out. */
export interface CreativeContentResult {
    /** The headings, in catalog order; an entry's `group` indexes this list. */
    readonly groups: readonly CreativeGroup[];
    /** The menu, in catalog order, numbered from 1. */
    readonly entries: readonly CreativeEntry[];
    /** Catalog entries whose item the registry does not name. */
    readonly unknown: readonly string[];
}

/**
 * The hashed block runtime id inside a catalog's base64 block state.
 *
 * It is a plain little endian compound rather than the network flavor, which
 * is how `@jsprismarine/bedrock-data` stores it, and the one field that
 * matters is `network_id`: the FNV-1a hash the server and client both
 * compute, which is why the catalog can carry it at all.
 */
const blockRuntimeIdOf = (blockStates: string | undefined): number => {
    if (blockStates === undefined) return 0;
    const stream = new BinaryStream(Buffer.from(blockStates, 'base64'));

    return NBTTagCompound.readFromStream(stream, ByteOrder.LITTLE_ENDIAN).getNumber('network_id', 0);
};

/** Looks an item's `Item Id` up by name. */
export type ItemIdLookup = (identifier: string) => number | undefined;

/**
 * Builds a lookup from what {@link buildItemRegistry} produced, so the two
 * packets cannot disagree about a number.
 */
export const itemIdsOf = (entries: readonly { name: string; runtimeId: number }[]): ItemIdLookup => {
    const ids = new Map(entries.map((entry) => [entry.name, entry.runtimeId]));
    return (identifier) => ids.get(identifier);
};

/**
 * Builds the creative menu.
 *
 * @param items - How to resolve an identifier to the number the item
 *   registry gave it; {@link itemIdsOf} builds one from that registry.
 * @param catalog - The headings and the entries, in the order the client
 *   should draw them.
 * @returns The groups and entries, plus the names no id could be found for.
 */
export const buildCreativeContent = (
    items: ItemIdLookup,
    catalog: CreativeCatalog,
    options: CreativeContentOptions = {}
): CreativeContentResult => {
    const keepUnknown = options.keepUnknown ?? false;
    const unknown: string[] = [];

    const instance = (
        name: string,
        meta: number,
        blockStates: string | undefined,
        nbt: string | undefined
    ): WireItemInstance => ({
        name,
        runtimeId: items(name) ?? 0,
        count: 1,
        meta,
        blockRuntimeId: blockRuntimeIdOf(blockStates),
        ...(nbt !== undefined ? { nbt: Buffer.from(nbt, 'base64') } : {})
    });

    const groups = catalog.groups.map((group): CreativeGroup => ({
        category: creativeCategoryOf(group.category),
        name: group.name,
        icon: instance(group.icon, 0, group.icon_block_states, undefined)
    }));

    const entries: CreativeEntry[] = [];
    for (const entry of catalog.entries) {
        if (items(entry.name) === undefined) {
            unknown.push(entry.name);
            if (!keepUnknown) continue;
        }

        const item = instance(entry.name, entry.meta ?? 0, entry.block_states, entry.nbt);
        entries.push({
            creativeNetId: entries.length + 1,
            item:
                entry.block_states === undefined && entry.block_runtime_id !== undefined
                    ? { ...item, blockRuntimeId: entry.block_runtime_id }
                    : item,
            group: entry.group
        });
    }

    return { groups, entries, unknown };
};

/**
 * Where a pack's block or item asks to sit in the creative menu: its `menu_category`.
 *
 * A Bedrock Dedicated Server reads it from `description.menu_category` of the block or item
 * file, and the client knows the content only by what that server sends, so the file is the
 * whole of the input.
 */
export interface PackMenuPlacement {
    /** The block or item identifier. */
    readonly name: string;
    /**
     * `construction`, `nature`, `equipment`, `items` or `none`, or undefined when the file
     * declares no `menu_category`. `none` and undefined both keep the entry out of the menu.
     */
    readonly category: string | undefined;
    /** The group key as the file writes it, such as `minecraft:itemGroup.name.stairs`. */
    readonly group?: string;
    /** For a block, the hashed runtime id of the state its entry places. */
    readonly blockRuntimeId?: number;
}

/** What {@link withPackMenuPlacements} produced. */
export interface PackCreativeMenu {
    /** The catalog with the packs' groups and entries after the vanilla ones. */
    readonly catalog: CreativeCatalog;
    /**
     * The `creative_category` and `creative_group` an item's registry entry carries: the
     * pack's own placement for a pack item, and {@link creativeItemProperties} otherwise.
     */
    readonly itemProperties: (identifier: string) => Partial<BedrockOnlyItemProperties>;
}

/** The namespace a pack writes before a vanilla group's key, which the catalog leaves off. */
const VANILLA_GROUP_NAMESPACE = 'minecraft:';

/**
 * The catalog heading a pack's group key names: the key without its `minecraft:` namespace, the
 * way a Bedrock Dedicated Server matches it, so `minecraft:itemGroup.name.planks` is the vanilla
 * `itemGroup.name.planks`. Any other key is the heading's name as written.
 *
 * @param group - The group key as a pack file writes it.
 */
export const creativeGroupName = (group: string): string =>
    group.startsWith(VANILLA_GROUP_NAMESPACE) ? group.slice(VANILLA_GROUP_NAMESPACE.length) : group;

/**
 * Files pack blocks and items into a creative catalog, as a Bedrock Dedicated Server
 * 1.26.60.6 does.
 *
 * Every rule here was read off `CreativeContentPacket` from that server with the
 * `scenarios/pack-blocks/creative_menu` pack of `@jsprismarine/parity` loaded:
 *
 * - A `none` category, or no `menu_category`, leaves the entry out of the menu.
 * - A group in the `minecraft` namespace files the entry under the vanilla group of that key
 *   without its namespace: `minecraft:itemGroup.name.stairs` joins `itemGroup.name.stairs`.
 * - Any other group gets a heading of its own, named as the file writes it and drawn with an
 *   empty icon, after every vanilla heading. Later entries naming it join it.
 * - An entry with no group joins the last heading of its category when that heading has no
 *   name, and opens a nameless heading of its own otherwise.
 * - The packs' entries follow every vanilla entry.
 *
 * That server walks the packs' content in an order of its own, which decides the order of the
 * headings it opens and whether an entry with no group finds a nameless heading or opens one.
 * This walks the placements tab by tab, construction first, and within a tab the grouped
 * placements before the rest, so a tab a pack gives a named group still ends with a nameless
 * heading for the pack's other entries, as the captures show.
 *
 * @param catalog - The catalog to add to: the vanilla one, with any pack item catalogs merged in.
 * @param placements - The packs' blocks and items, in the order to file them. An identifier
 *   the catalog already lists, or that an earlier placement named, gets no second entry: the
 *   client already has one. A listed pack item's registry entry still takes its group key from
 *   its placement.
 */
export const withPackMenuPlacements = (
    catalog: CreativeCatalog,
    placements: Iterable<PackMenuPlacement>
): PackCreativeMenu => {
    const groups = [...catalog.groups];
    const entries = [...catalog.entries];
    const listed = new Set(catalog.entries.map((entry) => entry.name));
    // A named heading by its name, which no two vanilla headings share.
    const headings = new Map<string, number>();
    groups.forEach((group, index) => {
        if (group.name !== '' && !headings.has(group.name)) headings.set(group.name, index);
    });

    const fromCatalog = creativeItemProperties(catalog);
    const shown: (PackMenuPlacement & { readonly category: string })[] = [];
    const properties = new Map<string, Partial<BedrockOnlyItemProperties>>();
    for (const placement of placements) {
        if (properties.has(placement.name)) continue;
        if (listed.has(placement.name)) {
            // A pack's item catalog filed it: the registry entry takes the tab from there and the
            // group key from the file, as that server sends it.
            properties.set(placement.name, {
                ...fromCatalog(placement.name),
                creative_group: placement.group ?? ''
            });
            continue;
        }
        const { category } = placement;
        const hidden = category === undefined || category.toLowerCase() === 'none';
        // The registry entry that server sends says 6, not the command-only 5, for both.
        properties.set(placement.name, {
            creative_category: hidden ? CreativeItemCategory.UNDEFINED : creativeCategoryOf(category),
            creative_group: placement.group ?? ''
        });
        if (!hidden) shown.push({ ...placement, category });
    }

    const addHeading = (category: string, name: string): number => {
        // Air is the empty slot, which is the icon that server draws a pack's heading with.
        groups.push({ name, category, icon: 'minecraft:air' });
        return groups.length - 1;
    };

    const named = (category: string, group: string): number => {
        const existing = headings.get(creativeGroupName(group)) ?? headings.get(group);
        if (existing !== undefined) return existing;
        const added = addHeading(category, group);
        headings.set(group, added);
        return added;
    };

    const nameless = (category: string): number => {
        const tab = creativeCategoryOf(category);
        const last = groups.findLastIndex((group) => creativeCategoryOf(group.category) === tab);
        return groups[last]?.name === '' ? last : addHeading(category, '');
    };

    const order = (placement: PackMenuPlacement & { readonly category: string }): number =>
        creativeCategoryOf(placement.category) * 2 + (placement.group ? 0 : 1);
    // A stable sort keeps the given order within a tab's grouped or ungrouped placements.
    const ordered = shown.toSorted((a, b) => order(a) - order(b));
    for (const placement of ordered) {
        entries.push({
            name: placement.name,
            group: placement.group ? named(placement.category, placement.group) : nameless(placement.category),
            ...(placement.blockRuntimeId === undefined ? {} : { block_runtime_id: placement.blockRuntimeId })
        });
    }

    return {
        catalog: { groups, entries },
        itemProperties: (identifier) => properties.get(identifier) ?? fromCatalog(identifier)
    };
};

/**
 * The `creative_category` and `creative_group` an item's registry entry
 * carries, taken from the catalog it appears in.
 *
 * These are two of the seven `item_properties` keys no Java component
 * decides, so without this the item registry has to guess them. Pass the
 * result as `buildItemRegistry`'s `bedrockOnly`.
 *
 * @returns A lookup over every item in the catalog; an item that is in no
 *   group gets nothing, and keeps the registry's defaults.
 */
export const creativeItemProperties = (
    catalog: CreativeCatalog
): ((identifier: string) => Partial<BedrockOnlyItemProperties>) => {
    const properties = new Map<string, Partial<BedrockOnlyItemProperties>>();

    for (const entry of catalog.entries) {
        if (properties.has(entry.name)) continue;
        const group = catalog.groups[entry.group];
        if (group === undefined) continue;

        properties.set(entry.name, {
            creative_category: creativeCategoryOf(group.category),
            creative_group: group.name
        });
    }

    return (identifier) => properties.get(identifier) ?? {};
};
