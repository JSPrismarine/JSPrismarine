import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import ItemStack from '../structure/ItemStack';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { ItemStackData } from '../structure/ItemStack';

/**
 * The docs' `CreativeItemCategory`: which tab of the creative menu a group belongs to.
 *
 * The game data names a group's tab in words, which {@link creativeCategoryOf} turns into one
 * of these.
 */
export enum CreativeItemCategory {
    ALL,
    CONSTRUCTION,
    NATURE,
    EQUIPMENT,
    ITEMS,
    ITEM_COMMAND_ONLY,
    UNDEFINED
}

/**
 * The tabs by the name the game data uses for them, derived from the enum rather than listed
 * again beside it.
 */
const categoriesByName = new Map(
    Object.entries(CreativeItemCategory)
        .filter((member): member is [string, CreativeItemCategory] => typeof member[1] === 'number')
        .map(([name, value]) => [name.toLowerCase(), value])
);

/**
 * The tab a group sits in, from the name the game data gives it.
 *
 * `construction`, `nature`, `equipment` and `items` are the four vanilla uses. A name this does
 * not know falls back to the catch-all tab, because a menu drawn under the wrong heading is
 * still a menu and a group index pointing at nothing is not.
 * @param name - The tab name as the creative data writes it.
 * @returns The matching tab, or `ITEMS`.
 */
export const creativeCategoryOf = (name: string): CreativeItemCategory =>
    categoriesByName.get(name.toLowerCase()) ?? CreativeItemCategory.ITEMS;

/** A heading in the creative menu, with the item shown beside it. */
export interface CreativeGroup {
    category: CreativeItemCategory;
    /** A translation key such as `itemGroup.name.planks`, or empty for an anonymous group. */
    name: string;
    icon: ItemStackData;
}

/** One entry of the creative menu, and which heading it sits under. */
export interface CreativeEntry {
    item: ItemStackData;
    /** An index into {@link CreativeContent.groups}. */
    group: number;
}

/** The two lists the creative menu is made of. */
export interface CreativeContent {
    /** The headings, in the order the client draws them. An entry's group indexes this list. */
    groups: CreativeGroup[];
    /** The menu itself. Its order is what a creative pick is read against. */
    entries: CreativeEntry[];
}

/**
 * Writes the two lists without a packet header, for a caller that writes its own.
 *
 * The server's own packet class is that caller: it holds the menu as item instances and needs
 * the bytes of the payload alone, so the format lives here once and nothing reimplements it.
 */
export const writeCreativeContent = (stream: NetworkBinaryStream, data: CreativeContent): void => {
    stream.writeUnsignedVarInt(data.groups.length);
    for (const group of data.groups) {
        stream.writeByte(group.category);
        stream.writeString(group.name);
        ItemStack.from(group.icon).serialize(stream);
    }

    stream.writeUnsignedVarInt(data.entries.length);
    for (const [index, entry] of data.entries.entries()) {
        stream.writeUnsignedVarInt(index + 1); // Creative Net Id, one-based.
        ItemStack.from(entry.item).serialize(stream);
        stream.writeUnsignedVarInt(entry.group);
    }
};

/** Reads the two lists, the mirror of {@link writeCreativeContent}. */
export const readCreativeContent = (stream: NetworkBinaryStream): CreativeContent => {
    const groups = Array.from({ length: stream.readUnsignedVarInt() }, () => ({
        category: stream.readByte(),
        name: stream.readString(),
        icon: ItemStack.deserialize(stream).toData()
    }));

    const entries: CreativeEntry[] = [];
    for (let count = stream.readUnsignedVarInt(); count > 0; count--) {
        stream.readUnsignedVarInt(); // Creative Net Id, which is the entry's position.
        const item = ItemStack.deserialize(stream).toData();
        entries.push({ item, group: stream.readUnsignedVarInt() });
    }

    return { groups, entries };
};

/**
 * The contents of the creative menu.
 *
 * Two lists, in the order the client renders them. Groups come first: each
 * `CreativeGroupInfoPayload` is a Creative Category byte, a Name string and a Group Icon Item
 * written as an `ItemStack`. Entries follow: each `CreativeItemEntryPayload` is a one-based
 * Creative Net Id varuint32, the Item Instance as an `ItemStack`, and a Group Index varuint32
 * into the groups list.
 *
 * Every entry has to point at a group that exists. A group with an empty Name is anonymous:
 * the client draws its members loose, without a heading.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/creative-content-packet/
 */
export default class CreativeContentPacket extends NetworkPacket<CreativeContent> {
    public get id(): number {
        return PacketIdentifier.CREATIVE_CONTENT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: CreativeContent): void {
        writeCreativeContent(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): CreativeContent {
        return readCreativeContent(stream);
    }
}
