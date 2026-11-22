import { mapCreateLockedCopyPacket } from '../wire/definitions/mapCreateLockedCopy';
import { layoutAt } from '../../wire/WireLayout';

import FieldNetworkPacket from '../../FieldNetworkPacket';

/**
 * A map being locked at a cartography table.
 *
 * Sent by the client when the player takes the locked copy. The server makes a new map from
 * the original, which stops tracking the world, and follows up with the usual
 * `ClientboundMapItemDataPacket` for the new id.
 *
 * Wire layout at protocol 2193: Original Map Id then New Map Id, both ZigZag varint64.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/map-create-locked-copy-packet/
 */
export default class MapCreateLockedCopyPacket extends FieldNetworkPacket {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'MapCreateLockedCopyPacket';
    }

    /** Id of the map being copied. */
    public originalMapId = 0n;

    /** Id the locked copy should be given. */
    public newMapId = 0n;

    /** Reads both map ids. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(mapCreateLockedCopyPacket, this.codecProtocol).decode(this));
    }

    /** Writes both map ids. */
    public encodePayload(): void {
        layoutAt(mapCreateLockedCopyPacket, this.codecProtocol).encode(this, this);
    }
}
