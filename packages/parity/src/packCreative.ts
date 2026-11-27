/**
 * The pack creative menu golden: where the pinned Bedrock Dedicated Server files the blocks and
 * items of `scenarios/pack-blocks/` in `CreativeContentPacket`, and the creative keys their
 * `ItemRegistryPacket` entries carry.
 *
 * The server walks a pack's content in an order of its own, so the golden records each entry's
 * heading rather than its position. A heading is named by its index in
 * {@link PackCreativeGolden.groups}, the packet's whole heading list, which shows where the
 * packs' headings sit among the vanilla ones: a pack's item catalog can file a heading inside a
 * tab, where a `menu_category` heading goes after every vanilla one.
 *
 * This module imports nothing beyond node and relative paths, so the capture script runs it
 * under plain node.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isRecord } from './isRecord.ts';

/** Where the capture writes the server's creative menu. */
export const PACK_CREATIVE_GOLDEN = join(import.meta.dirname, '..', 'goldens', 'pack-creative.json');

/** A heading of the menu. */
export interface PackCreativeGroup {
    /** The wire's `Creative Category`, 1 construction through 4 items. */
    readonly category: number;
    readonly name: string;
    /** The icon's item identifier, or the empty string for the empty slot. */
    readonly icon: string;
}

/** One pack entry of the menu. */
export interface PackCreativeEntry {
    /** The heading's index in the packet's group list. */
    readonly group: number;
    /** The hashed runtime id of the block the entry places, or 0 for an item. */
    readonly blockRuntimeId: number;
}

/** The two creative keys of a component item's `item_properties`. */
export interface PackCreativeItemProperties {
    readonly creative_category: number;
    readonly creative_group: string;
}

/** The checked-in golden. */
export interface PackCreativeGolden {
    readonly $comment: readonly string[];
    readonly server: { readonly protocolVersion: number; readonly serverVersion: string };
    /** Every heading of the menu, vanilla and pack, in packet order. */
    readonly groups: readonly PackCreativeGroup[];
    /** Every pack entry, by identifier. A pack block or item absent here is not in the menu. */
    readonly entries: Readonly<Record<string, PackCreativeEntry>>;
    /** The creative keys of each pack item's registry entry, by identifier. */
    readonly items: Readonly<Record<string, PackCreativeItemProperties>>;
}

/** The part of an `NBTTagCompound` the golden reads, so either side's module instance fits. */
export interface CompoundReader {
    getCompound(name: string, insert: boolean): CompoundReader | null;
    getNumber(name: string, defaultValue: number): number;
    getString(name: string, defaultValue: string): string;
}

/**
 * The creative keys of one registry entry's component data, or undefined for an entry with no
 * `item_properties`, such as a block's plain item.
 */
export const creativeItemPropertiesOf = (componentData: CompoundReader): PackCreativeItemProperties | undefined => {
    const properties = componentData.getCompound('components', false)?.getCompound('item_properties', false);
    if (properties === null || properties === undefined) return undefined;
    return {
        creative_category: properties.getNumber('creative_category', -1),
        creative_group: properties.getString('creative_group', '')
    };
};

const sortedRecord = <Value>(record: Readonly<Record<string, Value>>): Record<string, Value> =>
    Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1)));

const notGolden = (): Error => new Error(`${PACK_CREATIVE_GOLDEN} is not a pack creative golden.`);

const numberAt = (record: Record<string, unknown>, key: string): number => {
    const value = record[key];
    if (typeof value !== 'number') throw notGolden();
    return value;
};

const stringAt = (record: Record<string, unknown>, key: string): string => {
    const value = record[key];
    if (typeof value !== 'string') throw notGolden();
    return value;
};

const recordOf = (value: unknown): Record<string, unknown> => {
    if (!isRecord(value)) throw notGolden();
    return value;
};

const mapRecord = <Value>(value: unknown, read: (entry: Record<string, unknown>) => Value): Record<string, Value> =>
    Object.fromEntries(Object.entries(recordOf(value)).map(([key, entry]) => [key, read(recordOf(entry))]));

/** Reads the checked-in golden. */
export const readPackCreativeGolden = (): PackCreativeGolden => {
    const golden = recordOf(JSON.parse(readFileSync(PACK_CREATIVE_GOLDEN, 'utf8')));
    const server = recordOf(golden.server);
    if (!Array.isArray(golden.groups)) throw notGolden();
    return {
        $comment: Array.isArray(golden.$comment) ? golden.$comment.map(String) : [],
        server: {
            protocolVersion: numberAt(server, 'protocolVersion'),
            serverVersion: stringAt(server, 'serverVersion')
        },
        groups: golden.groups.map(recordOf).map((group) => ({
            category: numberAt(group, 'category'),
            name: stringAt(group, 'name'),
            icon: stringAt(group, 'icon')
        })),
        entries: mapRecord(golden.entries, (entry) => ({
            group: numberAt(entry, 'group'),
            blockRuntimeId: numberAt(entry, 'blockRuntimeId')
        })),
        items: mapRecord(golden.items, (item) => ({
            creative_category: numberAt(item, 'creative_category'),
            creative_group: stringAt(item, 'creative_group')
        }))
    };
};

/** The golden as the capture writes it: records in name order, four-space JSON. */
export const renderPackCreativeGolden = (golden: PackCreativeGolden): string =>
    `${JSON.stringify(
        { ...golden, entries: sortedRecord(golden.entries), items: sortedRecord(golden.items) },
        null,
        4
    )}\n`;
