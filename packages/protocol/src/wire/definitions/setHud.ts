/**
 * `SetHudPacket`: hides HUD elements on the client, or restores them. Only the `/hud` command
 * sends it; it exists for third-party content.
 *
 * Protocol 2193 layout, in wire order: `Hud Element` as a varuint32 count followed by one
 * ZigZag varint32 {@link HudElement} per entry, then `Hud Visible` as a ZigZag varint32
 * {@link HudVisibility}.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** A `HudElement` the `/hud` command can hide. The values are the ones the wire carries. */
export enum HudElement {
    PaperDoll = 0,
    Armor = 1,
    ToolTips = 2,
    TouchControls = 3,
    Crosshair = 4,
    HotBar = 5,
    Health = 6,
    ProgressBar = 7,
    Hunger = 8,
    AirBubbles = 9,
    HorseHealth = 10,
    StatusEffects = 11,
    ItemText = 12
}

/** A `HudVisibility`: whether the listed elements are hidden or restored to the player's own settings. */
export enum HudVisibility {
    Hide = 0,
    Reset = 1
}

/** The fields of a `SetHudPacket`, in wire order. */
export const setHudPacket = definePacket('SetHudPacket', {
    /** `Hud Element`: the elements the change applies to, as a varuint32 count then ZigZag varint32 values. */
    elements: t.list(t.enumOf<HudElement>(t.varint32)),
    /** `Hud Visible`: hide the elements, or reset them to what the player configured. */
    visibility: t.enumOf<HudVisibility>(t.varint32)
});

/** The fields of a `SetHudPacket`, in wire order. */
export type SetHudPayload = PayloadOf<typeof setHudPacket>;
