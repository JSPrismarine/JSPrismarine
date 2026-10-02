import { Item } from '../../item/Item';
import Identifiers from '../Identifiers';
import { ContainerUiId } from '../type/ItemStackRequest';
import DataPacket from './DataPacket';

/**
 * One slot of one container, changed.
 *
 * The counterpart to `InventoryContentPacket` for a single slot, and the only way to tell a
 * client about a slot it did not ask about. An `ItemStackResponse` can only answer for the
 * slots the request named: crafting spends the grid, and the actions a client sends for a
 * craft - `CraftingRecipe`, `CraftingResultsDeprecated`, `Take` - name no grid slot at all,
 * so the answer had nowhere to say the ingredients were gone. The log stayed on screen and
 * could be crafted from for ever, while the server had already spent it.
 *
 * **Bound To:** Client
 * @see https://github.com/pmmp/BedrockProtocol/blob/35.0.0%2Bbedrock-1.21.40/src/InventorySlotPacket.php
 */
export default class InventorySlotPacket extends DataPacket {
    public static NetID = Identifiers.InventorySlotPacket;

    /** Which window; the crafting grid lives in the player's own UI, which is 124. */
    public windowId!: number;

    /** The slot, in the client's numbering - 28 upwards for the inventory's crafting grid. */
    public inventorySlot!: number;

    public containerId: number = ContainerUiId.CRAFTING_INPUT;
    public dynamicId: number | null = null;

    /** What is in it now. `null` empties the slot. */
    public item: Item | null = null;

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
        // and hangs up on; this fires on every craft, where a spent grid slot is emptied.
        if (this.item) this.item.networkSerialize(this);
        else Item.air().networkSerialize(this);
    }
}
