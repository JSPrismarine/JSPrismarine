import { Item } from '../../item/Item';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

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
 * `construction`, `nature`, `equipment` and `items` are the four vanilla uses. A name this
 * does not know falls back to the catch-all tab, because a menu drawn under the wrong heading
 * is still a menu and a group index pointing at nothing is not.
 * @param {string} name - the tab name as the creative data writes it.
 * @returns {CreativeItemCategory} the matching tab, or `ITEMS`.
 */
export const creativeCategoryOf = (name: string): CreativeItemCategory =>
    categoriesByName.get(name.toLowerCase()) ?? CreativeItemCategory.ITEMS;

/** A heading in the creative menu, with the item shown beside it. */
export interface CreativeGroup {
    category: CreativeItemCategory;
    /** A translation key such as `itemGroup.name.planks`, or empty for an anonymous group. */
    name: string;
    icon: Item;
}

/** One entry of the creative menu, and which heading it sits under. */
export interface CreativeEntry {
    item: Item;
    /** An index into {@link CreativeContentPacket.groups}. */
    group: number;
}

/**
 * The contents of the creative menu.
 *
 * Two lists, in the order the client renders them. Groups come first: each
 * `CreativeGroupInfoPayload` is a Creative Category byte, a Name string and a Group Icon Item
 * written as a `NetworkItemInstanceDescriptor`. Entries follow: each `CreativeItemEntryPayload`
 * is a one-based Creative Net Id varuint32, the Item Instance as a
 * `NetworkItemInstanceDescriptor`, and a Group Index varuint32 into the groups list.
 *
 * Every entry has to point at a group that exists. A group with an empty Name is anonymous:
 * the client draws its members loose, without a heading.
 *
 * **Bound To:** Client
 */
export default class CreativeContentPacket extends DataPacket {
    public static NetID = Identifiers.CreativeContentPacket;

    /** The headings, in the order the client draws them. An entry's group indexes this list. */
    public groups: CreativeGroup[] = [];

    /** The menu itself. Its order is what a creative pick is read against. */
    public entries: CreativeEntry[] = [];

    public encodePayload(): void {
        this.writeUnsignedVarInt(this.groups.length);
        for (const group of this.groups) {
            this.writeByte(group.category);
            NetworkUtil.writeString(this, group.name);
            group.icon.networkSerializeWithoutStackId(this);
        }

        this.writeUnsignedVarInt(this.entries.length);
        for (const [i, entry] of this.entries.entries()) {
            this.writeUnsignedVarInt(i + 1); // Creative Net Id, one-based.
            entry.item.networkSerializeWithoutStackId(this);
            this.writeUnsignedVarInt(entry.group);
        }
    }

    public decodePayload(): void {
        const groups = this.readUnsignedVarInt();
        this.groups = Array.from({ length: groups }, () => ({
            category: this.readByte(),
            name: NetworkUtil.readString(this),
            icon: Item.networkDeserializeWithoutStackId(this)
        }));

        const count = this.readUnsignedVarInt();
        for (let i = 0; i < count; i++) {
            this.readUnsignedVarInt(); // Creative Net Id.
            const item = Item.networkDeserializeWithoutStackId(this);
            this.entries.push({ item, group: this.readUnsignedVarInt() });
        }
    }
}
