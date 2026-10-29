import LevelChunkPacket from './LevelChunkPacket';

/**
 * `LevelChunkPacket` at protocol 2225, which appends one field to the 2193 layout:
 * `Is Client Biome Update` as a trailing boolean, saying whether the chunk's biome data
 * overrides what the client computed itself.
 *
 * Verified against the v1.26.60 `metadata.zip` (`LevelChunkPacketPayload.json`, ordinal 7,
 * after the serialized chunk data) and gophertunnel's `LevelChunk.Marshal` at v1.63.0
 * (`io.Bool(&pk.ClientBiomeUpdate)` last), which agree. Nothing before it changed.
 */
export default class LevelChunkPacket2225 extends LevelChunkPacket {
    /** Is Client Biome Update: whether the server's biome data overrides the client's. */
    public isClientBiomeUpdate = false;

    /** The base packet's name, so handlers and name-keyed id lookups never see the version suffix. */
    public override getName(): string {
        return 'LevelChunkPacket';
    }

    /** Writes the 2193 fields, then the trailing Is Client Biome Update boolean. */
    public override encodePayload(): void {
        super.encodePayload();
        this.writeBoolean(this.isClientBiomeUpdate);
    }

    /** Reads the 2193 fields back, then the trailing Is Client Biome Update boolean. */
    public override decodePayload(): void {
        super.decodePayload();
        this.isClientBiomeUpdate = this.readBoolean();
    }
}
