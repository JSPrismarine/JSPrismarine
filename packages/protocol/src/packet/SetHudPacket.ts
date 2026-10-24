import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

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
export interface SetHud {
    /** `Hud Element`: the elements the change applies to. */
    elements: HudElement[];
    /** `Hud Visible`: hide the elements, or reset them to what the player configured. */
    visibility: HudVisibility;
}

/**
 * Hides HUD elements on the client, or restores them. Only the `/hud` command sends it; it
 * exists for third-party content.
 *
 * Protocol 2193 layout, in wire order: `Hud Element` as a varuint32 count followed by one
 * ZigZag varint32 {@link HudElement} per entry, then `Hud Visible` as a ZigZag varint32
 * {@link HudVisibility}.
 */
export default class SetHudPacket extends NetworkPacket<SetHud> {
    public get id(): number {
        return PacketIdentifier.SET_HUD;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: SetHud): void {
        stream.writeUnsignedVarInt(data.elements.length);
        for (const element of data.elements) {
            stream.writeVarInt(element);
        }
        stream.writeVarInt(data.visibility);
    }

    protected deserializePayload(stream: NetworkBinaryStream): SetHud {
        const elements: HudElement[] = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            elements.push(stream.readVarInt());
        }
        const visibility: HudVisibility = stream.readVarInt();

        return { elements, visibility };
    }
}
