import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The docs' `SetPlayerFurnaceOptionsPacketPayload FurnaceType`: which furnace screen the options belong to. */
export enum FurnaceType {
    None = 0,
    Furnace = 1,
    BlastFurnace = 2,
    Smoker = 3
}

/** A `FurnaceLeftTabIndex`: the tab open on the left of the furnace screen. */
export enum FurnaceLeftTabIndex {
    None = 0,
    RecipeFood = 1,
    RecipeItems = 2,
    RecipeBlocks = 3,
    RecipeSearch = 4,
    Inventory = 5
}

/** A `FurnaceLayout`: how the furnace screen is arranged. */
export enum FurnaceLayout {
    None = 0,
    InventoryOnly = 1,
    Default = 2
}

/** The `FurnaceOptions` the player picked, in wire order. */
export interface FurnaceOptions {
    /** `Left Furnace Tab`. */
    leftTab: FurnaceLeftTabIndex;
    /** `Filtering`: the recipe book hides recipes the player cannot make. */
    filtering: boolean;
    /** `Layout`. */
    layout: FurnaceLayout;
}

/** The fields of a `SetPlayerFurnaceOptionsPacket`, in wire order. */
export interface SetPlayerFurnaceOptions {
    /** `FurnaceType`. */
    furnaceType: FurnaceType;
    /** `Furnace Options`. */
    options: FurnaceOptions;
}

/**
 * How the player has arranged a furnace, blast furnace or smoker screen. The client sends it
 * when the player changes a tab, the filter or the layout; the counterpart for the inventory
 * screen is `SetPlayerInventoryOptionsPacket`.
 *
 * Protocol 2193 layout, in wire order: `FurnaceType` as one byte ({@link FurnaceType}), then
 * `Furnace Options`: `Left Furnace Tab` as a ZigZag varint32 ({@link FurnaceLeftTabIndex}),
 * `Filtering` as one byte, then `Layout` as a ZigZag varint32 ({@link FurnaceLayout}).
 */
export default class SetPlayerFurnaceOptionsPacket extends NetworkPacket<SetPlayerFurnaceOptions> {
    public get id(): number {
        return PacketIdentifier.SET_PLAYER_FURNACE_OPTIONS;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: SetPlayerFurnaceOptions): void {
        stream.writeByte(data.furnaceType);
        stream.writeVarInt(data.options.leftTab);
        stream.writeBoolean(data.options.filtering);
        stream.writeVarInt(data.options.layout);
    }

    protected deserializePayload(stream: NetworkBinaryStream): SetPlayerFurnaceOptions {
        const furnaceType: FurnaceType = stream.readByte();
        const leftTab: FurnaceLeftTabIndex = stream.readVarInt();
        const filtering = stream.readBoolean();
        const layout: FurnaceLayout = stream.readVarInt();

        return { furnaceType, options: { leftTab, filtering, layout } };
    }
}
