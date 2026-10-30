import { InventoryLayout, InventoryLeftTab, InventoryRightTab } from '@jsprismarine/minecraft';

import FieldNetworkPacket from '../FieldNetworkPacket';

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
 *
 * Protocol 2193 layout (docs id 307), one `InventoryOptions` in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Left Inventory Tab | varint32 | ZigZag; one of {@link InventoryLeftTab} |
 * | Right Inventory Tab | varint32 | ZigZag; one of {@link InventoryRightTab} |
 * | Filtering | boolean | |
 * | Layout Inv | varint32 | ZigZag; one of {@link InventoryLayout} |
 * | Layout Craft | varint32 | ZigZag; one of {@link InventoryLayout} |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-player-inventory-options-packet/
 */
export default class SetPlayerInventoryOptionsPacket extends FieldNetworkPacket {
    /** Left Inventory Tab: the recipe book tab that is open. */
    public leftTab: InventoryLeftTab = InventoryLeftTab.NONE;

    /** Right Inventory Tab: the inventory side tab that is open. */
    public rightTab: InventoryRightTab = InventoryRightTab.NONE;

    /** Filtering: whether the recipe book hides recipes the player cannot craft. */
    public filtering = false;

    /** Layout Inv: the layout of the inventory screen. */
    public inventoryLayout: InventoryLayout = InventoryLayout.NONE;

    /** Layout Craft: the layout of the crafting table screen. */
    public craftingLayout: InventoryLayout = InventoryLayout.NONE;

    /** Reads the five options. */
    public decodePayload(): void {
        this.leftTab = this.readVarInt();
        this.rightTab = this.readVarInt();
        this.filtering = this.readBoolean();
        this.inventoryLayout = this.readVarInt();
        this.craftingLayout = this.readVarInt();
    }

    /** Writes the five options. */
    public encodePayload(): void {
        this.writeVarInt(this.leftTab);
        this.writeVarInt(this.rightTab);
        this.writeBoolean(this.filtering);
        this.writeVarInt(this.inventoryLayout);
        this.writeVarInt(this.craftingLayout);
    }
}
