import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of a `PlayerStartItemCooldownPacket`, in wire order. */
export interface PlayerStartItemCooldown {
    /**
     * `Item Category`: the cooldown group the item belongs to, for example `ender_pearl`,
     * `chorus_fruit`, `shield` or `goat_horn`. Every item in the group shares the cooldown.
     */
    itemCategory: string;
    /** `Duration Ticks`: how long the cooldown runs, in game ticks. */
    durationTicks: number;
}

/**
 * Starts a cooldown on an item category for the receiving player.
 *
 * Protocol 2193 layout, in wire order: `Item Category` as a varuint32 byte length followed by
 * UTF-8, then `Duration Ticks` as a ZigZag varint32.
 *
 * The docs' summary says the player sends it, but it travels from the server to the client:
 * a Bedrock Dedicated Server sends it when a player uses an item with a cooldown, and the
 * client greys the category's slots out for the duration.
 */
export default class PlayerStartItemCooldownPacket extends NetworkPacket<PlayerStartItemCooldown> {
    public get id(): number {
        return PacketIdentifier.PLAYER_START_ITEM_COOLDOWN;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: PlayerStartItemCooldown): void {
        stream.writeString(data.itemCategory);
        stream.writeVarInt(data.durationTicks);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PlayerStartItemCooldown {
        return {
            itemCategory: stream.readString(),
            durationTicks: stream.readVarInt()
        };
    }
}
