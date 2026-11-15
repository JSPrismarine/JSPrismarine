import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import {
    EntityOverrideUpdateType,
    playerUpdateEntityOverridesPacket
} from '../wire/definitions/playerUpdateEntityOverrides';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type {
    EntityOverrideUpdate,
    PlayerUpdateEntityOverrides
} from '../wire/definitions/playerUpdateEntityOverrides';

export { EntityOverrideUpdateType };
export type { EntityOverrideUpdate, PlayerUpdateEntityOverrides };

/**
 * Overrides one entity property on one client, removes that override, or clears every
 * override the client holds for the entity.
 *
 * Protocol 2193 layout, in wire order: `Target ID` as a ZigZag varint64, `Property Index` as
 * a varuint32, then `Update` as a Cereal tagged variant: a varuint32 selector (the
 * {@link EntityOverrideUpdateType} value), the alternative's `Type` string (a varuint32 byte
 * length then UTF-8), and for `IntOverride` a little-endian int32 `Value` or for
 * `FloatOverride` a little-endian float `Value`. `ClearOverride` and `RemoveOverride` end
 * after the string.
 *
 * Mojang's notes for 2193 say the packet moved to Cereal and its wire format is not
 * compatible with earlier protocols: the value is now part of the alternative's schema
 * instead of a conditional after a one byte type.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/player-update-entity-overrides-packet/
 */
export default class PlayerUpdateEntityOverridesPacket extends NetworkPacket<PlayerUpdateEntityOverrides> {
    public get id(): number {
        return PacketIdentifier.PLAYER_UPDATE_ENTITY_OVERRIDES;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: PlayerUpdateEntityOverrides): void {
        layoutAt(playerUpdateEntityOverridesPacket, this.codecProtocol).encode(stream, data);
    }

    /**
     * Reads the payload. The `Type` string is read and discarded; the selector alone decides
     * the alternative.
     * @throws when the selector names none of the four alternatives.
     */
    protected deserializePayload(stream: NetworkBinaryStream): PlayerUpdateEntityOverrides {
        return layoutAt(playerUpdateEntityOverridesPacket, this.codecProtocol).decode(stream);
    }
}
