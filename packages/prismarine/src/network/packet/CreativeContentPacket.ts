import { ItemInstanceUserData, NetworkBinaryStream, writeCreativeContent } from '@jsprismarine/protocol';

import { Item } from '../../item/Item';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

import type { CreativeContent, CreativeItemCategory, ItemStackData } from '@jsprismarine/protocol';

// The tabs and their names are the wire's, so they come from the packet that writes them.
export { CreativeItemCategory, creativeCategoryOf } from '@jsprismarine/protocol';

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
 * This server's `Item` as the plain stack a protocol payload carries.
 *
 * Air is the empty slot, and the empty slot is a bare zero rather than whatever number the item
 * table has for the name: `minecraft:air` is -158 there, and writing that leaves the client
 * holding a real item in every slot the player is not using.
 *
 * No stack here carries NBT, a can-place-on list or a can-destroy list yet, so the user data
 * blob is the empty structure plus the blocking tick required by `minecraft:blocks_attacks`.
 */
export const itemAsStack = (item: Item): ItemStackData => {
    const blob = new NetworkBinaryStream();
    const blocksAttacks = item.hasComponent('minecraft:blocks_attacks');
    new ItemInstanceUserData(null, blocksAttacks ? { blockingTick: 0n } : {}).serialize(blob);

    return {
        runtimeId: item.getName() === 'minecraft:air' ? 0 : item.getRuntimeId(),
        count: item.getAmount(),
        meta: item.meta,
        blockRuntimeId: item.getBlockRuntimeId(),
        userData: blob.getBuffer()
    };
};

/**
 * The contents of the creative menu, as the server's own `Item` instances.
 *
 * The wire format and its field order belong to `@jsprismarine/protocol`'s packet of the same
 * name, which takes plain numbers. This is the server's end of it: the two lists in terms of
 * `Item`, turned into that payload on the way out and read back into `Item` on the way in.
 *
 * **Bound To:** Client
 */
export default class CreativeContentPacket extends DataPacket {
    /** The headings, in the order the client draws them. An entry's group indexes this list. */
    public groups: CreativeGroup[] = [];

    /** The menu itself. Its order is what a creative pick is read against. */
    public entries: CreativeEntry[] = [];

    /**
     * The menu as plain stacks, which replaces {@link groups} and
     * {@link entries} when it is set.
     *
     * The content build produces one of these directly, because its items
     * are registry entries rather than this server's `Item` objects. Setting
     * it is how a creative menu built from the registries is sent without
     * going back through a class the content build does not use.
     */
    public payload: CreativeContent | null = null;

    public encodePayload(): void {
        const payload: CreativeContent = this.payload ?? {
            groups: this.groups.map(({ category, name, icon }) => ({ category, name, icon: itemAsStack(icon) })),
            entries: this.entries.map(({ item, group }) => ({ item: itemAsStack(item), group }))
        };

        const stream = new NetworkBinaryStream();
        writeCreativeContent(stream, payload);
        this.write(stream.getBuffer());
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
