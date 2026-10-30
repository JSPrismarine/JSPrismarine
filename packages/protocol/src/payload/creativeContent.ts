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

        entries.push({
            creativeNetId: entries.length + 1,
            item: instance(entry.name, entry.meta ?? 0, entry.block_states, entry.nbt),
            group: entry.group
        });
    }

    return { groups, entries, unknown };
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
