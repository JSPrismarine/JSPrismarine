import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * Which furnace screen the options belong to: the docs' `SetPlayerFurnaceOptionsPacketPayload
 * FurnaceType`. Numbered from 0 in schema order, which gophertunnel's `FurnaceType` constants
 * confirm.
 */
export enum FurnaceType {
    None = 0,
    Furnace = 1,
    BlastFurnace = 2,
    Smoker = 3
}

/** The docs' `FurnaceLeftTabIndex`: the recipe book tab open on the left of the screen. */
export enum FurnaceLeftTabIndex {
    None = 0,
    RecipeFood = 1,
    RecipeItems = 2,
    RecipeBlocks = 3,
    RecipeSearch = 4,
    Inventory = 5
}

/** The docs' `FurnaceLayout`: how the furnace screen is arranged. */
export enum FurnaceLayout {
    None = 0,
    InventoryOnly = 1,
    Default = 2
}

/**
 * How the player has arranged a furnace, blast furnace or smoker screen.
 *
 * The counterpart of `SetPlayerInventoryOptionsPacket` for the three smelting screens. A
 * preference, not state: nothing here changes what the furnace holds. Read so that changing a
 * tab in a furnace does not log `Packet 0x15f isn't implemented`.
 *
 * **Bound To:** Server
 *
 * Protocol 2193 layout (docs id 351), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | FurnaceType | uint8 | one of {@link FurnaceType} |
 * | Left Furnace Tab | varint32 | ZigZag; one of {@link FurnaceLeftTabIndex}; first of `Furnace Options` |
 * | Filtering | boolean | |
 * | Layout | varint32 | ZigZag; one of {@link FurnaceLayout} |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-player-furnace-options-packet/
 */
export default class SetPlayerFurnaceOptionsPacket extends FieldNetworkPacket {
    /** FurnaceType: which of the three smelting screens the options are for. */
    public furnaceType: FurnaceType = FurnaceType.None;

    /** Left Furnace Tab: the recipe book tab that is open. */
    public leftTab: FurnaceLeftTabIndex = FurnaceLeftTabIndex.None;

    /** Filtering: whether the recipe book hides recipes the player cannot make. */
    public filtering = false;

    /** Layout: the layout of the furnace screen. */
    public layout: FurnaceLayout = FurnaceLayout.None;

    /** Reads the furnace type and the three options. */
    public decodePayload(): void {
        this.furnaceType = this.readByte();
        this.leftTab = this.readVarInt();
        this.filtering = this.readBoolean();
        this.layout = this.readVarInt();
    }

    /** Writes the furnace type and the three options. */
    public encodePayload(): void {
        this.writeByte(this.furnaceType);
        this.writeVarInt(this.leftTab);
        this.writeBoolean(this.filtering);
        this.writeVarInt(this.layout);
    }
}
