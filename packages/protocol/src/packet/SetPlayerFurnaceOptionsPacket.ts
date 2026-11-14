import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { setPlayerFurnaceOptionsPacket } from '../wire/definitions/setPlayerFurnaceOptions';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { SetPlayerFurnaceOptionsPayload } from '../wire/definitions/setPlayerFurnaceOptions';

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
export type FurnaceOptions = SetPlayerFurnaceOptionsPayload['options'];

/** The fields of a `SetPlayerFurnaceOptionsPacket`, in wire order. */
export type SetPlayerFurnaceOptions = SetPlayerFurnaceOptionsPayload;

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
        layoutAt(setPlayerFurnaceOptionsPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): SetPlayerFurnaceOptions {
        return layoutAt(setPlayerFurnaceOptionsPacket, this.codecProtocol).decode(stream);
    }
}
