import { Item } from '../../item/Item';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * Which tab of the creative menu a group belongs to.
 *
 * Mirrors `CreativeItemCategory`. Only `ITEMS` is used here, because nothing in this server's
 * data says which tab an entry belongs in. See {@link CreativeContentPacket.groups}.
 */
export enum CreativeCategory {
    ALL,
    CONSTRUCTION,
    NATURE,
    EQUIPMENT,
    ITEMS,
    ITEM_COMMAND_ONLY,
    UNDEFINED
}

/** A heading in the creative menu, with the item shown beside it. */
export interface CreativeGroup {
    category: CreativeCategory;
    /** A translation key such as `itemGroup.name.planks`, or empty for an anonymous group. */
    name: string;
    icon: Item;
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
 * the client draws its members loose, without a heading. This server has no group data, so it
 * sends one anonymous group and files every entry under index 0.
 *
 * Known gap: BDS behavior packs carry a `menu_category` per item with both the tab and the
 * group name. This server's `creativeitems.json` carries neither, so every entry sits in the
 * one anonymous group and the menu shows no headings.
 *
 * **Bound To:** Client
 */
export default class CreativeContentPacket extends DataPacket {
    public static NetID = Identifiers.CreativeContentPacket;

    public items: Item[] = [];

    /**
     * The groups the items are filed under.
     *
     * One anonymous group by default, which every item then points at. Left empty this would
     * be a menu the client cannot draw: an item's group index has to name a group that exists.
     */
    public groups: CreativeGroup[] = [
        {
            category: CreativeCategory.ITEMS,
            name: '',
            icon: Item.air()
        }
    ];

    public encodePayload(): void {
        // A menu with no items needs no groups either, and sending a group with nothing under
        // it leaves an empty heading in the tab.
        const groups = this.items.length === 0 ? [] : this.groups;

        this.writeUnsignedVarInt(groups.length);
        for (const group of groups) {
            this.writeByte(group.category);
            NetworkUtil.writeString(this, group.name);
            group.icon.networkSerializeWithoutStackId(this);
        }

        this.writeUnsignedVarInt(this.items.length);
        for (const [i, item] of this.items.entries()) {
            this.writeUnsignedVarInt(i + 1); // Creative Net Id, one-based.
            item.networkSerializeWithoutStackId(this);
            this.writeUnsignedVarInt(0); // Group Index: the one anonymous group.
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
            this.items.push(Item.networkDeserializeWithoutStackId(this));
            this.readUnsignedVarInt(); // Group Index.
        }
    }
}
