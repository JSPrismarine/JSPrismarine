import { Item } from '../../item/Item';
import { ContainerUiId } from '../type/ItemStackRequest';
import DataPacket from './DataPacket';

/**
 * One slot of one container, changed.
 *
 * The counterpart to `InventoryContentPacket` for a single slot, and the only way to tell a
 * client about a slot it did not ask about. An `ItemStackResponse` only reaches the client that
 * sent the request, so another player with the same chest open learns of a change through this.
 *
 * Wire order at protocol 2193: `Container Id` (varuint32, despite the docs page typing it as
 * a uint8 - gophertunnel and PocketMine both read a varuint here), `Slot` (varuint32),
 * `Full Container Name` as an optional, `Storage Item` as an optional
 * `NetworkItemStackDescriptor`, then `Item`.
 *
 * **Bound To:** Client
 */
export default class InventorySlotPacket extends DataPacket {
    /** `Container Id`; the crafting grid lives in the player's own UI, which is 124. */
    public windowId!: number;

    /** `Slot`, in the client's numbering - 28 upwards for the inventory's crafting grid. */
    public inventorySlot!: number;

    /** The `Container Name` of `Full Container Name`. */
    public containerId: number = ContainerUiId.CRAFTING_INPUT;

    /** The `Dynamic ID` of `Full Container Name`, absent unless several of a kind are open. */
    public dynamicId: number | null = null;

    /** `Item`: what is in the slot now. `null` empties it. */
    public item: Item | null = null;

    /** Writes the five fields in docs order. */
    public encodePayload(): void {
        this.writeUnsignedVarInt(this.windowId);
        this.writeUnsignedVarInt(this.inventorySlot);

        // The container name is itself optional, and the presence byte was missing: the client
        // read the container id in its place, and every field after it landed a byte out.
        this.writeBoolean(true);
        this.writeByte(this.containerId);
        this.writeBoolean(this.dynamicId !== null);
        if (this.dynamicId !== null) this.writeIntLE(this.dynamicId);

        // The storage item, which is what a bundle-like container is itself held as. Nothing
        // here has one, so the optional is simply absent.
        this.writeBoolean(false);

        // Air is a whole item instance - eight bytes - not a bare zero. Writing one byte here
        // ended the packet seven bytes early, which a real client reads as a malformed packet
        // and hangs up on.
        //
        // A stack goes out with the id the client will name it by, when it has one.
        if (this.item) this.item.networkSerialize(this, this.item.stackNetworkId > 0 ? this.item.stackNetworkId : null);
        else Item.air().networkSerialize(this);
    }

    /** Reads the five fields in docs order, as {@link InventorySlotPacket.encodePayload} writes them. */
    public decodePayload(): void {
        this.windowId = this.readUnsignedVarInt();
        this.inventorySlot = this.readUnsignedVarInt();

        if (this.readBoolean()) {
            this.containerId = this.readByte();
            this.dynamicId = this.readBoolean() ? this.readIntLE() : null;
        }

        // The storage item. Nothing here is held in one, so it is read past and not kept.
        if (this.readBoolean()) Item.networkDeserialize(this);

        // An emptied slot arrives as a whole air stack, and an empty slot is `null` here.
        const item = Item.networkDeserialize(this);
        this.item = item.getName() === 'minecraft:air' ? null : item;
    }
}
