/**
 * A behavior pack's `item_catalog/crafting_item_catalog.json`, merged into the creative catalog.
 *
 * The catalog file names, per creative tab, groups of items: a group with a `group_identifier` is
 * a collapsible heading and merges into the heading of the same name, and a group without one is
 * loose items. Tabs cannot be added or reordered, and what a pack adds goes after what the tab
 * already holds. That is Mojang's description of how the Bedrock Dedicated Server merges a pack's
 * catalog into the vanilla one, in `CraftingItemCatalogDocumentation.md` of `bedrock-samples`.
 *
 * The vanilla catalog is the captured menu `@jsprismarine/bedrock-data` publishes, so a pack's
 * file is read in the same terms: headings, and entries that index them.
 */
import { NBTTagCompound, Types, ByteOrder } from '@jsprismarine/nbt';
import BinaryStream from '@jsprismarine/binaryutils';
import { blockRuntimeId } from '@jsprismarine/protocol';

import type {
    CreativeCatalog,
    CreativeCatalogEntry,
    CreativeCatalogGroup
} from '@jsprismarine/protocol/bedrock/payload';
import type { Definition } from '@jsprismarine/packs';

import type { ServerContent } from '../../content/ServerContent';
import { isRecord } from '../../utils/isRecord';

/** The tabs a catalog may name, as the JSON spells them. */
const TABS = new Set(['construction', 'nature', 'equipment', 'items']);

/** The wrapper key a catalog file's body sits under. */
const WRAPPER = 'minecraft:crafting_items_catalog';

/** A heading and its entries, in the order the menu draws them. */
interface Section {
    readonly group: CreativeCatalogGroup;
    readonly entries: Omit<CreativeCatalogEntry, 'group'>[];
}

/** An item a catalog names: `ns:item`, `ns:item:aux`, or either under `name`. */
const entryOf = (value: unknown): { name: string; meta?: number } | undefined => {
    const spelled = typeof value === 'string' ? value : isRecord(value) ? value.name : undefined;
    if (typeof spelled !== 'string') return undefined;

    const parts = spelled.split(':');
    const aux = parts.length === 3 ? Number(parts[2]) : Number.NaN;
    return Number.isInteger(aux) ? { name: `${parts[0]}:${parts[1]}`, meta: aux } : { name: spelled };
};

/**
 * The block state an entry that places a block carries, as the captured catalog stores it: a
 * little endian compound holding the default state's hashed runtime id.
 */
const blockStatesOf = (name: string, content: ServerContent): string | undefined => {
    const block = content.blocks.types.get(name);
    if (block === undefined) return undefined;

    const compound = new NBTTagCompound('');
    compound.addValue('network_id', new Types.NumberVal(blockRuntimeId(name, block.state().values)));
    const stream = new BinaryStream();
    compound.writeToStream(stream, ByteOrder.LITTLE_ENDIAN);
    return stream.getBuffer().toString('base64');
};

/**
 * The creative catalog with every pack's item catalog merged in, in pack order.
 *
 * @param base - The vanilla catalog.
 * @param documents - The `itemCatalog` registry's definitions.
 * @param content - Where the block an entry places is looked up.
 * @returns The merged catalog, or `base` itself when no pack has a catalog.
 */
export const mergeItemCatalogs = (
    base: CreativeCatalog,
    documents: Iterable<Pick<Definition, 'data'>>,
    content: ServerContent
): CreativeCatalog => {
    const files = [...documents];
    if (files.length === 0) return base;

    // The captured menu files each heading's entries together, in heading order.
    const sections: Section[] = base.groups.map((group) => ({ group, entries: [] }));
    for (const { group, ...entry } of base.entries) sections[group]?.entries.push(entry);

    const add = (tab: string, heading: { name: string; icon: string } | undefined, items: readonly unknown[]) => {
        const entries = items.flatMap((item) => {
            const named = entryOf(item);
            if (named === undefined) return [];
            const blockStates = blockStatesOf(named.name, content);
            return [{ ...named, ...(blockStates === undefined ? {} : { block_states: blockStates }) }];
        });

        const existing =
            heading === undefined
                ? undefined
                : sections.find((section) => section.group.category === tab && section.group.name === heading.name);
        if (existing !== undefined) {
            existing.entries.push(...entries);
            return;
        }

        const section: Section = {
            group: { name: heading?.name ?? '', category: tab, icon: heading?.icon ?? 'minecraft:air' },
            entries
        };
        // After the tab's last heading, so the tab's own headings stay where they were.
        const last = sections.findLastIndex((candidate) => candidate.group.category === tab);
        sections.splice(last + 1, 0, section);
    };

    for (const { data } of files) {
        const body = isRecord(data) ? data[WRAPPER] : undefined;
        const categories = isRecord(body) && Array.isArray(body.categories) ? body.categories : [];
        for (const category of categories) {
            if (!isRecord(category) || typeof category.category_name !== 'string') continue;
            const tab = category.category_name;
            if (!TABS.has(tab) || !Array.isArray(category.groups)) continue;

            for (const group of category.groups) {
                if (!isRecord(group) || !Array.isArray(group.items)) continue;
                const identifier = isRecord(group.group_identifier) ? group.group_identifier : undefined;
                const heading =
                    identifier !== undefined && typeof identifier.name === 'string'
                        ? {
                              name: identifier.name,
                              icon: typeof identifier.icon === 'string' ? identifier.icon : 'minecraft:air'
                          }
                        : undefined;
                add(tab, heading, group.items);
            }
        }
    }

    return {
        groups: sections.map((section) => section.group),
        entries: sections.flatMap((section, group) => section.entries.map((entry) => ({ ...entry, group })))
    };
};
