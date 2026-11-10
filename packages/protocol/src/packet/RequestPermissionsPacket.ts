import { PlayerPermissionLevel } from '@jsprismarine/minecraft';

import { requestPermissionsPacket } from '../wire/definitions/requestPermissions';
import { layoutAt } from '../wire/WireLayout';

import FieldNetworkPacket from '../FieldNetworkPacket';

/**
 * An operator asking the server to change another player's permission level.
 *
 * Wire layout at protocol 2193: Target Player Id's Raw ID as an int64 LE (an actor unique id
 * written fixed width, not as a varint), Player Permission Level as a ZigZag varint32, then
 * Custom Permission Flags as a uint16 LE bit set that only matters at the `Custom` level.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/request-permissions-packet/
 */
export default class RequestPermissionsPacket extends FieldNetworkPacket {
    /** Unique id of the player whose level should change. */
    public targetPlayerUniqueId = 0n;

    /** The level requested, see `PlayerPermissionLevel`. */
    public playerPermissionLevel = PlayerPermissionLevel.VISITOR;

    /** Per-permission bits that apply when the level is `Custom`. */
    public customPermissionFlags = 0;

    /** Reads the target, the level, and the custom flags. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(requestPermissionsPacket, this.codecProtocol).decode(this));
    }

    /** Writes the target, the level, and the custom flags. */
    public encodePayload(): void {
        layoutAt(requestPermissionsPacket, this.codecProtocol).encode(this, this);
    }
}
