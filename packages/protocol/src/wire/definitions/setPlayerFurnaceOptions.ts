/**
 * `SetPlayerFurnaceOptionsPacket`: how the player has arranged a furnace, blast furnace or smoker
 * screen.
 *
 * Protocol 2193 layout, in wire order: `FurnaceType` as one byte, then `Furnace Options`:
 * `Left Furnace Tab` as a ZigZag varint32, `Filtering` as one byte, then `Layout` as a ZigZag
 * varint32.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { FurnaceLayout, FurnaceLeftTabIndex, FurnaceType } from '../../packet/SetPlayerFurnaceOptionsPacket';
import type { PayloadOf } from '../define';

/** The `SetPlayerFurnaceOptionsPacket` field list. */
export const setPlayerFurnaceOptionsPacket = definePacket('SetPlayerFurnaceOptionsPacket', {
    /** `FurnaceType`: which furnace screen the options belong to, one byte. */
    furnaceType: t.enumOf<FurnaceType>(t.uint8),
    /** `Furnace Options`: the arrangement the player picked. */
    options: t.record({
        /** `Left Furnace Tab`: the tab open on the left of the furnace screen. */
        leftTab: t.enumOf<FurnaceLeftTabIndex>(t.varint32),
        /** `Filtering`: the recipe book hides recipes the player cannot make. */
        filtering: t.bool,
        /** `Layout`: how the furnace screen is arranged. */
        layout: t.enumOf<FurnaceLayout>(t.varint32)
    })
});

/** The fields of a `SetPlayerFurnaceOptionsPacket`, in wire order. */
export type SetPlayerFurnaceOptionsPayload = PayloadOf<typeof setPlayerFurnaceOptionsPacket>;
