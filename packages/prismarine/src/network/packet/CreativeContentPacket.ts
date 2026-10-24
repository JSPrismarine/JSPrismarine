import { Item } from '../../item/Item';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * Which tab of the creative menu a group belongs to.
 *
 * Mirrors `CreativeItemCategory`. Only `ITEMS` is used here, because nothing in this server's
 * data says which tab an entry belongs in - see {@link CreativeContentPacket.groups}.
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
 * At 2168 the menu is two lists rather than one: the **groups** that head it, and then the
 * items, each naming the group it sits under by index. The order of both lists is the order
 * the client renders them in - it no longer imposes one of its own.
 *
 * Every item has to belong to a group. An item that belongs to no particular group points at
 * an *anonymous* group, which is one with an empty name; the client draws its members loose,
 * without a heading. This server has no group data at all - `creativeitems.json` carries a
 * name and nothing else - so it sends a single anonymous group and puts everything in it.
 *
 * TODO: BDS behaviour packs carry `menu_category` per item, with both the tab and the group
 * name. Extracting it would give this the real headings.
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
        for (let i = 0; i < this.items.length; ++i) {
            this.writeUnsignedVarInt(i + 1); // Creative net id, one-based.
            this.items[i]!.networkSerializeWithoutStackId(this);
            this.writeUnsignedVarInt(0); // The group it sits under.
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
            this.readUnsignedVarInt(); // Creative net id.
            this.items.push(Item.networkDeserializeWithoutStackId(this));
            this.readUnsignedVarInt(); // Group index.
        }
    }
}
