import FieldNetworkPacket from '../FieldNetworkPacket';

/**
 * A map being locked at a cartography table.
 *
 * Sent by the client when the player takes the locked copy. The server makes a new map from
 * the original, which stops tracking the world, and follows up with the usual
 * `ClientboundMapItemDataPacket` for the new id.
 *
 * Wire layout at protocol 2193: Original Map Id then New Map Id, both ZigZag varint64.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/map-create-locked-copy-packet/
 */
export default class MapCreateLockedCopyPacket extends FieldNetworkPacket {
    /** Id of the map being copied. */
    public originalMapId = 0n;

    /** Id the locked copy should be given. */
    public newMapId = 0n;

    /** Reads both map ids. */
    public decodePayload(): void {
        this.originalMapId = this.readVarLong();
        this.newMapId = this.readVarLong();
    }

    /** Writes both map ids. */
    public encodePayload(): void {
        this.writeVarLong(this.originalMapId);
        this.writeVarLong(this.newMapId);
    }
}
