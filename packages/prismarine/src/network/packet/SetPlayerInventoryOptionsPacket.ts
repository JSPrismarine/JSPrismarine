import { InventoryLayout, InventoryLeftTab, InventoryRightTab } from '@jsprismarine/minecraft';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

// All three are generated from Mojang's documentation, where they are `InventoryLeftTabIndex`,
// `InventoryRightTabIndex` and `InventoryLayout`.
export { InventoryLayout, InventoryLeftTab, InventoryRightTab };

/**
 * How the player has arranged their inventory screen.
 *
 * Preference, not state: nothing here changes what the player owns. It is kept so that the
 * choice survives a rejoin, and read at all because a packet left unread is a packet the
 * server reports as unimplemented every time a tab is clicked.
 *
 * **Bound To:** Server
 */
export default class SetPlayerInventoryOptionsPacket extends DataPacket {
    public static NetID = Identifiers.SetPlayerInventoryOptionsPacket;

    public leftTab: InventoryLeftTab = InventoryLeftTab.NONE;
    public rightTab: InventoryRightTab = InventoryRightTab.NONE;
    public filtering = false;
    public inventoryLayout: InventoryLayout = InventoryLayout.NONE;
    public craftingLayout: InventoryLayout = InventoryLayout.NONE;

    public decodePayload(): void {
        this.leftTab = this.readVarInt();
        this.rightTab = this.readVarInt();
        this.filtering = this.readBoolean();
        this.inventoryLayout = this.readVarInt();
        this.craftingLayout = this.readVarInt();
    }

    public encodePayload(): void {
        this.writeVarInt(this.leftTab);
        this.writeVarInt(this.rightTab);
        this.writeBoolean(this.filtering);
        this.writeVarInt(this.inventoryLayout);
        this.writeVarInt(this.craftingLayout);
    }
}
